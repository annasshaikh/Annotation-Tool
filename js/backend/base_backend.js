/**
 * backend/base_backend.js — Abstract Backend Interface
 *
 * All backend implementations MUST extend BaseBackend and implement:
 *   - connect(options)   → Promise<boolean>
 *   - predict(imageDataUrl, imageFile) → Promise<BackendResult>
 *   - getName()          → string
 *   - getType()          → 'classification' | 'detection' | 'segmentation' | 'mock'
 *
 * BackendResult shape:
 * {
 *   classifications: { key: { label: string, confidence: number } }  // optional
 *   boxes:      [{ x, y, w, h, label, confidence }]                   // optional
 *   polygons:   [{ points: [[x,y],...], label, confidence }]          // optional
 * }
 */

class BaseBackend {
  /** @returns {string} Human-readable backend name */
  getName() { return 'BaseBackend'; }

  /** @returns {string} One of 'classification', 'detection', 'segmentation', 'mock' */
  getType() { return 'base'; }

  /**
   * Connect to / initialise the backend.
   * @param {object} options — e.g. { apiUrl, modelPath, ... }
   * @returns {Promise<boolean>} true if connected successfully
   */
  async connect(options) {
    throw new Error(`${this.getName()}.connect() not implemented`);
  }

  /**
   * Run inference on one image.
   * @param {string}  imageDataUrl — data:image/... base64 string
   * @param {File}    imageFile     — the original File object (may be null)
   * @returns {Promise<object>}    BackendResult
   */
  async predict(imageDataUrl, imageFile) {
    throw new Error(`${this.getName()}.predict() not implemented`);
  }

  /** Helper — check whether backend is currently connected */
  isConnected() { return false; }
}

// ── Backend Registry ──────────────────────────────────────────────────────────
const BackendRegistry = (() => {
  const backends = {};
  let active = null;

  function register(key, instance) {
    if (!(instance instanceof BaseBackend)) throw new Error(`${key} must extend BaseBackend`);
    backends[key] = instance;
  }

  function setActive(key) {
    if (!backends[key]) throw new Error(`Backend '${key}' not registered`);
    active = backends[key];
    return active;
  }

  function getActive() { return active; }
  function getAll()    { return backends; }
  function get(key)    { return backends[key] ?? null; }

  return { register, setActive, getActive, getAll, get };
})();
