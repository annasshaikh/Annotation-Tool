/**
 * backend/classification_backend.js — Attribute Classification Backend
 *
 * Connects to a Python server (like inference.py wrapped in a Flask/FastAPI endpoint)
 * that returns multi-head classification outputs matching the schema.
 *
 * Expected REST API:
 *   POST /predict
 *   Body: multipart/form-data { image: <file> }   OR
 *         application/json    { image_b64: "data:image/jpeg;base64,..." }
 *
 *   Response: {
 *     "classifications": {
 *       "cell_size": { "label": "big", "confidence": 0.92 },
 *       ...
 *     }
 *   }
 *
 * To run the Python server:
 *   python server.py --model_path resnet50_6c33f0.pth --train_csv dataset/pbc_attr_v1_train.csv
 */

class ClassificationBackend extends BaseBackend {
  constructor() {
    super();
    this._apiUrl = 'http://localhost:5000/predict';
    this._connected = false;
  }

  getName()     { return 'Classification (inference.py)'; }
  getType()     { return 'classification'; }
  isConnected() { return this._connected; }

  async connect(options = {}) {
    if (options.apiUrl) this._apiUrl = options.apiUrl;
    // Test connectivity with a health-check ping
    try {
      const res = await fetch(this._apiUrl.replace('/predict', '/health'), { method: 'GET', signal: AbortSignal.timeout(3000) });
      this._connected = res.ok;
    } catch (e) {
      // If no /health endpoint, we still mark connected and let predict() fail gracefully
      this._connected = true;
      console.warn('ClassificationBackend: no /health endpoint found, assuming connected');
    }
    return this._connected;
  }

  async predict(imageDataUrl, imageFile) {
    // Build form data
    let body;
    let headers = {};

    if (imageFile) {
      const fd = new FormData();
      fd.append('image', imageFile);
      body = fd;
    } else {
      // Send base64
      body = JSON.stringify({ image_b64: imageDataUrl });
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(this._apiUrl, { method: 'POST', body, headers });
    if (!res.ok) throw new Error(`Backend HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();

    return {
      classifications: data.classifications ?? data,
      boxes: data.boxes ?? [],
      polygons: data.polygons ?? [],
    };
  }
}

BackendRegistry.register('classification', new ClassificationBackend());
