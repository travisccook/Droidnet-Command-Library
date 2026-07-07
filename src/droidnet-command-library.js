/*!
 * droidnet-command-library — engine (pure, no DOM).
 *
 * A schema-driven encoder/decoder for board serial command "books". Load a
 * library object (see schema/library.schema.json), then encode structured
 * steps into a wire string, or parse a wire string back into steps.
 *
 * UMD: exposes `window.DroidNetCommandLibrary` in browsers and `module.exports`
 * under CommonJS. Has no dependency on any host application namespace.
 *
 * This file is licensed under the Mozilla Public License 2.0 (see LICENSE).
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api; // CommonJS / Node / bundlers
  } else if (typeof define === 'function' && define.amd) {
    define([], function () { return api; }); // AMD
  }
  if (root) {
    root.DroidNetCommandLibrary = api; // browser global
  }
})(typeof globalThis !== 'undefined' ? globalThis
   : typeof self !== 'undefined' ? self
   : typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  let _lib = null;
  const _commandsById = {};

  function deepEqual(a, b) {
    if (a === b) return true;
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
      return true;
    }
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      const ka = Object.keys(a), kb = Object.keys(b);
      if (ka.length !== kb.length) return false;
      for (const k of ka) {
        if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
        if (!deepEqual(a[k], b[k])) return false;
      }
      return true;
    }
    return false;
  }

  // Build a merged library from an array of libraries. Runs ALL conflict checks
  // before returning, so a thrown conflict never leaves a half-written result
  // (callers commit only on success). Sets each command's non-enumerable
  // _component back-ref and clears its _matcher cache as it goes.
  function _accumulate(libs, opts) {
    opts = opts || {};
    const acc = {
      libraryVersion: opts.libraryVersion !== undefined ? opts.libraryVersion
        : (libs[0] && libs[0].libraryVersion !== undefined ? libs[0].libraryVersion : null),
      enums: {}, components: [],
    };
    const byId = {};
    for (const lib of libs) {
      const enums = (lib && lib.enums) || {};
      for (const id of Object.keys(enums)) {
        if (Object.prototype.hasOwnProperty.call(acc.enums, id)) {
          if (!deepEqual(acc.enums[id], enums[id])) {
            throw new Error("enum '" + id + "' is defined differently across board files");
          }
        } else {
          acc.enums[id] = enums[id];
        }
      }
      for (const comp of (lib && lib.components) || []) {
        for (const cmd of comp.commands || []) {
          if (Object.prototype.hasOwnProperty.call(byId, cmd.id)) {
            throw new Error("duplicate command id '" + cmd.id + "' across board files");
          }
          delete cmd._matcher;
          Object.defineProperty(cmd, '_component', { value: comp, enumerable: false, configurable: true, writable: true });
          byId[cmd.id] = cmd;
        }
        acc.components.push(comp);
      }
    }
    return { acc, byId };
  }

  // Returns a merged library object without touching engine state
  // (_lib/_commandsById). It DOES set each input command's non-enumerable
  // _component back-ref (required for encode()) and clears its _matcher cache,
  // exactly as loadLibrary does.
  function merge(libOrArray, opts) {
    return _accumulate(Array.isArray(libOrArray) ? libOrArray : [libOrArray], opts).acc;
  }

  function _commit(acc, byId) {
    _lib = acc;
    for (const k of Object.keys(_commandsById)) delete _commandsById[k];
    Object.assign(_commandsById, byId);
  }

  // Reset, then load a single library or merge an array (in order).
  function loadLibrary(libOrArray, opts) {
    const libs = Array.isArray(libOrArray) ? libOrArray : [libOrArray];
    const { acc, byId } = _accumulate(libs, opts);
    _commit(acc, byId);
  }

  // Append a library without resetting. A component whose id is already loaded
  // is a no-op when identical, and throws when its content differs.
  function mergeLibrary(lib) {
    const current = _lib || { libraryVersion: null, enums: {}, components: [] };
    const existing = {};
    for (const c of current.components) existing[c.id] = c;
    const incoming = [];
    for (const comp of (lib.components || [])) {
      if (existing[comp.id]) {
        if (deepEqual(existing[comp.id], comp)) continue; // identical -> no-op
        throw new Error("component '" + comp.id + "' already loaded with different content");
      }
      incoming.push(comp);
    }
    const { acc, byId } = _accumulate([
      { libraryVersion: current.libraryVersion, enums: current.enums, components: current.components },
      { enums: lib.enums || {}, components: incoming },
    ], { libraryVersion: current.libraryVersion });
    _commit(acc, byId);
  }
  function getComponents() { return (_lib && _lib.components) || []; }
  function getCommands(componentId) {
    const c = getComponents().find(x => x.id === componentId);
    return c ? c.commands : [];
  }
  function getCommand(commandId) { return _commandsById[commandId] || null; }
  function getEnum(enumId) { return (_lib && _lib.enums && _lib.enums[enumId]) || null; }
  function getLibraryVersion() { return (_lib && _lib.libraryVersion) || null; }

  function _paramDefault(cmd, name) {
    const p = (cmd.params || []).find(x => x.name === name);
    return p && p.default !== undefined ? p.default : '';
  }

  const _encoders = {
    'rseries-le': {
      encode(cmd, params) {
        const N = (parseInt(params.effect, 10) || 0) * 10000
                + (parseInt(params.color, 10) || 0) * 1000
                + (parseInt(params.speed, 10) || 0) * 100
                + (parseInt(params.seconds, 10) || 0);
        const target = params.target || '';
        if (target === '') {
          const body = 'LE' + String(N);
          if (body.length >= 9) {
            throw new Error('RSeries: this value requires a target display (cannot broadcast)');
          }
          // broadcast: canonical form — leading zeros are dropped (firmware ignores them; round-trip is firmware-equivalent, not byte-identical, for leading-zero inputs)
          return '~RT' + body;
        }
        return '~RTLE' + target + String(N).padStart(6, '0');
      },
      match(token) {
        const m = /^(?:~RT|@LE|@AP)?LE(\d+)$/.exec(token);
        if (!m) return null;
        const digits = m[1];
        // firmware measures length on "LE"+digits (prefix stripped): id present iff (2 + digits.length) >= 9
        let target = '', valStr = digits;
        if (digits.length >= 7) { target = digits[0]; valStr = digits.slice(1); }
        const N = parseInt(valStr, 10);
        return {
          commandId: 'rseries.effect',
          params: {
            effect: String(Math.floor(N / 10000)),
            color: String(Math.floor(N / 1000) % 10),
            speed: String(Math.floor(N / 100) % 10),
            seconds: String(N % 100),
            target,
          },
        };
      },
    },
    template: {
      encode(cmd, params, opts) {
        let s = cmd.template.replace(/\{(\w+)\}/g, (_, name) => {
          const v = params[name];
          // treat an explicit '' the same as absent → use the param default
          let out = (v !== undefined && v !== '') ? String(v) : String(_paramDefault(cmd, name));
          // zero-pad numeric params that declare a fixed width (e.g. HCR WAV file 0000-9999)
          const p = (cmd.params || []).find((x) => x.name === name);
          if (p && p.pad && /^\d+$/.test(out)) out = out.padStart(p.pad, '0');
          return out;
        });
        const ds = cmd._component.routing && cmd._component.routing.durationSuffix;
        if (cmd.supportsDuration && ds && ds.supported && opts.duration !== undefined && opts.duration !== '') {
          s += (ds.sep || '|') + opts.duration;
        }
        if (opts.targetPrefix) s = opts.targetPrefix + s;
        return s;
      },
    },
  };

  function encode(cmd, params, opts) {
    opts = opts || {};
    const enc = _encoders[cmd.encoder || 'template'];
    if (!enc) throw new Error('Unknown encoder: ' + cmd.encoder);
    return enc.encode(cmd, params, opts);
  }

  // Register a custom encoder by name. An encoder is { encode(cmd, params, opts),
  // match(token)? }. Board authors whose grammar cannot be expressed as a simple
  // {placeholder} template use this to plug in a bespoke codec (see rseries-le).
  function registerEncoder(name, impl) {
    if (!name || typeof impl !== 'object' || typeof impl.encode !== 'function') {
      throw new Error('registerEncoder(name, { encode, match? }) requires an encode function');
    }
    _encoders[name] = impl;
  }

  function _escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function _buildTemplateMatcher(cmd) {
    const groups = [];
    const pattern = cmd.template.replace(/\{(\w+)\}|([^{]+)/g, (m, name, lit) => {
      if (lit !== undefined) return _escapeRe(lit);
      const p = (cmd.params || []).find(x => x.name === name);
      groups.push(name);
      if (p && p.enum) {
        const codes = (getEnum(p.enum).values || []).map(v => _escapeRe(v.code))
          .sort((a, b) => b.length - a.length); // longest-first so multi-char codes win
        return '(' + codes.join('|') + ')';
      }
      if (p && p.pattern) {
        // Board-supplied regex fragment (e.g. a hex bitmask '[0-9A-Fa-f]+') so
        // non-numeric free-text values still round-trip. MUST use only non-capturing
        // groups '(?:...)' — a capturing group would shift param↔capture-group indexing.
        return '(' + p.pattern + ')';
      }
      // Allow an optional leading '-' so int params with a negative range
      // (e.g. a rotary speed of -80) re-parse to a structured step, not a raw one.
      return '(-?\\d+)';
    });
    return { re: new RegExp('^' + pattern + '$'), groups };
  }

  // template.match added to the registry:
  _encoders.template.match = function (token) {
    for (const comp of getComponents()) {
      for (const cmd of comp.commands) {
        if ((cmd.encoder || 'template') !== 'template') continue;
        if (!cmd._matcher) Object.defineProperty(cmd, '_matcher', { value: _buildTemplateMatcher(cmd), enumerable: false, configurable: true, writable: true });
        const m = cmd._matcher.re.exec(token);
        if (!m) continue;
        const params = {};
        cmd._matcher.groups.forEach((g, i) => { params[g] = m[i + 1]; });
        return { commandId: cmd.id, params };
      }
    }
    return null;
  };

  function match(token) {
    // strip an optional trailing duration |<digits>
    let duration;
    const dm = /^(.*)\|(\d+)$/.exec(token);
    const core = dm ? dm[1] : token;
    if (dm) duration = parseInt(dm[2], 10);
    for (const name of Object.keys(_encoders)) {
      const hit = _encoders[name].match ? _encoders[name].match(core) : null;
      if (hit) {
        // only accept a duration if the matched command supports it
        const cmd = getCommand(hit.commandId);
        if (duration !== undefined && !(cmd && cmd.supportsDuration)) continue;
        return { commandId: hit.commandId, params: hit.params, duration };
      }
    }
    return null;
  }

  function _stepToken(step) {
    if (step.type === 'raw') return step.text;
    if (step.type === 'delay') return ';t' + step.ms;
    if (step.type === 'comment') return '***' + step.text;
    // command
    const cmd = getCommand(step.commandId);
    if (!cmd) return step.text || '';
    return encode(cmd, step.params || {}, { duration: step.duration, targetPrefix: step.targetPrefix });
  }

  function buildWCBValue(steps) {
    const out = [];
    for (const step of steps) {
      out.push(_stepToken(step));
      if ((step.type === 'command' || step.type === 'raw') && step.label !== undefined) {
        out.push('***' + step.label);
      }
    }
    return out.join('^');
  }

  function parseWCBValue(value) {
    const steps = [];
    const frags = String(value).split('^');
    for (const frag of frags) {
      if (frag.startsWith('***')) {
        const text = frag.slice(3);
        const prev = steps[steps.length - 1];
        if (prev && (prev.type === 'command' || prev.type === 'raw') && prev.label === undefined) {
          prev.label = text;
        } else {
          steps.push({ type: 'comment', text });
        }
        continue;
      }
      const dm = /^;t(\d+)$/.exec(frag);
      if (dm) { steps.push({ type: 'delay', ms: parseInt(dm[1], 10) }); continue; }
      const hit = match(frag);
      if (hit) {
        const step = { type: 'command', commandId: hit.commandId, params: hit.params };
        if (hit.duration !== undefined) step.duration = hit.duration;
        steps.push(step);
      } else {
        steps.push({ type: 'raw', text: frag });
      }
    }
    return steps;
  }

  return {
    loadLibrary, mergeLibrary, merge, deepEqual, getLibraryVersion,
    getComponents, getCommands, getCommand, getEnum,
    encode, registerEncoder, match,
    buildWCBValue, parseWCBValue,
  };
});
