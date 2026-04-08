/**
 * state.js — Centralised Application State & Auto-Save
 * Manages the current image list, per-image annotations, and classifications.
 * Persists everything to localStorage after every change.
 */

const STATE_KEY = 'cellannotate_state';

const State = (() => {
  // ── Internal State ──────────────────────────────────────────────────────────
  let images = [];          // Array of { name, dataUrl, annotations:[], classifications:{} }
  let currentIndex = -1;
  let dirty = false;        // Whether there are unsaved changes (for export prompt)

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /** Create a fresh image record */
  function createImageRecord(name, dataUrl) {
    return {
      name,
      dataUrl,
      annotations: [],       // [{id, type:'bbox'|'polygon'|'trace', annotationType, coords, label}]
      classifications: {},   // { key: selectedValue }
      approved: false,
      pseudoAnnotations: null,
    };
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  function addImages(fileList) {
    let added = 0;
    return new Promise((resolve) => {
      if (fileList.length === 0) return resolve(0);
      let remaining = fileList.length;

      Array.from(fileList).forEach(file => {
        const ext = file.name.split('.').pop().toLowerCase();
        const isImage = file.type.startsWith('image/') || ext === 'tif' || ext === 'tiff';
        if (!isImage) { remaining--; if (!remaining) resolve(added); return; }

        const reader = new FileReader();
        reader.onload = (e) => {
          const exists = images.some(img => img.name === file.name);
          if (!exists) {
            images.push(createImageRecord(file.name, e.target.result));
            added++;
          }
          remaining--;
          if (!remaining) {
            if (currentIndex === -1 && images.length > 0) currentIndex = 0;
            save();
            resolve(added);
          }
        };
        reader.readAsDataURL(file);
      });
    });
  }

  /** Remove the current image from the list */
  function removeCurrentImage() {
    if (currentIndex < 0 || images.length === 0) return false;
    images.splice(currentIndex, 1);
    dirty = true;
    if (images.length === 0) {
      currentIndex = -1;
    } else if (currentIndex >= images.length) {
      currentIndex = images.length - 1;
    }
    save();
    return true;
  }

  /** Directly add an image record by name + dataUrl (used for TIFF conversion) */
  function _addImageRecord(name, dataUrl) {
    if (images.some(i => i.name === name)) return;
    images.push(createImageRecord(name, dataUrl));
    if (currentIndex === -1 && images.length > 0) currentIndex = 0;
    dirty = true;
    save();
  }


  function getImages()       { return images; }
  function getCurrentIndex() { return currentIndex; }
  function getCurrentImage() { return currentIndex >= 0 ? images[currentIndex] : null; }
  function getCount()        { return images.length; }

  function goTo(index) {
    if (index >= 0 && index < images.length) {
      currentIndex = index;
      save(); // Always persist on navigation
      return true;
    }
    return false;
  }
  function next() { return goTo(currentIndex + 1); }
  function prev() { return goTo(currentIndex - 1); }

  // ── Annotations ──────────────────────────────────────────────────────────────

  function addAnnotation(annObject) {
    const img = getCurrentImage();
    if (!img) return null;
    if (!annObject.id) annObject.id = `ann_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    img.annotations.push(annObject);
    dirty = true;
    save();
    return annObject.id;
  }

  function updateAnnotation(id, updates) {
    const img = getCurrentImage();
    if (!img) return;
    const ann = img.annotations.find(a => a.id === id);
    if (ann) { Object.assign(ann, updates); dirty = true; save(); }
  }

  function deleteAnnotation(id) {
    const img = getCurrentImage();
    if (!img) return;
    img.annotations = img.annotations.filter(a => a.id !== id);
    dirty = true;
    save();
  }

  function clearAnnotations() {
    const img = getCurrentImage();
    if (!img) return;
    img.annotations = [];
    dirty = true;
    save();
  }

  function getAnnotations() {
    return getCurrentImage()?.annotations ?? [];
  }

  // ── Classifications ───────────────────────────────────────────────────────────

  function setClassification(key, value) {
    const img = getCurrentImage();
    if (!img) return;
    img.classifications[key] = value;
    dirty = true;
    save();
  }

  function getClassification(key) {
    return getCurrentImage()?.classifications[key] ?? null;
  }

  function getClassifications() {
    return getCurrentImage()?.classifications ?? {};
  }

  function clearClassifications() {
    const img = getCurrentImage();
    if (!img) return;
    img.classifications = {};
    dirty = true;
    save();
  }

  function deleteClassification(key) {
    const img = getCurrentImage();
    if (!img) return;
    delete img.classifications[key];
    dirty = true;
    save();
  }

  function setPseudoAnnotations(data) {
    const img = getCurrentImage();
    if (!img) return;
    img.pseudoAnnotations = data;
    save();
  }

  function getPseudoAnnotations() {
    return getCurrentImage()?.pseudoAnnotations ?? null;
  }

  function setApproved(val) {
    const img = getCurrentImage();
    if (!img) return;
    img.approved = val;
    dirty = true;
    save();
  }

  // ── Persistence ───────────────────────────────────────────────────────────────

  /** Save to localStorage (dataUrls excluded to save space) */
  function save() {
    try {
      const payload = images.map(img => ({
        name: img.name,
        annotations: img.annotations,
        classifications: img.classifications,
        approved: img.approved,
        pseudoAnnotations: img.pseudoAnnotations,
      }));
      localStorage.setItem(STATE_KEY, JSON.stringify({ currentIndex, saved: payload }));
    } catch (e) {
      // localStorage quota exceeded — silently ignore
    }
  }

  /** Export full JSON (all images, annotations, classifications) */
  function exportJSON() {
    const config = ConfigManager.get();
    const data = {
      project:    config.project,
      exportedAt: new Date().toISOString(),
      images: images.map(img => ({
        image_name:      img.name,
        annotations:     img.annotations.map(a => ({
          id:             a.id,
          type:           a.type,
          annotationType: a.annotationType || a.type,
          coordinates:    a.coords,
          label:          a.label || '',
        })),
        classifications: img.classifications,
        approved:        img.approved,
      })),
    };
    return JSON.stringify(data, null, 2);
  }

  function reset() {
    images = [];
    currentIndex = -1;
    dirty = false;
    localStorage.removeItem(STATE_KEY);
  }

  function isAnnotated(index) {
    const img = images[index];
    if (!img) return false;
    return img.annotations.length > 0 || Object.keys(img.classifications).length > 0;
  }

  function isDirty() { return dirty; }
  function markClean() { dirty = false; }

  return {
    addImages, removeCurrentImage, _addImageRecord,
    getImages, getCurrentIndex, getCurrentImage, getCount,
    goTo, next, prev,
    addAnnotation, updateAnnotation, deleteAnnotation, clearAnnotations, getAnnotations,
    setClassification, getClassification, getClassifications, clearClassifications, deleteClassification,
    setPseudoAnnotations, getPseudoAnnotations,
    setApproved,
    save, exportJSON, reset, isAnnotated, isDirty, markClean,
  };
})();
