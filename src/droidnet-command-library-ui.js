/*!
 * droidnet-command-library-ui — inline visual composer for droidnet-command-library.
 *
 * Renders a design-system command builder into a host element:
 *   - a tidy step list (drag-reorder, board chip, name, monospace token, edit/remove)
 *   - an inline "Add" bar (Board ▾ → Command ▾ → param controls → Insert) — no modal
 *   - a footer (+ Delay / + Note, an N/limit length counter, a safety note)
 * The engine (droidnet-command-library) owns all encode/parse/build logic; this is the view.
 *
 * UMD: exposes `window.DroidNetCommandLibraryUI` in browsers and `module.exports` under
 * CommonJS. Depends only on droidnet-command-library (no host-app namespace).
 *
 * Licensed under the Mozilla Public License 2.0 (see LICENSE).
 */
(function (root, factory) {
  'use strict';
  let core = null;
  if (typeof module === 'object' && module.exports) {
    core = require('./droidnet-command-library.js');
    module.exports = factory(function () { return core; });
    return;
  }
  if (typeof define === 'function' && define.amd) {
    define(['./droidnet-command-library'], function (c) { return factory(function () { return c; }); });
    return;
  }
  // browser: resolve the engine lazily off the global so load order within a
  // page is forgiving as long as the core is present before renderComposer runs.
  root.DroidNetCommandLibraryUI = factory(function () { return root.DroidNetCommandLibrary; });
})(typeof globalThis !== 'undefined' ? globalThis
   : typeof self !== 'undefined' ? self
   : typeof window !== 'undefined' ? window : this, function (getEngine) {
  'use strict';

  const E = () => getEngine();
  const esc = (s) => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const MAX_VALUE_LEN = 200; // stored-command value limit

  // "speed" → "Speed", "scrollSpeed" → "Scroll Speed". Param names are limited to
  // [A-Za-z][A-Za-z0-9]* by the schema, so this only needs camelCase handling.
  function humanize(name) {
    return String(name)
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }

  // Friendly caption for a param control: explicit label → enum's label → humanized name.
  // getEnum is a (name) => enumObject|undefined lookup (e.g. the engine's getEnum).
  function captionFor(p, getEnum) {
    if (p.label) return p.label;
    if (p.enum && getEnum) {
      const en = getEnum(p.enum);
      if (en && en.label) return en.label;
    }
    return humanize(p.name);
  }

  // Combined "Board ▸ Name" label — kept for back-compat / external callers.
  function stepLabel(step) {
    if (step.type === 'delay') return '⏲ delay ' + step.ms + 'ms';
    if (step.type === 'comment') return '"' + step.text.trim() + '"';
    if (step.type === 'raw') return '‹raw›' + (step.label ? ' ' + step.label.trim() : '');
    const cmd = E().getCommand(step.commandId);
    const comp = cmd ? cmd._component : null;
    return (comp ? comp.name.split(' ')[0] + ' ▸ ' : '') + (cmd ? cmd.name : step.commandId);
  }

  // Board chip text + whether it is an "unrecognized / non-command" (gray) chip.
  function boardChip(step) {
    if (step.type === 'delay') return { text: 'Delay', raw: true };
    if (step.type === 'comment') return { text: 'Note', raw: true };
    if (step.type === 'raw') return { text: 'raw', raw: true };
    const cmd = E().getCommand(step.commandId);
    return cmd
      ? { text: cmd._component.name.split(' ')[0], raw: false }
      : { text: '?', raw: true };
  }

  // Human-readable name for command/raw steps (delay/comment use inline inputs instead).
  function stepName(step) {
    if (step.type === 'raw') return step.label ? step.label.trim() : 'Unrecognized token';
    const cmd = E().getCommand(step.commandId);
    let name = cmd ? cmd.name : step.commandId;
    if (step.duration !== undefined && step.duration !== null && step.duration !== '') name += ' · ' + step.duration + 's';
    if (step.label && step.label.trim()) name += ' — ' + step.label.trim();
    return name;
  }

  // The displayed monospace token for one step, WITHOUT any trailing *** label comment.
  function stepToken(step) {
    const clone = Object.assign({}, step);
    delete clone.label;
    return E().buildWCBValue([clone]);
  }

  function renderComposer(container, value, callbacks) {
    callbacks = callbacks || {};
    // An empty/blank value means "no steps" — avoid a phantom empty raw step.
    let steps = value ? E().parseWCBValue(value) : [];
    let dragFrom = null;
    let editIndex = null;   // index of the command step currently loaded into the add bar (or null)
    let editLabel;          // original label of the step being edited (preserved across update)
    let seed = null;        // pre-fill for the add bar after an edit: {bookId, commandId, params, duration}

    function compiled() { return E().buildWCBValue(steps); }
    function recompile() { const v = compiled(); if (callbacks.onChange) callbacks.onChange(v); return v; }

    function moveStep(from, to) {
      if (from === null || to === null || from === to || from < 0 || to < 0 || from >= steps.length || to >= steps.length) return;
      const moved = steps.splice(from, 1)[0];
      steps.splice(to, 0, moved);
      if (editIndex !== null) { editIndex = null; seed = null; renderAddBar(); } // edit target moved → cancel edit
      recompile(); renderSteps();
    }

    // ---- one-time shell ----
    container.innerHTML = `
      <div class="wcb-builder">
        <div class="wcb-builder-head">
          <span class="lbl">Command steps</span>
          <span class="wcb-len"></span>
        </div>
        <div class="wcb-steps"></div>
        <div class="wcb-addbar"></div>
        <div class="wcb-foot">
          <button class="wcb-add-delay btn btn-sm btn-secondary" type="button">+ Delay</button>
          <button class="wcb-add-note btn btn-sm btn-secondary" type="button">+ Note</button>
          <span class="spacer"></span>
          <span class="wcb-safety"></span>
        </div>
      </div>`;
    const stepsEl = container.querySelector('.wcb-steps');
    const addbarEl = container.querySelector('.wcb-addbar');
    const lenEl = container.querySelector('.wcb-len');
    const safetyEl = container.querySelector('.wcb-safety');

    container.querySelector('.wcb-add-delay').addEventListener('click', () => {
      steps.push({ type: 'delay', ms: 500 }); recompile(); renderSteps();
    });
    container.querySelector('.wcb-add-note').addEventListener('click', () => {
      steps.push({ type: 'comment', text: ' note' }); recompile(); renderSteps();
    });

    // ---- steps list + length + safety ----
    function stepHtml(s, i) {
      const chip = boardChip(s);
      const chipHtml = `<span class="wcb-step-board${chip.raw ? ' raw' : ''}">${esc(chip.text)}</span>`;
      let nameHtml;
      if (s.type === 'delay') {
        nameHtml = `<span class="wcb-step-name">wait <input class="wcb-delay-ms form-control" type="number" min="0" data-i="${i}" value="${esc(s.ms)}" aria-label="delay in milliseconds"> ms</span>`;
      } else if (s.type === 'comment') {
        nameHtml = `<span class="wcb-step-name"><input class="wcb-note-text form-control" type="text" data-i="${i}" value="${esc(s.text.trim())}" placeholder="note" aria-label="note text"></span>`;
      } else {
        nameHtml = `<span class="wcb-step-name">${esc(stepName(s))}</span>`;
      }
      const tokenHtml = (s.type === 'delay' || s.type === 'comment')
        ? '' : `<code class="wcb-step-token">${esc(stepToken(s))}</code>`;
      const editBtn = (s.type === 'command')
        ? `<button class="wcb-icon-btn wcb-step-edit" data-i="${i}" type="button" title="Edit" aria-label="edit step">✎</button>` : '';
      return `
        <div class="wcb-step${editIndex === i ? ' editing' : ''}" data-i="${i}" draggable="true">
          <span class="wcb-grip" title="Drag to reorder" aria-hidden="true">⠿</span>
          ${chipHtml}
          ${nameHtml}
          ${tokenHtml}
          <span class="wcb-step-actions">
            ${editBtn}
            <button class="wcb-icon-btn danger wcb-step-remove" data-i="${i}" type="button" title="Remove" aria-label="remove">✕</button>
          </span>
        </div>`;
    }

    function renderSteps() {
      const v = compiled();
      lenEl.textContent = v.length + ' / ' + MAX_VALUE_LEN;
      lenEl.classList.toggle('over', v.length > MAX_VALUE_LEN);

      const levels = new Set();
      steps.forEach(s => {
        if (s.type !== 'command') return;
        const cmd = E().getCommand(s.commandId);
        if (cmd && cmd.safety && cmd.safety !== 'cosmetic') levels.add(cmd.safety);
      });
      safetyEl.textContent = levels.size
        ? '⚠ contains ' + [...levels].join(' / ') + ' commands — confirm before firing.' : '';

      stepsEl.innerHTML = steps.map((s, i) => stepHtml(s, i)).join('')
        || '<div class="wcb-empty">No steps yet — add one below.</div>';

      stepsEl.querySelectorAll('.wcb-step-remove').forEach(btn => btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.i, 10);
        steps.splice(i, 1);
        if (editIndex === i) { editIndex = null; seed = null; renderAddBar(); }
        else if (editIndex !== null && editIndex > i) editIndex -= 1;
        recompile(); renderSteps();
      }));
      stepsEl.querySelectorAll('.wcb-step-edit').forEach(btn => btn.addEventListener('click', () => {
        loadStepIntoAddBar(parseInt(btn.dataset.i, 10));
      }));
      stepsEl.querySelectorAll('.wcb-delay-ms').forEach(inp => inp.addEventListener('change', () => {
        steps[parseInt(inp.dataset.i, 10)].ms = parseInt(inp.value, 10) || 0;
        recompile(); renderSteps();
      }));
      stepsEl.querySelectorAll('.wcb-note-text').forEach(inp => inp.addEventListener('change', () => {
        steps[parseInt(inp.dataset.i, 10)].text = ' ' + inp.value.trim();
        recompile(); renderSteps();
      }));
      // drag-to-reorder (source index tracked in a closure; no dataTransfer dependency)
      stepsEl.querySelectorAll('.wcb-step').forEach(el => {
        el.addEventListener('dragstart', () => { dragFrom = parseInt(el.dataset.i, 10); el.classList.add('dragging'); });
        el.addEventListener('dragend', () => { dragFrom = null; el.classList.remove('dragging'); });
        el.addEventListener('dragover', (e) => { e.preventDefault(); });
        el.addEventListener('drop', (e) => {
          e.preventDefault();
          const to = parseInt(el.dataset.i, 10);
          const from = dragFrom;
          dragFrom = null;
          moveStep(from, to);
        });
      });
    }

    // ---- inline add bar (the catalog folded into Board/Command dropdowns) ----
    function fieldCell(caption, controlHtml) {
      return `<label class="wcb-field"><span class="wcb-field-cap">${esc(caption)}</span>${controlHtml}</label>`;
    }

    function paramControl(p, cur) {
      const val = cur[p.name] !== undefined ? cur[p.name] : (p.default !== undefined ? p.default : '');
      const name = esc(p.name);
      const cap = captionFor(p, E().getEnum);
      let control;
      if (p.enum) {
        const en = E().getEnum(p.enum);
        const opts = ((en && en.values) || [])
          .map(v => `<option value="${esc(v.code)}"${String(v.code) === String(val) ? ' selected' : ''}>${esc(v.label)}</option>`).join('');
        control = `<select class="form-control wcb-param" data-param="${name}" aria-label="${esc(cap)}">${opts}</select>`;
      } else {
        const min = p.min !== undefined ? ` min="${p.min}"` : '';
        const max = p.max !== undefined ? ` max="${p.max}"` : '';
        control = `<input class="form-control wcb-param" data-param="${name}" aria-label="${esc(cap)}" type="number"${min}${max} value="${esc(val)}">`;
      }
      return fieldCell(cap, control);
    }

    function loadStepIntoAddBar(i) {
      const s = steps[i];
      if (!s || s.type !== 'command') return;
      const cmd = E().getCommand(s.commandId);
      if (!cmd) return;
      editIndex = i;
      editLabel = s.label;
      seed = { bookId: cmd._component.id, commandId: cmd.id, params: Object.assign({}, s.params), duration: s.duration };
      renderAddBar();
      renderSteps(); // refresh the .editing highlight
    }

    function insertOrUpdate() {
      const cmd = E().getCommand(addbarEl.querySelector('.wcb-cmd').value);
      if (!cmd) return;
      const params = {};
      addbarEl.querySelectorAll('.wcb-param').forEach(el => { params[el.dataset.param] = el.value; });
      const step = { type: 'command', commandId: cmd.id, params };
      const durEl = addbarEl.querySelector('.wcb-duration');
      if (cmd.supportsDuration && durEl && durEl.value !== '') step.duration = parseInt(durEl.value, 10);
      if (editIndex !== null) {
        // editing preserves the step's original label exactly (a label-less step stays label-less)
        if (editLabel !== undefined) step.label = editLabel;
        steps[editIndex] = step;
        editIndex = null; editLabel = undefined; seed = null;
      } else {
        // a fresh insert gets the command's default comment label (matches the prior catalog/modal insert)
        if (cmd.commentLabel) step.label = ' ' + cmd.commentLabel;
        steps.push(step);
      }
      recompile(); renderSteps(); renderAddBar();
    }

    function renderAddBar() {
      const books = E().getComponents();
      const s = seed; seed = null; // consume the pre-fill once
      const editing = editIndex !== null;
      const bookId = (s && s.bookId) || (books[0] && books[0].id);
      addbarEl.innerHTML = `
        <span class="add-lbl">${editing ? 'Edit:' : 'Add:'}</span>
        ${fieldCell('Board', `<select class="form-control wcb-book" aria-label="Board">${books
          .map(b => `<option value="${esc(b.id)}"${b.id === bookId ? ' selected' : ''}>${esc(b.name)}</option>`).join('')}</select>`)}
        ${fieldCell('Command', `<select class="form-control wcb-cmd" aria-label="Command"></select>`)}
        <span class="wcb-params"></span>
        <button class="wcb-insert btn btn-sm btn-primary" type="button">${editing ? 'Update' : 'Insert'}</button>
        ${editing ? '<button class="wcb-cancel btn btn-sm btn-secondary" type="button">Cancel</button>' : ''}`;
      const bookSel = addbarEl.querySelector('.wcb-book');
      const cmdSel = addbarEl.querySelector('.wcb-cmd');
      const paramsEl = addbarEl.querySelector('.wcb-params');

      function renderParams(useSeed) {
        const cmd = E().getCommand(cmdSel.value);
        if (!cmd) { paramsEl.innerHTML = ''; return; }
        const cur = (useSeed && s && s.commandId === cmd.id && s.params) ? s.params : {};
        let html = (cmd.params || []).map(p => paramControl(p, cur)).join('');
        if (cmd.supportsDuration) {
          const dv = (useSeed && s && s.commandId === cmd.id && s.duration != null) ? esc(s.duration) : '';
          html += fieldCell('Duration', `<input class="form-control wcb-duration" type="number" min="0" aria-label="duration in seconds" value="${dv}">`);
        }
        paramsEl.innerHTML = html;
      }
      function fillCommands(useSeed) {
        const cmds = E().getCommands(bookSel.value);
        cmdSel.innerHTML = cmds.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
        if (useSeed && s && s.commandId && cmds.some(c => c.id === s.commandId)) cmdSel.value = s.commandId;
        renderParams(useSeed);
      }
      bookSel.addEventListener('change', () => fillCommands(false));
      cmdSel.addEventListener('change', () => renderParams(false));
      addbarEl.querySelector('.wcb-insert').addEventListener('click', insertOrUpdate);
      const cancelBtn = addbarEl.querySelector('.wcb-cancel');
      if (cancelBtn) cancelBtn.addEventListener('click', () => {
        editIndex = null; editLabel = undefined; seed = null; renderAddBar(); renderSteps();
      });
      fillCommands(true); // honor the edit pre-fill on first paint
    }

    renderSteps();
    renderAddBar();
  }

  return { renderComposer, stepLabel, humanize, captionFor };
});
