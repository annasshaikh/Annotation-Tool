/**
 * backend/detection_backend.js — BBox Detection Backend
 *
 * Connects to a detection model endpoint (YOLO, Faster-RCNN, etc.)
 * that returns bounding boxes.
 *
 * Expected REST API:
 *   POST /detect
 *   Body: multipart/form-data { image: <file> }
 *
 *   Response: {
 *     "boxes": [
 *       { "x": 0.1, "y": 0.2, "w": 0.3, "h": 0.4, "label": "cell", "confidence": 0.95 }
 *     ]
 *   }
 *   Note: x, y, w, h are normalised [0.0 – 1.0] relative to image dimensions.
 */

class DetectionBackend extends BaseBackend {
  constructor() {
    super();
    this._apiUrl = 'http://localhost:5001/detect';
    this._connected = false;
  }

  getName()     { return 'Detection / BBox'; }
  getType()     { return 'detection'; }
  isConnected() { return this._connected; }

  async connect(options = {}) {
    if (options.apiUrl) this._apiUrl = options.apiUrl;
    try {
      const res = await fetch(this._apiUrl.replace('/detect', '/health'), { method: 'GET', signal: AbortSignal.timeout(3000) });
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
      // Convert base64 to blob
      const blob = await fetch(imageDataUrl).then(r => r.blob());
      fd.append('image', blob, 'image.jpg');
    }

    const res = await fetch(this._apiUrl, { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`Detection backend HTTP ${res.status}`);
    const data = await res.json();

    return {
      classifications: {},
      boxes: data.boxes ?? [],
      polygons: [],
    };
  }
}

BackendRegistry.register('detection', new DetectionBackend());
