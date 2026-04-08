/**
 * panel.js — Right Classification Panel
 *
 * Dynamically generates the classification UI from the config schema.
 * Handles displaying pseudo-annotation values, user selections, and confidence scores.
 */

const Panel = (() => {
  let _panelEl     = null;
  let _confEl      = null;
  let _confPanel   = null;

  function init() {
    _panelEl   = document.getElementById('classification-panel');
    _confEl    = document.getElementById('confidence-list');
    _confPanel = document.getElementById('confidence-panel');
    rebuild();
  }

  /** Rebuild the entire panel from the current config */
  function rebuild() {
    _panelEl.innerHTML = '';
    const config = ConfigManager.get();

    config.schema.forEach(section => {
      const sectionEl = document.createElement('div');
      sectionEl.className = 'panel-section';

      const titleEl = document.createElement('div');
      titleEl.className = 'panel-section-title';
      titleEl.textContent = section.section;
      sectionEl.appendChild(titleEl);

      section.attributes.forEach(attr => {
        sectionEl.appendChild(buildAttributeRow(attr));
      });

      _panelEl.appendChild(sectionEl);
    });
  }

  function buildAttributeRow(attr) {
    const row = document.createElement('div');
    row.className = 'attr-row';
    row.dataset.attrKey = attr.key;

    const label = document.createElement('div');
    label.className = 'attr-label';
    label.innerHTML = `${attr.label}<span class="attr-confidence" id="conf-label-${attr.key}"></span>`;
    row.appendChild(label);

    const btnGroup = document.createElement('div');
    btnGroup.className = 'btn-group';

    attr.values.forEach(val => {
      const btn = document.createElement('button');
      btn.className = 'attr-btn';
      btn.textContent = val;
      btn.dataset.key   = attr.key;
      btn.dataset.value = val;
      btn.id = `attr_${attr.key}_${val.replace(/\s+/g, '_').replace(/[^a-z0-9_]/gi, '')}`;
      btn.addEventListener('click', () => onAttributeClick(attr.key, val, btn));
      btnGroup.appendChild(btn);
    });

    // Zero-classification "None" button
    if (attr.allowNoTag) {
      const noneBtn = document.createElement('button');
      noneBtn.className = 'attr-btn attr-btn-none';
      noneBtn.textContent = 'None';
      noneBtn.dataset.key   = attr.key;
      noneBtn.dataset.value = '__none__';
      noneBtn.id = `attr_${attr.key}__none__`;
      noneBtn.title = 'Leave this attribute unclassified';
      noneBtn.addEventListener('click', () => onNoneClick(attr.key));
      btnGroup.appendChild(noneBtn);
    }

    row.appendChild(btnGroup);
    return row;
  }

  function onAttributeClick(key, value, clickedBtn) {
    // Deselect all buttons in this attribute (including any None button)
    const allBtns = _panelEl.querySelectorAll(`[data-key="${key}"]`);
    allBtns.forEach(b => {
      b.classList.remove('selected', 'pseudo-selected');
    });
    clickedBtn.classList.add('selected');
    State.setClassification(key, value);
    // Clear the pseudo confidence label when user overrides
    const confLabel = document.getElementById(`conf-label-${key}`);
    if (confLabel) confLabel.textContent = '';
  }

  /** Clicking None deselects / removes this attribute from state */
  function onNoneClick(key) {
    const allBtns = _panelEl.querySelectorAll(`[data-key="${key}"]`);
    allBtns.forEach(b => b.classList.remove('selected', 'pseudo-selected'));
    // Mark None as selected for visual feedback, then remove from state
    const noneBtn = _panelEl.querySelector(`[data-key="${key}"][data-value="__none__"]`);
    if (noneBtn) noneBtn.classList.add('selected');
    // Delete the key from classifications (zero tag)
    State.deleteClassification(key);
    const confLabel = document.getElementById(`conf-label-${key}`);
    if (confLabel) confLabel.textContent = '';
  }

  /** Reflect current state's classifications on the panel buttons */
  function refreshFromState() {
    const classifications = State.getClassifications();
    const pseudo = State.getPseudoAnnotations();

    // Clear all first
    _panelEl.querySelectorAll('.attr-btn').forEach(b => b.classList.remove('selected', 'pseudo-selected'));
    _panelEl.querySelectorAll('.attr-confidence').forEach(el => el.textContent = '');

    Object.entries(classifications).forEach(([key, val]) => {
      const btn = _panelEl.querySelector(`[data-key="${key}"][data-value="${val}"]`);
      if (btn) btn.classList.add('selected');
    });

    // If pseudo-annotations exist and the classification is from the model, mark as pseudo
    if (pseudo && pseudo.classifications) {
      Object.entries(pseudo.classifications).forEach(([key, result]) => {
        const label = result.label ?? result;
        const conf  = result.confidence ?? null;
        // Only mark as pseudo if user hasn't overridden
        if (!classifications[key]) {
          const btn = _panelEl.querySelector(`[data-key="${key}"][data-value="${label}"]`);
          if (btn) btn.classList.add('pseudo-selected');
        }
        // Show confidence badge
        if (conf !== null) {
          const confLabel = document.getElementById(`conf-label-${key}`);
          if (confLabel) {
            const pct = Math.round(conf * 100);
            const cls = conf > 0.8 ? 'high' : conf > 0.5 ? 'medium' : '';
            confLabel.textContent = `${pct}%`;
            confLabel.className = `attr-confidence ${cls}`;
          }
        }
      });
    }
  }

  /** Populate classifications from a pseudo-annotation result */
  function applyPseudoClassifications(result) {
    if (!result.classifications) return;
    const classifications = result.classifications;
    // Pre-select the panel; these are marked as pseudo until user clicks
    Object.entries(classifications).forEach(([key, obj]) => {
      const label = obj.label ?? obj;
      // Only set if user hasn't already set
      if (!State.getClassification(key)) {
        State.setClassification(key, label);
      }
    });
    refreshFromState();
    renderConfidencePanel(classifications);
  }

  function renderConfidencePanel(classifications) {
    if (!classifications || Object.keys(classifications).length === 0) {
      _confPanel.style.display = 'none';
      return;
    }
    _confPanel.style.display = '';
    _confEl.innerHTML = '';

    Object.entries(classifications).forEach(([key, obj]) => {
      const conf = obj.confidence ?? null;
      if (conf === null) return;

      const row = document.createElement('div');
      row.className = 'confidence-row';

      const name = document.createElement('span');
      name.className = 'confidence-name';
      name.textContent = key.replace(/_/g, ' ');

      const barWrap = document.createElement('div');
      barWrap.className = 'confidence-bar-wrap';

      const bar = document.createElement('div');
      bar.className = 'confidence-bar' + (conf < 0.5 ? ' very-low' : conf < 0.75 ? ' low' : '');
      bar.style.width = `${Math.round(conf * 100)}%`;
      barWrap.appendChild(bar);

      const val = document.createElement('span');
      val.className = 'confidence-val';
      val.textContent = `${Math.round(conf * 100)}%`;

      row.appendChild(name);
      row.appendChild(barWrap);
      row.appendChild(val);
      _confEl.appendChild(row);
    });
  }

  function clearAll() {
    State.clearClassifications();
    _panelEl.querySelectorAll('.attr-btn').forEach(b => b.classList.remove('selected', 'pseudo-selected'));
    _panelEl.querySelectorAll('.attr-confidence').forEach(el => el.textContent = '');
    _confPanel.style.display = 'none';
  }

  return { init, rebuild, refreshFromState, applyPseudoClassifications, clearAll };
})();
