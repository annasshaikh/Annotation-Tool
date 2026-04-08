/**
 * backend/segmentation_backend.js — Polygon Segmentation Backend
 *
 * Connects to a segmentation model endpoint (SAM, Mask-RCNN, etc.)
 * that returns instance segmentation polygons.
 *
 * Expected REST API:
 *   POST /segment
 *   Body: multipart/form-data { image: <file> }
 *
 *   Response: {
 *     "polygons": [
 *       {
 *         "points": [[x1,y1], [x2,y2], ...],  // normalised [0..1]
 *         "label": "cell",
 *         "confidence": 0.88
 *       }
 *     ]
 *   }
 */

class SegmentationBackend extends BaseBackend {
  constructor() {
    super();
    this._apiUrl = 'http://localhost:5002/segment';
    this._connected = false;
  }

  getName()     { return 'Segmentation (Polygon)'; }
  getType()     { return 'segmentation'; }
  isConnected() { return this._connected; }

  async connect(options = {}) {
    if (options.apiUrl) this._apiUrl = options.apiUrl;
    try {
      const res = await fetch(this._apiUrl.replace('/segment', '/health'), { method: 'GET', signal: AbortSignal.timeout(3000) });
      this._connected = res.ok;
    } catch {
      this._connected = true;
    }
    return this._connected;
  }

  async predict(imageDataUrl, imageFile) {
    const fd = new FormData();
    if (imageFile) fd.append('image', imageFile);
    else {
      const blob = await fetch(imageDataUrl).then(r => r.blob());
      fd.append('image', blob, 'image.jpg');
    }

    const res = await fetch(this._apiUrl, { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`Segmentation backend HTTP ${res.status}`);
    const data = await res.json();

    return {
      classifications: {},
      boxes: [],
      polygons: data.polygons ?? data.masks ?? [],
    };
  }
}

BackendRegistry.register('segmentation', new SegmentationBackend());
