/**
 * backend/mock_backend.js — Demo / Testing Backend
 *
 * Simulates a model response with random values from the config schema.
 * Useful for testing the UI without a real model.
 * Also generates fake BBox annotations so the canvas drawing can be tested.
 */

class MockBackend extends BaseBackend {
  constructor() {
    super();
    this._connected = false;
  }

  getName()     { return 'Mock (Demo)'; }
  getType()     { return 'mock'; }
  isConnected() { return this._connected; }

  async connect(options) {
    await this._delay(300); // simulate latency
    this._connected = true;
    return true;
  }

  async predict(imageDataUrl, imageFile) {
    await this._delay(600 + Math.random() * 800); // 0.6–1.4s simulate inference

    const config = ConfigManager.get();
    const classifications = {};

    // Random classification for each attribute
    config.schema.forEach(section => {
      section.attributes.forEach(attr => {
        const values = attr.values;
        const idx = Math.floor(Math.random() * values.length);
        classifications[attr.key] = {
          label: values[idx],
          confidence: 0.5 + Math.random() * 0.5
        };
      });
    });

    // Fake bounding box (a cell somewhere in the middle of the image)
    const boxes = [
      {
        x: 0.2 + Math.random() * 0.2,
        y: 0.2 + Math.random() * 0.2,
        w: 0.3 + Math.random() * 0.2,
        h: 0.3 + Math.random() * 0.2,
        label: 'cell',
        confidence: 0.8 + Math.random() * 0.19
      }
    ];

    return { classifications, boxes, polygons: [] };
  }

  _delay(ms) { return new Promise(res => setTimeout(res, ms)); }
}

BackendRegistry.register('mock', new MockBackend());
