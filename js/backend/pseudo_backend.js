/**
 * pseudo_backend.js — Simplified Pseudo-Annotation Backend
 *
 * Replaces the old multi-backend system. This module provides a single
 * HTTP client that posts images to a user-supplied Python/Flask REST server.
 *
 * The server must expose:
 *   GET  /health   → { status: "ok" }
 *   POST /predict  → { classifications, boxes, polygons }
 *
 * See PSEUDO_AI_GUIDE.md for how to run the server with a custom .pt model.
 */

const PseudoBackend = (() => {
  let _apiUrl    = 'http://localhost:5000';
  let _connected = false;
  let _status    = 'disconnected'; // 'disconnected' | 'connecting' | 'connected' | 'error'

  // ── Configuration ─────────────────────────────────────────────────────────────
  function configure(apiUrl) {
    _apiUrl    = apiUrl.replace(/\/$/, '');
    _connected = false;
    _status    = 'disconnected';
  }

  function getApiUrl() { return _apiUrl; }

  // ── Health Check ──────────────────────────────────────────────────────────────
  async function connect() {
    _status = 'connecting';
    _updateUI();
    try {
      const res = await fetch(`${_apiUrl}/health`, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      _connected = true;
      _status    = 'connected';
      _updateUI(data.model_loaded ? `Connected — model loaded` : 'Connected (no model)');
      return true;
    } catch (e) {
      _connected = false;
      _status    = 'error';
      _updateUI(null, e.message);
      throw e;
    }
  }

  function isConnected() { return _connected; }
  function getStatus()   { return _status;    }

  // ── Predict ───────────────────────────────────────────────────────────────────
  /**
   * Send image to backend for prediction.
   * @param {string} imageDataUrl — data:image/... base64 string
   * @param {File|null} imageFile — original file (used for multipart if available)
   * @returns {Promise<{classifications, boxes, polygons}>}
   */
  async function predict(imageDataUrl, imageFile) {
    if (!_connected) {
      // Auto-reconnect
      await connect();
    }

    // Prefer multipart with raw file; fallback to base64 JSON
    let body, headers;
    if (imageFile) {
      const form = new FormData();
      form.append('image', imageFile);
      body    = form;
      headers = {}; // browser sets multipart content-type automatically
    } else {
      body    = JSON.stringify({ image_b64: imageDataUrl });
      headers = { 'Content-Type': 'application/json' };
    }

    const res = await fetch(`${_apiUrl}/predict`, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Server error ${res.status}: ${text}`);
    }

    const result = await res.json();
    if (result.error) throw new Error(result.error);

    return {
      classifications: result.classifications || {},
      boxes:           result.boxes           || [],
      polygons:        result.polygons         || [],
    };
  }

  // ── UI status helpers ─────────────────────────────────────────────────────────
  function _updateUI(message, errorMsg) {
    const dot  = document.getElementById('backend-dot');
    const text = document.getElementById('backend-status-text');
    if (!dot || !text) return;

    if (_status === 'connecting') {
      dot.className  = 'backend-status-dot';
      text.textContent = 'Connecting…';
    } else if (_status === 'connected') {
      dot.className  = 'backend-status-dot connected';
      text.textContent = message || `Server: ${_apiUrl}`;
    } else if (_status === 'error') {
      dot.className  = 'backend-status-dot error';
      text.textContent = `Error: ${errorMsg || 'connection failed'}`;
    } else {
      dot.className  = 'backend-status-dot';
      text.textContent = 'No server connected';
    }
  }

  function syncUI() { _updateUI(); }

  return { configure, getApiUrl, connect, isConnected, getStatus, predict, syncUI };
})();
