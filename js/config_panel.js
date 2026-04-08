/**
 * config_panel.js — In-App Configuration Editor
 *
 * Provides a UI tab to edit:
 *  1. Classification schema (sections → attributes → values, allowNoTag)
 *  2. BBox annotation types (name, color)
 *  3. Trace annotation types  (name, color)
 *
 * All edits immediately update ConfigManager and rebuild the annotation
 * type picker and classification panel.
 */

const ConfigPanel = (() => {
  let _overlayEl = null;

  // ── Open / Close ──────────────────────────────────────────────────────────────
  function open() {
    if (!_overlayEl) _build();
    _refresh();
    _overlayEl.style.display = 'flex';
  }

  function close() {
    if (_overlayEl) _overlayEl.style.display = 'none';
  }

  // ── Build DOM (once) ──────────────────────────────────────────────────────────
  function _build() {
    _overlayEl = document.createElement('div');
    _overlayEl.className = 'modal-overlay cfg-overlay';
    _overlayEl.id = 'config-panel-overlay';
    _overlayEl.innerHTML = `
      <div class="modal cfg-modal" id="cfg-modal">
        <div class="modal-header">
          <h3>⚙ Configuration Editor</h3>
          <button class="modal-close" id="cfg-close">&times;</button>
        </div>
        <div class="cfg-tabs">
          <button class="cfg-tab active" data-tab="classifications">Classifications</button>
          <button class="cfg-tab" data-tab="bbox">BBox Types</button>
          <button class="cfg-tab" data-tab="traces">Trace Types</button>
        </div>
        <div class="cfg-body">
          <div class="cfg-pane" id="cfg-pane-classifications"></div>
          <div class="cfg-pane hidden" id="cfg-pane-bbox"></div>
          <div class="cfg-pane hidden" id="cfg-pane-traces"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="cfg-cancel">Cancel</button>
          <button class="btn btn-primary" id="cfg-save">Apply & Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(_overlayEl);

    // Tab switching
    _overlayEl.querySelectorAll('.cfg-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        _overlayEl.querySelectorAll('.cfg-tab').forEach(t => t.classList.remove('active'));
        _overlayEl.querySelectorAll('.cfg-pane').forEach(p => p.classList.add('hidden'));
        tab.classList.add('active');
        document.getElementById(`cfg-pane-${tab.dataset.tab}`).classList.remove('hidden');
      });
    });

    document.getElementById('cfg-close').addEventListener('click', close);
    document.getElementById('cfg-cancel').addEventListener('click', close);
    _overlayEl.addEventListener('click', e => { if (e.target === _overlayEl) close(); });
    document.getElementById('cfg-save').addEventListener('click', _applyAndSave);
  }

  // ── Refresh panes from current config ─────────────────────────────────────────
  function _refresh() {
    const cfg = ConfigManager.get();
    _renderClassificationsPane(cfg);
    _renderAnnotationTypesPane('bbox',   cfg);
    _renderAnnotationTypesPane('traces', cfg);
  }

  // ── Classifications Pane ─────────────────────────────────────────────────────
  function _renderClassificationsPane(cfg) {
    const pane = document.getElementById('cfg-pane-classifications');
    pane.innerHTML = '';

    const schema = cfg.schema || [];

    const addSectionBtn = _makeBtn('+ Add Section', 'btn-ghost cfg-add-btn', () => {
      schema.push({ section: 'New Section', attributes: [] });
      _renderClassificationsPane(cfg);
    });
    pane.appendChild(addSectionBtn);

    schema.forEach((section, si) => {
      const sEl = document.createElement('div');
      sEl.className = 'cfg-section-block';

      // Section header row
      const hrow = document.createElement('div');
      hrow.className = 'cfg-row cfg-section-header';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'text-input cfg-input';
      nameInput.value = section.section;
      nameInput.placeholder = 'Section name';
      nameInput.addEventListener('change', e => { section.section = e.target.value; });

      const delSectionBtn = _makeBtn('✕ Remove Section', 'btn-ghost btn-danger cfg-del-btn', () => {
        schema.splice(si, 1);
        _renderClassificationsPane(cfg);
      });

      hrow.appendChild(nameInput);
      hrow.appendChild(delSectionBtn);
      sEl.appendChild(hrow);

      // Attributes
      section.attributes.forEach((attr, ai) => {
        const attrRow = document.createElement('div');
        attrRow.className = 'cfg-attr-block';

        // Key + Label
        const attrHeader = document.createElement('div');
        attrHeader.className = 'cfg-row';

        const keyIn = document.createElement('input');
        keyIn.type = 'text';
        keyIn.className = 'text-input cfg-input cfg-input-sm';
        keyIn.value = attr.key;
        keyIn.placeholder = 'key (no spaces)';
        keyIn.addEventListener('change', e => { attr.key = e.target.value.trim().replace(/\s+/g, '_'); });

        const labelIn = document.createElement('input');
        labelIn.type = 'text';
        labelIn.className = 'text-input cfg-input cfg-input-sm';
        labelIn.value = attr.label;
        labelIn.placeholder = 'Label';
        labelIn.addEventListener('change', e => { attr.label = e.target.value; });

        const allowNoneLabel = document.createElement('label');
        allowNoneLabel.className = 'cfg-checkbox-label';
        const allowNoneChk = document.createElement('input');
        allowNoneChk.type = 'checkbox';
        allowNoneChk.checked = !!attr.allowNoTag;
        allowNoneChk.addEventListener('change', () => { attr.allowNoTag = allowNoneChk.checked; });
        allowNoneLabel.appendChild(allowNoneChk);
        allowNoneLabel.append(' None tag');

        const delAttrBtn = _makeBtn('✕', 'btn-ghost btn-danger cfg-del-tiny', () => {
          section.attributes.splice(ai, 1);
          _renderClassificationsPane(cfg);
        });

        attrHeader.appendChild(keyIn);
        attrHeader.appendChild(labelIn);
        attrHeader.appendChild(allowNoneLabel);
        attrHeader.appendChild(delAttrBtn);
        attrRow.appendChild(attrHeader);

        // Values
        const valList = document.createElement('div');
        valList.className = 'cfg-value-list';

        attr.values.forEach((val, vi) => {
          const vrow = document.createElement('div');
          vrow.className = 'cfg-row cfg-val-row';
          const vIn = document.createElement('input');
          vIn.type = 'text';
          vIn.className = 'text-input cfg-input cfg-input-xs';
          vIn.value = val;
          vIn.addEventListener('change', e => { attr.values[vi] = e.target.value.trim(); });
          const vDel = _makeBtn('✕', 'btn-ghost btn-danger cfg-del-tiny', () => {
            attr.values.splice(vi, 1);
            _renderClassificationsPane(cfg);
          });
          vrow.appendChild(vIn);
          vrow.appendChild(vDel);
          valList.appendChild(vrow);
        });

        const addValBtn = _makeBtn('+ Value', 'btn-ghost cfg-add-tiny', () => {
          attr.values.push('new_value');
          _renderClassificationsPane(cfg);
        });
        valList.appendChild(addValBtn);
        attrRow.appendChild(valList);
        sEl.appendChild(attrRow);
      });

      const addAttrBtn = _makeBtn('+ Add Attribute', 'btn-ghost cfg-add-btn cfg-add-attr-btn', () => {
        section.attributes.push({ key: 'new_attr', label: 'New Attribute', values: ['option1'], allowNoTag: true });
        _renderClassificationsPane(cfg);
      });
      sEl.appendChild(addAttrBtn);
      pane.appendChild(sEl);
    });
  }

  // ── Annotation Types Pane (bbox / traces) ───────────────────────────────────
  function _renderAnnotationTypesPane(tab, cfg) {
    const pane = document.getElementById(`cfg-pane-${tab}`);
    pane.innerHTML = '';
    const toolType = tab === 'bbox' ? 'bbox' : 'trace';
    const types = (cfg.annotationTypes || []).filter(t => t.tool === toolType || (tab === 'traces' && t.tool === 'polygon'));

    const allTypes = cfg.annotationTypes || [];

    types.forEach(typeDef => {
      const row = document.createElement('div');
      row.className = 'cfg-type-row';

      const colorInp = document.createElement('input');
      colorInp.type  = 'color';
      colorInp.value = typeDef.color;
      colorInp.className = 'cfg-color-input';
      colorInp.addEventListener('input', e => { typeDef.color = e.target.value; });

      const labelInp = document.createElement('input');
      labelInp.type = 'text';
      labelInp.className = 'text-input cfg-input cfg-input-sm';
      labelInp.value = typeDef.label;
      labelInp.addEventListener('change', e => { typeDef.label = e.target.value; });

      const idInp = document.createElement('input');
      idInp.type = 'text';
      idInp.className = 'text-input cfg-input cfg-input-xs';
      idInp.value = typeDef.id;
      idInp.placeholder = 'id';
      idInp.addEventListener('change', e => { typeDef.id = e.target.value.trim().replace(/\s+/g, '_'); });

      // Tool toggle (bbox vs polygon for trace tab)
      if (tab === 'traces') {
        const toolSel = document.createElement('select');
        toolSel.className = 'text-input cfg-select';
        ['polygon', 'trace'].forEach(t => {
          const opt = document.createElement('option');
          opt.value = t; opt.textContent = t;
          if (typeDef.tool === t) opt.selected = true;
          toolSel.appendChild(opt);
        });
        toolSel.addEventListener('change', e => { typeDef.tool = e.target.value; });
        row.appendChild(toolSel);
      }

      const delBtn = _makeBtn('✕', 'btn-ghost btn-danger cfg-del-tiny', () => {
        const idx = allTypes.indexOf(typeDef);
        if (idx > -1) { allTypes.splice(idx, 1); _renderAnnotationTypesPane(tab, cfg); }
      });

      row.appendChild(colorInp);
      row.appendChild(labelInp);
      row.appendChild(idInp);
      row.appendChild(delBtn);
      pane.appendChild(row);
    });

    const addBtn = _makeBtn(`+ Add ${tab === 'bbox' ? 'BBox' : 'Trace'} Type`, 'btn-ghost cfg-add-btn', () => {
      allTypes.push({ id: `new_type_${Date.now()}`, label: 'New Type', tool: toolType === 'trace' ? 'trace' : 'bbox', color: '#4FC3F7', fillOpacity: 0.08 });
      _renderAnnotationTypesPane(tab, cfg);
    });
    pane.appendChild(addBtn);
  }

  // ── Apply & Save ──────────────────────────────────────────────────────────────
  function _applyAndSave() {
    // Config is already mutated in-place via the input listeners.
    // Just rebuild the UI from the updated config.
    Panel.rebuild();
    if (typeof buildAnnotationTypePicker === 'function') buildAnnotationTypePicker();

    // Persist config to localStorage
    try {
      localStorage.setItem('cellannotate_config', JSON.stringify(ConfigManager.get()));
    } catch(e) {}

    if (typeof showToast === 'function') showToast('Configuration saved ✓', 'success');
    close();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function _makeBtn(text, cls, onClick) {
    const btn = document.createElement('button');
    btn.className = `btn ${cls}`;
    btn.textContent = text;
    btn.type = 'button';
    btn.addEventListener('click', onClick);
    return btn;
  }

  return { open, close };
})();
