/*! droidnet hosted site — reference page glue. */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  document.addEventListener('DOMContentLoaded', function () {
    var root = document.getElementById('catalog');
    var search = document.getElementById('search');
    var errzone = document.getElementById('errzone');
    var Boot = window.DroidNetComposerBoot;
    var E = window.DroidNetCommandLibrary;

    function paramDesc(p) {
      if (p.enum) {
        var vals = (E.getEnum(p.enum) || { values: [] }).values || [];
        var opts = vals.map(function (v) { return esc(v.code) + '=' + esc(v.label); }).join(', ');
        return '<b>' + esc(p.name) + '</b>: ' + opts;
      }
      var rng = [];
      if (p.min !== undefined) rng.push('min ' + esc(p.min));
      if (p.max !== undefined) rng.push('max ' + esc(p.max));
      return '<b>' + esc(p.name) + '</b>: int' + (rng.length ? ' (' + rng.join(', ') + ')' : '');
    }

    function cmdHtml(boardName, cmd) {
      var ex = (cmd.examples && cmd.examples[0]) || '';
      var params = (cmd.params || []).map(function (p) { return '<li>' + paramDesc(p) + '</li>'; }).join('');
      var hay = (boardName + ' ' + cmd.name + ' ' + cmd.id + ' ' + (cmd.template || '')).toLowerCase();
      var badges = '<span class="dn-badge dn-safety-' + esc(cmd.safety || 'cosmetic') + '">' + esc(cmd.safety || '') + '</span>'
        + (cmd.supportsDuration ? '<span class="dn-badge">duration</span>' : '');
      var foot = ex
        ? '<div class="dn-cmd-foot"><code class="dn-ex">' + esc(ex) + '</code>'
          + '<a class="dn-try" href="index.html?s=' + encodeURIComponent(ex) + '">Try in composer →</a></div>'
        : '';
      return '<div class="dn-cmd" data-hay="' + esc(hay) + '">'
        + '<div class="dn-cmd-head"><span class="dn-cmd-name">' + esc(cmd.name) + '</span>'
        + '<code class="dn-cmd-id">' + esc(cmd.id) + '</code>' + badges + '</div>'
        + '<code class="dn-tmpl">' + esc(cmd.template || '') + '</code>'
        + (params ? '<ul class="dn-params">' + params + '</ul>' : '')
        + foot + '</div>';
    }

    function render() {
      root.innerHTML = E.getComponents().map(function (c) {
        var rows = (E.getCommands(c.id) || []).map(function (cmd) { return cmdHtml(c.name, cmd); }).join('');
        return '<section class="dn-board">'
          + '<h2 class="dn-board-name">' + esc(c.name)
          + '<span class="dn-badge dn-conf-' + esc(c.confidence || '') + '">' + esc(c.confidence || '') + '</span>'
          + '<span class="dn-badge">' + esc(c.kind || '') + '</span></h2>'
          + rows + '</section>';
      }).join('');
    }

    function applyFilter() {
      var q = search.value.trim().toLowerCase();
      var cmds = root.querySelectorAll('.dn-cmd');
      for (var i = 0; i < cmds.length; i++) {
        var hay = cmds[i].getAttribute('data-hay');
        cmds[i].style.display = (!q || hay.indexOf(q) !== -1) ? '' : 'none';
      }
      var boards = root.querySelectorAll('.dn-board');
      for (var j = 0; j < boards.length; j++) {
        var visible = boards[j].querySelectorAll('.dn-cmd');
        var any = false;
        for (var k = 0; k < visible.length; k++) { if (visible[k].style.display !== 'none') { any = true; break; } }
        boards[j].style.display = any ? '' : 'none';
      }
    }

    Boot.load().then(function (info) {
      var badge = document.getElementById('libver');
      if (badge) badge.textContent = 'library v' + info.libraryVersion;
      render();
      search.addEventListener('input', applyFilter);
    }).catch(function (err) { Boot.renderError(errzone, err); });
  });
})();
