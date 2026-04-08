/**
 * app.js — Main Application Orchestrator
 *
 * Wires together: State, CanvasEngine, Panel, PseudoBackend,
 * ConfigPanel, UI events, TIFF loading, keyboard shortcuts.
 */

// ── App-level state ────────────────────────────────────────────────────────────
let appMode     = 'manual';  // 'manual' | 'pseudo'
let imageFileMap = {};        // { name: File } for sending to backend

// ══════════════════════════════════════════════════════════════════════════════
//  Init
// ══════════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // Restore config from localStorage if previously saved
  try {
    const savedCfg = localStorage.getItem('cellannotate_config');
    if (savedCfg) ConfigManager.loadFromJSON(savedCfg);
  } catch(e) {}

  Panel.init();
  CanvasEngine.init(
    document.getElementById('main-canvas'),
    document.getElementById('canvas-container')
  );

  CanvasEngine.onAnnotationAdded(() => {
    refreshAnnotationList();
    updateAnnotationCount();
    markUnsaved();
  });
  CanvasEngine.onSelectionChanged(id => {
    refreshAnnotationList(id);
  });

  buildAnnotationTypePicker();

  bindNavbar();
  bindToolbar();
  bindRightPanel();
  bindPseudoModal();
  bindKeyboard();
  bindDragDrop();

  PseudoBackend.syncUI();
  updateProjectName();
});

