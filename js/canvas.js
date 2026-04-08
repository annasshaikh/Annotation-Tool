/**
 * canvas.js — Image Canvas Engine
 *
 * Handles:
 *  - Image rendering with pan & zoom
 *  - Bounding Box drawing tool
 *  - Polygon/Segmentation tool (click-to-add vertices)
 *  - Trace tool (freehand pencil — mouse-drag to draw, auto-closes loop)
 *  - Select & move annotations
 *  - Drawing existing annotations from state
 *  - Annotation hit-testing and selection
 */

const CanvasEngine = (() => {
  // ── DOM refs ─────────────────────────────────────────────────────────────────
  let canvas, ctx, container;

  // ── Transform state ───────────────────────────────────────────────────────────
  let scale   = 1;
  let offsetX = 0;
  let offsetY = 0;
  let imgW    = 0;
  let imgH    = 0;
  let currentImg = null;

  // ── Interaction state ─────────────────────────────────────────────────────────
  let activeTool             = 'select';
  let activeAnnotationTypeId = 'cell_bbox';
  let isDrawing  = false;
  let isPanning  = false;
  let drawStart  = null;
  let drawCurrent = null;
  let polygonPoints = [];     // for polygon tool (click-to-add)
  let tracePoints   = [];     // for trace tool (freehand)
  let panStart   = null;
  let selectedAnnId = null;
  let dragAnn    = null;
  let nearLoopClose = false;  // true when trace cursor is close to start

  const LOOP_CLOSE_RADIUS_PX = 14; // px in canvas space to snap-close

  // ── Colour helpers ────────────────────────────────────────────────────────────
  const COLOURS = {
    selected:  '#FFD700',
    drawGuide: 'rgba(255,215,0,0.5)',
    pseudo:    '#D29922',
    pseudoFill:'rgba(210,153,34,0.08)',
    handle:    '#FFFFFF',
    textBg:    'rgba(0,0,0,0.60)',
  };

  function hexToRgb(hex) {
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return r ? { r: parseInt(r[1],16), g: parseInt(r[2],16), b: parseInt(r[3],16) } : null;
  }

  function resolveColours(ann) {
    if (ann.pseudo) return { stroke: COLOURS.pseudo, fill: COLOURS.pseudoFill };
    const cfg = ConfigManager.getAnnotationType(ann.annotationType);
    if (cfg) {
      const rgb = hexToRgb(cfg.color);
      const op  = cfg.fillOpacity ?? 0.08;
      return {
        stroke: cfg.color,
        fill:   rgb ? `rgba(${rgb.r},${rgb.g},${rgb.b},${op})` : 'rgba(79,195,247,0.08)',
      };
    }
    return ann.type === 'bbox'
      ? { stroke: '#4FC3F7', fill: 'rgba(79,195,247,0.08)' }
      : { stroke: '#3FB950', fill: 'rgba(63,185,80,0.08)' };
  }

  function activeDrawColour() {
    const cfg = ConfigManager.getAnnotationType(activeAnnotationTypeId);
    return cfg ? cfg.color : '#FFD700';
  }

  // ── Init ──────────────────────────────────────────────────────────────────────
  function init(canvasEl, containerEl) {
    canvas    = canvasEl;
    ctx       = canvas.getContext('2d');
    container = containerEl;

    canvas.addEventListener('mousedown',   onMouseDown);
    canvas.addEventListener('mousemove',   onMouseMove);
    canvas.addEventListener('mouseup',     onMouseUp);
    canvas.addEventListener('mouseleave',  onMouseLeave);
    canvas.addEventListener('wheel',       onWheel, { passive: false });
    canvas.addEventListener('dblclick',    onDblClick);
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    const ro = new ResizeObserver(() => resizeCanvas());
    ro.observe(container);
    resizeCanvas();
  }

  function resizeCanvas() {
    canvas.width  = container.clientWidth;
    canvas.height = container.clientHeight;
    render();
  }

  // ── Coordinate Helpers ────────────────────────────────────────────────────────
  function clientToCanvas(cx, cy) {
    const rect = canvas.getBoundingClientRect();
    return { x: cx - rect.left, y: cy - rect.top };
  }
  function canvasToImage(cx, cy) {
    return { x: (cx - offsetX) / scale, y: (cy - offsetY) / scale };
  }
  function imageToCanvas(ix, iy) {
    return { x: ix * scale + offsetX, y: iy * scale + offsetY };
  }
  function clampToImage(x, y) {
    return { x: Math.max(0, Math.min(imgW, x)), y: Math.max(0, Math.min(imgH, y)) };
  }

  // ── Zoom & Pan ────────────────────────────────────────────────────────────────
  function zoomAt(mouseX, mouseY, factor) {
    const newScale = Math.min(32, Math.max(0.05, scale * factor));
    const sf = newScale / scale;
    offsetX = mouseX - sf * (mouseX - offsetX);
    offsetY = mouseY - sf * (mouseY - offsetY);
    scale   = newScale;
    updateStatusZoom();
    render();
  }

  function fitToWindow() {
    if (!currentImg) return;
    const cw = canvas.width, ch = canvas.height;
    const pad = 48;
    const sx = (cw - pad * 2) / imgW;
    const sy = (ch - pad * 2) / imgH;
    scale   = Math.min(sx, sy);
    offsetX = cw / 2 - (imgW * scale) / 2;
    offsetY = ch / 2 - (imgH * scale) / 2;
    updateStatusZoom();
    render();
  }

  function zoomIn()  { zoomAt(canvas.width / 2, canvas.height / 2, 1.25); }
  function zoomOut() { zoomAt(canvas.width / 2, canvas.height / 2, 0.8);  }

  function updateStatusZoom() {
    const el = document.getElementById('status-zoom');
    if (el) el.textContent = `${Math.round(scale * 100)}%`;
  }

  // ── Image Loading ─────────────────────────────────────────────────────────────
  function loadImage(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        currentImg    = img;
        imgW          = img.naturalWidth;
        imgH          = img.naturalHeight;
        selectedAnnId = null;
        polygonPoints = [];
        tracePoints   = [];
        isDrawing     = false;
        fitToWindow();
        resolve();
      };
      img.src = dataUrl;
    });
  }

  function clearImage() {
    currentImg = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // ── Main Render ───────────────────────────────────────────────────────────────
  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!currentImg) return;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    ctx.drawImage(currentImg, 0, 0, imgW, imgH);

    const annotations = State.getAnnotations();
    annotations.forEach(ann => drawAnnotation(ann, ann.id === selectedAnnId));

    if (isDrawing) {
      if (activeTool === 'bbox' && drawStart && drawCurrent) {
        drawRectGuide(drawStart, drawCurrent, activeDrawColour());
      }
      if (activeTool === 'polygon' && polygonPoints.length > 0) {
        drawPolygonGuide(activeDrawColour());
      }
      if (activeTool === 'trace') {
        drawTraceGuide(activeDrawColour());
      }
    }

    ctx.restore();

    // Draw loop-close indicator in canvas space (after restore, so it uses px coords)
    if (activeTool === 'trace' && isDrawing && tracePoints.length > 3 && nearLoopClose) {
      drawLoopCloseIndicator();
    }
  }

  // ── Drawing committed annotations ─────────────────────────────────────────────
  function drawAnnotation(ann, selected) {
    if (ann.type === 'bbox')    drawBBox(ann, selected);
    if (ann.type === 'polygon') drawPolygon(ann, selected);
    if (ann.type === 'trace')   drawTrace(ann, selected);
  }

  function drawBBox(ann, selected) {
    const { x, y, w, h } = ann.coords;
    const { stroke, fill } = resolveColours(ann);
    const colour = selected ? COLOURS.selected : stroke;

    ctx.fillStyle   = fill;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = colour;
    ctx.lineWidth   = (selected ? 2 : 1.5) / scale;
    ctx.strokeRect(x, y, w, h);

    // Label badge
    const cfg = ConfigManager.getAnnotationType(ann.annotationType);
    const labelText = cfg ? cfg.label : (ann.label || 'bbox');
    drawLabelBadge(x, y - 15 / scale, labelText, colour);

    if (selected) {
      drawHandles([
        { x, y }, { x: x + w, y }, { x, y: y + h }, { x: x + w, y: y + h },
        { x: x + w / 2, y }, { x: x + w / 2, y: y + h }, { x, y: y + h / 2 }, { x: x + w, y: y + h / 2 }
      ], colour);
    }
  }

  function drawPolygon(ann, selected) {
    const pts = ann.coords.points;
    if (!pts || pts.length < 2) return;
    const { stroke, fill } = resolveColours(ann);
    const colour = selected ? COLOURS.selected : stroke;

    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    pts.slice(1).forEach(p => ctx.lineTo(p[0], p[1]));
    ctx.closePath();
    ctx.fillStyle   = fill;
    ctx.fill();
    ctx.strokeStyle = colour;
    ctx.lineWidth   = (selected ? 2 : 1.5) / scale;
    ctx.stroke();

    // Centroid label
    const cfg = ConfigManager.getAnnotationType(ann.annotationType);
    if (cfg && pts.length >= 2) {
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      drawLabelBadge(cx, cy, cfg.label, colour, true);
    }

    if (selected) drawHandles(pts.map(p => ({ x: p[0], y: p[1] })), colour);
  }

  /** Draw a freehand trace annotation with pencil-like strokes */
  function drawTrace(ann, selected) {
    const pts = ann.coords.points;
    if (!pts || pts.length < 2) return;
    const { stroke } = resolveColours(ann);
    const colour = selected ? COLOURS.selected : stroke;

    // ── Pencil-like rendering: thin jittered strokes ──────────────────────────
    ctx.save();
    ctx.strokeStyle = colour;
    ctx.lineWidth   = (selected ? 2.2 : 1.4) / scale;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    // Slight shadow for pencil feel
    ctx.shadowColor  = colour;
    ctx.shadowBlur   = 1.5 / scale;

    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      // Catmull-Rom smoothing: draw through control points
      const p0 = pts[Math.max(0, i - 2)];
      const p1 = pts[i - 1];
      const p2 = pts[i];
      const p3 = pts[Math.min(pts.length - 1, i + 1)];
      const cpx1 = p1[0] + (p2[0] - p0[0]) / 6;
      const cpy1 = p1[1] + (p2[1] - p0[1]) / 6;
      const cpx2 = p2[0] - (p3[0] - p1[0]) / 6;
      const cpy2 = p2[1] - (p3[1] - p1[1]) / 6;
      ctx.bezierCurveTo(cpx1, cpy1, cpx2, cpy2, p2[0], p2[1]);
    }
    ctx.closePath();

    // Semi-transparent fill
    const rgb = hexToRgb(colour);
    ctx.fillStyle = rgb ? `rgba(${rgb.r},${rgb.g},${rgb.b},0.06)` : 'transparent';
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Loop-closed indicator dot
    const first = pts[0];
    const c = imageToCanvas(first[0], first[1]);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // reset transform for px-based drawing
    ctx.beginPath();
    ctx.arc(c.x, c.y, 5, 0, Math.PI * 2);
    ctx.fillStyle   = colour;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    ctx.restore();

    // Centroid label
    const cfg = ConfigManager.getAnnotationType(ann.annotationType);
    if (cfg) {
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      drawLabelBadge(cx, cy, cfg.label, colour, true);
    }

    if (selected) drawHandles(pts.filter((_, i) => i % Math.max(1, Math.floor(pts.length / 20)) === 0).map(p => ({ x: p[0], y: p[1] })), colour);
  }

  // ── Handle & Badge Helpers ────────────────────────────────────────────────────
  function drawHandles(points, colour) {
    const r = 4 / scale;
    points.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle   = colour;
      ctx.fill();
      ctx.strokeStyle = COLOURS.handle;
      ctx.lineWidth   = 1 / scale;
      ctx.stroke();
    });
  }

  function drawLabelBadge(x, y, text, colour, centered = false) {
    ctx.save();
    ctx.font = `bold ${Math.max(9, 11 / scale)}px Inter, sans-serif`;
    const textW = ctx.measureText(text).width + 8 / scale;
    const bx = centered ? x - textW / 2 : x;
    ctx.fillStyle = COLOURS.textBg;
    ctx.fillRect(bx, y, textW, 14 / scale);
    ctx.fillStyle = colour;
    ctx.fillText(text, bx + 4 / scale, y + 10 / scale);
    ctx.restore();
  }

  // ── In-progress guides ────────────────────────────────────────────────────────
  function drawRectGuide(start, end, guideColor) {
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x);
    const h = Math.abs(end.y - start.y);
    const col = guideColor || COLOURS.selected;
    ctx.strokeStyle = col;
    ctx.lineWidth   = 1.5 / scale;
    ctx.setLineDash([4 / scale, 3 / scale]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    const rgb = hexToRgb(col);
    ctx.fillStyle = rgb ? `rgba(${rgb.r},${rgb.g},${rgb.b},0.1)` : COLOURS.drawGuide;
    ctx.fillRect(x, y, w, h);
  }

  function drawPolygonGuide(guideColor) {
    if (polygonPoints.length === 0) return;
    const col = guideColor || COLOURS.selected;
    ctx.strokeStyle = col;
    ctx.lineWidth   = 1.5 / scale;
    ctx.setLineDash([4 / scale, 3 / scale]);
    ctx.beginPath();
    ctx.moveTo(polygonPoints[0].x, polygonPoints[0].y);
    polygonPoints.forEach(p => ctx.lineTo(p.x, p.y));
    if (drawCurrent) ctx.lineTo(drawCurrent.x, drawCurrent.y);
    ctx.stroke();
    ctx.setLineDash([]);
    polygonPoints.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4 / scale, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? COLOURS.selected : col;
      ctx.fill();
    });
  }

  /** Pencil-like freehand guide while drawing a trace */
  function drawTraceGuide(guideColor) {
    if (tracePoints.length < 2) return;
    const col = guideColor || '#FFD700';

    ctx.save();
    ctx.strokeStyle = col;
    ctx.lineWidth   = 1.6 / scale;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.shadowColor = col;
    ctx.shadowBlur  = 1.2 / scale;
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.moveTo(tracePoints[0].x, tracePoints[0].y);
    for (let i = 1; i < tracePoints.length; i++) {
      const p0 = tracePoints[Math.max(0, i - 2)];
      const p1 = tracePoints[i - 1];
      const p2 = tracePoints[i];
      const p3 = tracePoints[Math.min(tracePoints.length - 1, i + 1)];
      const cpx1 = p1.x + (p2.x - p0.x) / 6;
      const cpy1 = p1.y + (p2.y - p0.y) / 6;
      const cpx2 = p2.x - (p3.x - p1.x) / 6;
      const cpy2 = p2.y - (p3.y - p1.y) / 6;
      ctx.bezierCurveTo(cpx1, cpy1, cpx2, cpy2, p2.x, p2.y);
    }
    if (drawCurrent && !nearLoopClose) ctx.lineTo(drawCurrent.x, drawCurrent.y);
    ctx.stroke();

    // Start dot
    ctx.beginPath();
    ctx.arc(tracePoints[0].x, tracePoints[0].y, 4 / scale, 0, Math.PI * 2);
    ctx.fillStyle   = nearLoopClose ? '#fff' : col;
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth   = 1 / scale;
    ctx.stroke();

    ctx.restore();
  }

  /** Green "✓ close loop" ring drawn in canvas (pixel) space */
  function drawLoopCloseIndicator() {
    if (!tracePoints.length) return;
    const start = imageToCanvas(tracePoints[0].x, tracePoints[0].y);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath();
    ctx.arc(start.x, start.y, LOOP_CLOSE_RADIUS_PX, 0, Math.PI * 2);
    ctx.strokeStyle = '#4CD964';
    ctx.lineWidth   = 2;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    // "✓" text
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillStyle = '#4CD964';
    ctx.fillText('✓ close', start.x + LOOP_CLOSE_RADIUS_PX + 4, start.y + 4);
    ctx.restore();
  }

  // ── Hit Testing ───────────────────────────────────────────────────────────────
  function hitTest(imgPt) {
    const annotations = State.getAnnotations();
    for (let i = annotations.length - 1; i >= 0; i--) {
      const ann = annotations[i];
      if (ann.type === 'bbox') {
        const { x, y, w, h } = ann.coords;
        const margin = 5 / scale;
        if (imgPt.x >= x - margin && imgPt.x <= x + w + margin &&
            imgPt.y >= y - margin && imgPt.y <= y + h + margin) return ann;
      }
      if (ann.type === 'polygon' || ann.type === 'trace') {
        if (pointInPolygon(imgPt, ann.coords.points)) return ann;
      }
    }
    return null;
  }

  function pointInPolygon(pt, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i][0], yi = points[i][1];
      const xj = points[j][0], yj = points[j][1];
      if (((yi > pt.y) !== (yj > pt.y)) &&
          (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  // ── Mouse Events ─────────────────────────────────────────────────────────────
  function onMouseDown(e) {
    if (!currentImg) return;
    const cPos = clientToCanvas(e.clientX, e.clientY);
    const iPos = clampToImage(...Object.values(canvasToImage(cPos.x, cPos.y)));

    if (activeTool === 'select') {
      if (e.button === 1 || e.altKey) {
        isPanning = true;
        panStart  = { x: e.clientX, y: e.clientY, ox: offsetX, oy: offsetY };
        canvas.style.cursor = 'grabbing';
        return;
      }
      const hit = hitTest(canvasToImage(cPos.x, cPos.y));
      if (hit) {
        selectedAnnId = hit.id;
        dragAnn = { id: hit.id, startMouseX: cPos.x, startMouseY: cPos.y, origCoords: JSON.parse(JSON.stringify(hit.coords)) };
        canvas.style.cursor = 'move';
      } else {
        selectedAnnId = null;
        isPanning = true;
        panStart  = { x: e.clientX, y: e.clientY, ox: offsetX, oy: offsetY };
        canvas.style.cursor = 'grabbing';
      }
      notifySelectionChanged();
      render();
      return;
    }

    if (activeTool === 'bbox') {
      isDrawing   = true;
      drawStart   = { x: iPos.x, y: iPos.y };
      drawCurrent = { ...drawStart };
      return;
    }

    if (activeTool === 'polygon') {
      isDrawing = true;
      polygonPoints.push({ x: iPos.x, y: iPos.y });
      render();
      return;
    }

    if (activeTool === 'trace') {
      isDrawing   = true;
      tracePoints = [{ x: iPos.x, y: iPos.y }];
      nearLoopClose = false;
      render();
      return;
    }
  }

  function onMouseMove(e) {
    if (!currentImg) return;
    const cPos = clientToCanvas(e.clientX, e.clientY);
    const iPos = canvasToImage(cPos.x, cPos.y);

    if (isPanning && panStart) {
      offsetX = panStart.ox + (e.clientX - panStart.x);
      offsetY = panStart.oy + (e.clientY - panStart.y);
      render();
      return;
    }

    if (dragAnn) {
      const dx = (cPos.x - dragAnn.startMouseX) / scale;
      const dy = (cPos.y - dragAnn.startMouseY) / scale;
      const ann = State.getAnnotations().find(a => a.id === dragAnn.id);
      if (ann && ann.type === 'bbox') {
        const oc = dragAnn.origCoords;
        State.updateAnnotation(ann.id, { coords: { x: oc.x + dx, y: oc.y + dy, w: oc.w, h: oc.h } });
        render();
      }
      return;
    }

    if (isDrawing) {
      const clamped = clampToImage(iPos.x, iPos.y);
      drawCurrent   = { x: clamped.x, y: clamped.y };

      if (activeTool === 'trace' && tracePoints.length > 0) {
        // Throttle points (add every ~3 canvas px)
        const last = tracePoints[tracePoints.length - 1];
        const distSq = (clamped.x - last.x) ** 2 + (clamped.y - last.y) ** 2;
        const threshSq = (3 / scale) ** 2;
        if (distSq > threshSq) tracePoints.push({ x: clamped.x, y: clamped.y });

        // Check proximity to start for loop close
        if (tracePoints.length > 5) {
          const start = imageToCanvas(tracePoints[0].x, tracePoints[0].y);
          const dx = cPos.x - start.x;
          const dy = cPos.y - start.y;
          nearLoopClose = (dx * dx + dy * dy) < LOOP_CLOSE_RADIUS_PX ** 2;
        }
      }

      render();
      return;
    }

    if (activeTool === 'select') {
      const hit = hitTest(iPos);
      canvas.style.cursor = hit ? 'move' : 'default';
    }
    if (activeTool === 'trace') {
      canvas.style.cursor = 'crosshair';
    }
  }

  function onMouseUp(e) {
    if (!currentImg) return;

    if (isPanning) {
      isPanning = false;
      panStart  = null;
      canvas.style.cursor = activeTool === 'select' ? 'default' : 'crosshair';
      return;
    }

    if (dragAnn) {
      dragAnn = null;
      canvas.style.cursor = 'move';
      return;
    }

    if (activeTool === 'bbox' && isDrawing && drawStart && drawCurrent) {
      const x = Math.min(drawStart.x, drawCurrent.x);
      const y = Math.min(drawStart.y, drawCurrent.y);
      const w = Math.abs(drawCurrent.x - drawStart.x);
      const h = Math.abs(drawCurrent.y - drawStart.y);
      if (w > 3 && h > 3) {
        const cfg = ConfigManager.getAnnotationType(activeAnnotationTypeId);
        const id  = State.addAnnotation({
          type:           'bbox',
          annotationType: activeAnnotationTypeId,
          coords:         { x, y, w, h },
          label:          cfg ? cfg.label : activeAnnotationTypeId,
          pseudo:         false,
        });
        selectedAnnId = id;
        notifyAnnotationAdded(id);
      }
      isDrawing   = false;
      drawStart   = null;
      drawCurrent = null;
      render();
      return;
    }

    if (activeTool === 'trace' && isDrawing) {
      if (nearLoopClose || tracePoints.length > 10) {
        commitTrace();
      } else {
        // Minimum points not reached — cancel
        tracePoints   = [];
        isDrawing     = false;
        nearLoopClose = false;
        render();
      }
    }
  }

  function onMouseLeave() {
    if (isDrawing && activeTool === 'bbox') {
      isDrawing = false;
      drawStart = null;
      render();
    }
    if (isDrawing && activeTool === 'trace') {
      // Auto-commit whatever trace we have when mouse leaves
      if (tracePoints.length > 5) commitTrace();
      else {
        tracePoints = [];
        isDrawing   = false;
        nearLoopClose = false;
        render();
      }
    }
    if (isPanning) isPanning = false;
  }

  function onDblClick(e) {
    if (activeTool === 'polygon' && polygonPoints.length >= 3) {
      commitPolygon();
    }
  }

  function onWheel(e) {
    e.preventDefault();
    const cPos = clientToCanvas(e.clientX, e.clientY);
    zoomAt(cPos.x, cPos.y, e.deltaY < 0 ? 1.15 : 0.87);
  }

  // ── Commit Tools ──────────────────────────────────────────────────────────────
  function commitPolygon() {
    if (polygonPoints.length < 3) return;
    const points = polygonPoints.map(p => [p.x, p.y]);
    const cfg = ConfigManager.getAnnotationType(activeAnnotationTypeId);
    const id  = State.addAnnotation({
      type:           'polygon',
      annotationType: activeAnnotationTypeId,
      coords:         { points },
      label:          cfg ? cfg.label : activeAnnotationTypeId,
      pseudo:         false,
    });
    selectedAnnId = id;
    polygonPoints = [];
    isDrawing     = false;
    notifyAnnotationAdded(id);
    render();
  }

  function commitTrace() {
    if (tracePoints.length < 3) return;
    const points = tracePoints.map(p => [p.x, p.y]);
    const cfg = ConfigManager.getAnnotationType(activeAnnotationTypeId);
    const id  = State.addAnnotation({
      type:           'trace',
      annotationType: activeAnnotationTypeId,
      coords:         { points },
      label:          cfg ? cfg.label : activeAnnotationTypeId,
      pseudo:         false,
    });
    selectedAnnId = id;
    tracePoints   = [];
    isDrawing     = false;
    nearLoopClose = false;
    notifyAnnotationAdded(id);
    render();
  }

  function cancelCurrentDraw() {
    isDrawing     = false;
    drawStart     = null;
    drawCurrent   = null;
    polygonPoints = [];
    tracePoints   = [];
    nearLoopClose = false;
    render();
  }

  // ── External API ──────────────────────────────────────────────────────────────
  function setTool(tool) {
    activeTool = tool;
    cancelCurrentDraw();
    if (tool === 'trace') {
      canvas.style.cursor = 'url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIj48cGF0aCBkPSJNMy41IDIwLjVsMTYtMTZjLjQtLjQgMS0uNCAxLjQgMGwuNi42Yy40LjQgLjQuOSAwIDEuM0w1LjUgMjIuNWwtNCAuNC40LTQuMnoiIGZpbGw9IndoaXRlIiBzdHJva2U9ImJsYWNrIiBzdHJva2Utd2lkdGg9Ii41Ii8+PC9zdmc+") 0 24, crosshair';
    } else {
      canvas.style.cursor = tool === 'select' ? 'default' : 'crosshair';
    }
    const el = document.getElementById('status-tool');
    if (el) el.textContent = `Tool: ${tool.charAt(0).toUpperCase() + tool.slice(1)}`;
  }

  function setAnnotationType(id) {
    activeAnnotationTypeId = id;
    const cfg = ConfigManager.getAnnotationType(id);
    if (cfg && cfg.tool !== activeTool && activeTool !== 'select') {
      setTool(cfg.tool);
    }
  }

  function getActiveAnnotationTypeId() { return activeAnnotationTypeId; }

  function deleteSelected() {
    if (!selectedAnnId) return;
    State.deleteAnnotation(selectedAnnId);
    selectedAnnId = null;
    notifyAnnotationAdded(null);
    render();
  }

  function selectAnnotation(id) {
    selectedAnnId = id;
    render();
  }

  function applyPseudoResult(result) {
    if (result.boxes) {
      result.boxes.forEach(b => {
        const typeId = b.annotationType || ConfigManager.getDefaultAnnotationTypeId('bbox') || 'cell_bbox';
        const cfg    = ConfigManager.getAnnotationType(typeId);
        State.addAnnotation({
          type:           'bbox',
          annotationType: typeId,
          coords:         { x: b.x * imgW, y: b.y * imgH, w: b.w * imgW, h: b.h * imgH },
          label:          cfg ? cfg.label : (b.label || 'cell'),
          confidence:     b.confidence,
          pseudo:         true,
        });
      });
    }
    if (result.polygons) {
      result.polygons.forEach(poly => {
        const typeId = poly.annotationType || ConfigManager.getDefaultAnnotationTypeId('polygon') || 'cell_wall';
        const cfg    = ConfigManager.getAnnotationType(typeId);
        State.addAnnotation({
          type:           'polygon',
          annotationType: typeId,
          coords:         { points: poly.points.map(p => [p[0] * imgW, p[1] * imgH]) },
          label:          cfg ? cfg.label : (poly.label || 'cell'),
          confidence:     poly.confidence,
          pseudo:         true,
        });
      });
    }
    render();
  }

  // ── Callbacks ─────────────────────────────────────────────────────────────────
  let _onAnnotationAdded  = () => {};
  let _onSelectionChanged = () => {};

  function onAnnotationAdded(cb)  { _onAnnotationAdded  = cb; }
  function onSelectionChanged(cb) { _onSelectionChanged = cb; }

  function notifyAnnotationAdded(id)  { _onAnnotationAdded(id);  }
  function notifySelectionChanged()   { _onSelectionChanged(selectedAnnId); }

  return {
    init, loadImage, clearImage, render,
    fitToWindow, zoomIn, zoomOut,
    setTool, setAnnotationType, getActiveAnnotationTypeId,
    deleteSelected, selectAnnotation,
    applyPseudoResult, cancelCurrentDraw, commitPolygon, commitTrace,
    onAnnotationAdded, onSelectionChanged,
  };
})();