// ══════════════════════════════════════════════════════════════════════════════
//  Annotation Type Picker (dynamic from config)
// ══════════════════════════════════════════════════════════════════════════════
function buildAnnotationTypePicker() {
  const group = document.getElementById('annotation-type-group');
  if (!group) return;
  group.innerHTML = '';
  const types = ConfigManager.get().annotationTypes || [];

  types.forEach((typeDef, idx) => {
    const btn = document.createElement('button');
    btn.className   = 'tool-btn ann-type-btn';
    btn.id          = `anntype-${typeDef.id}`;
    btn.title       = `${typeDef.label}  [${idx + 1}]`;
    btn.dataset.anntype = typeDef.id;

    const toolIcon = typeDef.tool === 'bbox'
      ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${typeDef.color}" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="1"/><circle cx="3" cy="3" r="1.5" fill="${typeDef.color}"/><circle cx="21" cy="3" r="1.5" fill="${typeDef.color}"/><circle cx="3" cy="21" r="1.5" fill="${typeDef.color}"/><circle cx="21" cy="21" r="1.5" fill="${typeDef.color}"/></svg>`
      : (typeDef.tool === 'trace'
          ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${typeDef.color}" stroke-width="2"><path d="M3 20L7 13 12 17 17 9 21 4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
          : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${typeDef.color}" stroke-width="2.5"><polygon points="12,2 22,8 22,16 12,22 2,16 2,8"/></svg>`);

    btn.innerHTML = `
      <span class="ann-type-swatch" style="background:${typeDef.color}"></span>
      ${toolIcon}
      <span>${typeDef.label}</span>
    `;

    btn.addEventListener('click', () => selectAnnotationType(typeDef.id));
    group.appendChild(btn);
  });

  if (types.length > 0) selectAnnotationType(types[0].id);
}

function selectAnnotationType(id) {
  document.querySelectorAll('.ann-type-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(`anntype-${id}`);
  if (btn) btn.classList.add('active');

  document.getElementById('tool-select')?.classList.remove('active');
  CanvasEngine.setAnnotationType(id);

  const cfg = ConfigManager.getAnnotationType(id);
  if (cfg) {
    CanvasEngine.setTool(cfg.tool);
    const el = document.getElementById('status-tool');
    if (el) el.textContent = `Type: ${cfg.label}`;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  Navbar Bindings
// ══════════════════════════════════════════════════════════════════════════════
function bindNavbar() {
  // Images
  const inputImg = document.getElementById('image-file-input');
  document.getElementById('btn-upload-image').addEventListener('click',       () => inputImg.click());
  document.getElementById('btn-upload-image-empty')?.addEventListener('click', () => inputImg.click());
  inputImg.addEventListener('change', e => handleImageFiles(e.target.files));

  // Folder
  const inputFld = document.getElementById('folder-file-input');
  document.getElementById('btn-upload-folder').addEventListener('click',       () => inputFld.click());
  document.getElementById('btn-upload-folder-empty')?.addEventListener('click', () => inputFld.click());
  inputFld.addEventListener('change', e => handleImageFiles(e.target.files));

  // Config import
  const inputConf = document.getElementById('config-file-input');
  document.getElementById('btn-import-config').addEventListener('click', () => inputConf.click());
  inputConf.addEventListener('change', e => handleConfigFile(e.target.files[0]));

  // Config panel
  document.getElementById('btn-open-config').addEventListener('click', () => ConfigPanel.open());

  // Export
  document.getElementById('btn-export-json').addEventListener('click', exportAnnotations);

  // Project name
  document.getElementById('project-name-input').addEventListener('change', e => {
    ConfigManager.get().project = e.target.value;
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  Left Toolbar Bindings
// ══════════════════════════════════════════════════════════════════════════════
function bindToolbar() {
  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => setTool(btn.dataset.tool));
  });

  document.getElementById('tool-zoom-in').addEventListener('click',  () => CanvasEngine.zoomIn());
  document.getElementById('tool-zoom-out').addEventListener('click', () => CanvasEngine.zoomOut());
  document.getElementById('tool-fit').addEventListener('click',       () => CanvasEngine.fitToWindow());

  document.querySelectorAll('.mode-btn[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  Right Panel Bindings
// ══════════════════════════════════════════════════════════════════════════════
function bindRightPanel() {
  document.getElementById('btn-clear-classifications').addEventListener('click', () => {
    Panel.clearAll();
    showToast('Classifications cleared', 'info');
  });

  document.getElementById('btn-approve').addEventListener('click', () => {
    State.setApproved(true);
    showSaved();
    updateImageStrip();
    showToast('Annotation approved ✓', 'success');
    if (appMode === 'pseudo') navigateImage(1);
  });

  document.getElementById('btn-run-model').addEventListener('click', runPseudoModel);

  document.getElementById('btn-remove-image').addEventListener('click', removeCurrentImage);

  // Status text click → open pseudo modal
  document.getElementById('backend-status-text').addEventListener('click', () => {
    document.getElementById('pseudo-modal-overlay').style.display = 'flex';
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  Navigation
// ══════════════════════════════════════════════════════════════════════════════
document.getElementById('nav-prev').addEventListener('click', () => navigateImage(-1));
document.getElementById('nav-next').addEventListener('click', () => navigateImage(1));

function navigateImage(delta) {
  // Auto-save current before moving
  State.save();
  showSaved();

  const moved = delta > 0 ? State.next() : State.prev();
  if (moved) loadCurrentImage();
  else showToast(delta > 0 ? 'Last image reached' : 'First image', 'info');
}

// ══════════════════════════════════════════════════════════════════════════════
//  TIFF Loading Helper
// ══════════════════════════════════════════════════════════════════════════════
/**
 * Convert a TIFF ArrayBuffer → PNG data URL via UTIF.js
 */
function tiffToPngDataUrl(arrayBuffer) {
  return new Promise((resolve, reject) => {
    try {
      if (typeof UTIF === 'undefined') {
        throw new Error('UTIF library not loaded. Check your internet connection or index.html.');
      }

      const ifds = UTIF.decode(arrayBuffer);
      if (!ifds || ifds.length === 0) throw new Error('Invalid TIFF: No IFDs found');
      
      // Decode the first image in the TIFF
      UTIF.decodeImage(arrayBuffer, ifds[0]);
      const ifd = ifds[0];
      
      // Convert to RGBA8
      const rgba = UTIF.toRGBA8(ifd);
      const w = ifd.width, h = ifd.height;

      // Handle very large images that might crash canvas
      if (w > 16384 || h > 16384) {
        throw new Error(`Image too large (${w}x${h}). Max supported is 16k.`);
      }

      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      const imgData = ctx.createImageData(w, h);
      imgData.data.set(rgba);
      ctx.putImageData(imgData, 0, 0);
      
      const pngUrl = c.toDataURL('image/png');
      if (pngUrl === 'data:,') throw new Error('Canvas conversion failed (possibly out of memory)');
      
      resolve(pngUrl);
    } catch(e) {
      console.error('tiffToPngDataUrl error:', e);
      reject(e);
    }
  });
}


// ══════════════════════════════════════════════════════════════════════════════
//  File Handling
// ══════════════════════════════════════════════════════════════════════════════
async function handleImageFiles(fileList) {
  if (!fileList || fileList.length === 0) return;
  showToast(`Loading ${fileList.length} file(s)…`, 'info');

  const files = Array.from(fileList);
  let totalAdded = 0;

  // Process files one by one to avoid memory spikes (especially for TIFFs)
  for (const f of files) {
    const ext = f.name.split('.').pop().toLowerCase();
    
    if (ext === 'tif' || ext === 'tiff') {
      try {
        const ab  = await f.arrayBuffer();
        const url = await tiffToPngDataUrl(ab);
        
        // Convert to PNG blob so backend receives a standard image format
        const pngBlob = dataUrlToBlob(url, f.name.replace(/\.(tif|tiff)$/i, '.png'));
        if (pngBlob) {
          imageFileMap[f.name] = pngBlob;
          State._addImageRecord(f.name, url);
          totalAdded++;
        }
      } catch (e) {
        console.error('TIFF load error:', e);
        showToast(`Could not load TIFF (${f.name}): ${e.message}`, 'warn', 5000);
      }
    } else {
      // Normal image
      const added = await State.addImages([f]);
      if (added > 0) {
        imageFileMap[f.name] = f;
        totalAdded += added;
      }
    }
  }

  if (totalAdded > 0) {
    showToast(`${totalAdded} image(s) added`, 'success');
    document.getElementById('empty-state').style.display   = 'none';
    document.getElementById('canvas-area').style.display   = 'flex';

    buildImageStrip();
    updateImageCounter();
    loadCurrentImage();
  }
}


function dataUrlToBlob(dataUrl, name) {
  try {
    const [header, data] = dataUrl.split(',');
    const mime = header.match(/:(.*?);/)[1];
    const bytes = atob(data);
    const arr   = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new File([arr], name, { type: mime });
  } catch(e) { return null; }
}

async function handleConfigFile(file) {
  if (!file) return;
  const text = await file.text();
  const ext  = file.name.split('.').pop().toLowerCase();
  let ok = false;
  if (ext === 'json') ok = ConfigManager.loadFromJSON(text);
  else                ok = ConfigManager.loadFromYAML(text);

  if (ok) {
    Panel.rebuild();
    buildAnnotationTypePicker();
    showToast(`Config imported: ${file.name}`, 'success');
  } else {
    showToast('Config import failed — ensure valid JSON', 'error');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  Load & Display Current Image
// ══════════════════════════════════════════════════════════════════════════════
async function loadCurrentImage() {
  const img = State.getCurrentImage();
  if (!img) return;

  document.getElementById('status-filename').textContent = img.name;
  updateImageCounter();
  updateNavButtons();
  updateImageStrip();

  await CanvasEngine.loadImage(img.dataUrl);
  CanvasEngine.render();
  refreshAnnotationList();
  updateAnnotationCount();
  Panel.refreshFromState();
  showSaved();

  if (appMode === 'pseudo' && img.annotations.length === 0 && !img.pseudoAnnotations) {
    await runPseudoModel();
  } else if (img.pseudoAnnotations) {
    Panel.refreshFromState();
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  Remove Current Image
// ══════════════════════════════════════════════════════════════════════════════
function removeCurrentImage() {
  const img = State.getCurrentImage();
  if (!img) return;
  const name = img.name;
  const removed = State.removeCurrentImage();
  if (!removed) return;

  delete imageFileMap[name];

  if (State.getCount() === 0) {
    document.getElementById('canvas-area').style.display  = 'none';
    document.getElementById('empty-state').style.display  = '';
    CanvasEngine.clearImage();
    updateImageCounter();
    return;
  }

  buildImageStrip();
  updateImageCounter();
  updateNavButtons();
  loadCurrentImage();
  showToast(`Removed: ${name}`, 'info');
}

// ══════════════════════════════════════════════════════════════════════════════
//  Pseudo-AI Backend
// ══════════════════════════════════════════════════════════════════════════════
async function runPseudoModel() {
  const img = State.getCurrentImage();
  if (!img) { showToast('No image loaded', 'warn'); return; }

  const loadingEl = document.getElementById('pseudo-loading');
  loadingEl.style.display = 'flex';

  try {
    const file    = imageFileMap[img.name] ?? null;
    const result  = await PseudoBackend.predict(img.dataUrl, file);

    State.setPseudoAnnotations(result);
    CanvasEngine.applyPseudoResult(result);
    Panel.applyPseudoClassifications(result);

    refreshAnnotationList();
    updateAnnotationCount();
    showToast('Pseudo-annotations applied ✓', 'success');
  } catch(e) {
    console.error('Pseudo-AI error:', e);
    showToast(`Model error: ${e.message}`, 'error');
  } finally {
    loadingEl.style.display = 'none';
  }
}

function bindPseudoModal() {
  const overlay   = document.getElementById('pseudo-modal-overlay');
  const cancelBtn = document.getElementById('pseudo-modal-cancel');
  const closeBtn  = document.getElementById('pseudo-modal-close');
  const testBtn   = document.getElementById('pseudo-modal-test');
  const confirmBtn= document.getElementById('pseudo-modal-confirm');
  const urlInput  = document.getElementById('pseudo-api-url');
  const healthOut = document.getElementById('pseudo-health-result');

  cancelBtn.addEventListener('click',  () => { overlay.style.display = 'none'; });
  closeBtn.addEventListener('click',   () => { overlay.style.display = 'none'; });
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.style.display = 'none'; });

  testBtn.addEventListener('click', async () => {
    healthOut.textContent = 'Testing…';
    PseudoBackend.configure(urlInput.value.trim());
    try {
      await PseudoBackend.connect();
      healthOut.textContent = '✓ Connected';
      healthOut.style.color = '#3FB950';
    } catch(e) {
      healthOut.textContent = `✗ ${e.message}`;
      healthOut.style.color = '#F85149';
    }
  });

  confirmBtn.addEventListener('click', async () => {
    PseudoBackend.configure(urlInput.value.trim());
    overlay.style.display = 'none';
    try {
      await PseudoBackend.connect();
      showToast('Backend connected ✓', 'success');
    } catch(e) {
      showToast(`Connection failed: ${e.message}`, 'error');
    }
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  Tool & Mode Switching
// ══════════════════════════════════════════════════════════════════════════════
function setTool(tool) {
  document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
  document.getElementById(`tool-${tool}`)?.classList.add('active');
  // Deactivate annotation type buttons when switching to Select
  if (tool === 'select') {
    document.querySelectorAll('.ann-type-btn').forEach(b => b.classList.remove('active'));
  }
  CanvasEngine.setTool(tool);
}

function setMode(mode) {
  appMode = mode;
  document.querySelectorAll('.mode-btn[data-mode]').forEach(b => b.classList.remove('active'));
  document.getElementById(`mode-${mode}`)?.classList.add('active');
  const statusEl = document.getElementById('status-mode');
  if (mode === 'manual') {
    statusEl.textContent = 'Manual Mode';
    statusEl.className   = 'status-mode-manual';
  } else {
    statusEl.textContent = 'Pseudo-AI Mode';
    statusEl.className   = 'status-mode-pseudo';
  }
  showToast(`Switched to ${mode === 'manual' ? 'Manual' : 'Pseudo-AI'} mode`, 'info');
}

// ══════════════════════════════════════════════════════════════════════════════
//  Annotation List (Left Sidebar)
// ══════════════════════════════════════════════════════════════════════════════
function refreshAnnotationList(selectedId) {
  const listEl = document.getElementById('annotation-list');
  const anns   = State.getAnnotations();

  if (anns.length === 0) {
    listEl.innerHTML = '<div class="annotation-list-empty">No annotations yet.</div>';
    return;
  }

  listEl.innerHTML = '';
  anns.forEach((ann, i) => {
    const item = document.createElement('div');
    item.className = 'annotation-item' + (ann.id === selectedId ? ' selected' : '');
    item.dataset.id = ann.id;

    const tag = document.createElement('span');
    // Colour the tag using the annotation type colour
    const cfg = ConfigManager.getAnnotationType(ann.annotationType);
    const tagColor = cfg ? cfg.color : (ann.type === 'bbox' ? '#4FC3F7' : '#3FB950');
    tag.className = 'annotation-item-tag';
    tag.style.background = `${tagColor}22`;
    tag.style.color       = tagColor;
    tag.style.border      = `1px solid ${tagColor}55`;
    tag.textContent = ann.type.toUpperCase();

    const name = document.createElement('span');
    name.className = 'ann-item-label';
    name.textContent = ann.label || `#${i + 1}`;

    const delBtn = document.createElement('button');
    delBtn.className = 'annotation-item-delete';
    delBtn.title = 'Delete annotation';
    delBtn.textContent = '×';
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      State.deleteAnnotation(ann.id);
      refreshAnnotationList();
      updateAnnotationCount();
      CanvasEngine.render();
    });

    item.addEventListener('click', () => {
      CanvasEngine.selectAnnotation(ann.id);
      refreshAnnotationList(ann.id);
    });

    item.appendChild(tag);
    item.appendChild(name);
    item.appendChild(delBtn);
    listEl.appendChild(item);
  });
}

function updateAnnotationCount() {
  const count = State.getAnnotations().length;
  document.getElementById('status-ann-count').textContent = `${count} annotation${count !== 1 ? 's' : ''}`;
}

// ══════════════════════════════════════════════════════════════════════════════
//  Image Strip
// ══════════════════════════════════════════════════════════════════════════════
function buildImageStrip() {
  let strip = document.getElementById('image-strip');
  if (!strip) {
    strip = document.createElement('div');
    strip.className = 'image-strip';
    strip.id = 'image-strip';
    document.getElementById('canvas-area').appendChild(strip);
  }
  strip.innerHTML = '';
  State.getImages().forEach((img, i) => {
    const dot = document.createElement('div');
    dot.className = 'strip-dot';
    dot.title = img.name;
    dot.addEventListener('click', () => { State.goTo(i); loadCurrentImage(); });
    strip.appendChild(dot);
  });
  updateImageStrip();
}

function updateImageStrip() {
  const dots = document.querySelectorAll('.strip-dot');
  const ci   = State.getCurrentIndex();
  dots.forEach((dot, i) => {
    dot.className = 'strip-dot';
    if (i === ci) dot.classList.add('current');
    else if (State.isAnnotated(i)) dot.classList.add('annotated');
  });
}

function updateImageCounter() {
  const total = State.getCount();
  const cur   = State.getCurrentIndex();
  document.getElementById('image-counter').textContent =
    total > 0 ? `Image ${cur + 1} / ${total}` : 'No images loaded';
}

function updateNavButtons() {
  const ci    = State.getCurrentIndex();
  const total = State.getCount();
  document.getElementById('nav-prev').disabled = ci <= 0;
  document.getElementById('nav-next').disabled = ci >= total - 1;
}

function updateProjectName() {
  const el = document.getElementById('project-name-input');
  if (el) el.value = ConfigManager.get().project || 'Untitled Project';
}

// ══════════════════════════════════════════════════════════════════════════════
//  Save indicator
// ══════════════════════════════════════════════════════════════════════════════
function markUnsaved() {
  const el = document.getElementById('status-save');
  if (el) { el.textContent = '● Unsaved'; el.style.color = 'var(--warning)'; }
}

function showSaved() {
  State.save();
  const el = document.getElementById('status-save');
  if (el) { el.textContent = '✓ Saved'; el.style.color = 'var(--success)'; }
}

// ══════════════════════════════════════════════════════════════════════════════
//  Export
// ══════════════════════════════════════════════════════════════════════════════
function exportAnnotations() {
  if (State.getCount() === 0) { showToast('Nothing to export', 'warn'); return; }
  State.save();

  const json    = State.exportJSON();
  const blob    = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement('a');
  const rawName = (ConfigManager.get().project || 'annotations').trim();
  const safe    = rawName.replace(/[\s/\\:*?"<>|]+/g, '_');
  a.href     = url;
  a.download = `${safe}_annotations.json`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 150);
  showToast('Annotations exported ✓', 'success');
}

// ══════════════════════════════════════════════════════════════════════════════
//  Keyboard Shortcuts
// ══════════════════════════════════════════════════════════════════════════════
function bindKeyboard() {
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    switch (e.key) {
      case 'd': case 'D': case 'ArrowRight': navigateImage(1);  break;
      case 'a': case 'A': case 'ArrowLeft':  navigateImage(-1); break;
      case 'v': case 'V': setTool('select'); break;
      case '1': case '2': case '3': case '4': case '5': case '6': case '7': case '8': {
        const idx   = parseInt(e.key) - 1;
        const types = ConfigManager.get().annotationTypes || [];
        if (types[idx]) selectAnnotationType(types[idx].id);
        break;
      }
      case '+': case '=': CanvasEngine.zoomIn();      break;
      case '-': case '_': CanvasEngine.zoomOut();     break;
      case 'f': case 'F': CanvasEngine.fitToWindow(); break;
      case 'Escape': CanvasEngine.cancelCurrentDraw(); break;
      case 'Enter':  CanvasEngine.commitPolygon(); CanvasEngine.commitTrace(); break;
      case 'Delete': case 'Backspace':
        if (e.target.tagName !== 'INPUT') {
          e.preventDefault();
          CanvasEngine.deleteSelected();
          refreshAnnotationList();
          updateAnnotationCount();
        }
        break;
    }
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  Drag & Drop
// ══════════════════════════════════════════════════════════════════════════════
function bindDragDrop() {
  document.body.addEventListener('dragover',  e => { e.preventDefault(); document.body.classList.add('drag-over'); });
  document.body.addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('drag-over'); });
  document.body.addEventListener('drop', e => {
    e.preventDefault();
    document.body.classList.remove('drag-over');
    const files = e.dataTransfer?.files;
    if (files?.length > 0) handleImageFiles(files);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  Toast Notifications
// ══════════════════════════════════════════════════════════════════════════════
function showToast(message, type = 'info', duration = 2800) {
  const container = document.getElementById('toast-container');
  const toast     = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    toast.addEventListener('animationend', () => toast.remove());
  }, duration);
}
