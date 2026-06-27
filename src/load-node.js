/*!
 * droidnet-command-library/node-loader — read the manifest + board files from
 * disk and merge them into the engine. Node-only (uses fs); dependency-free.
 *
 * Licensed under the Mozilla Public License 2.0 (see LICENSE).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const engine = require('./droidnet-command-library.js');

const DEFAULT_LIB_DIR = path.join(__dirname, '..', 'libraries');

function readCatalog(libDir) {
  libDir = libDir || DEFAULT_LIB_DIR;
  const manifest = JSON.parse(fs.readFileSync(path.join(libDir, 'manifest.json'), 'utf8'));
  const boards = manifest.boards.map(b => JSON.parse(fs.readFileSync(path.join(libDir, b.file), 'utf8')));
  return { manifest, boards };
}

function loadCatalog(opts) {
  opts = opts || {};
  const { manifest, boards } = readCatalog(opts.libDir);
  if (opts.load === false) return engine.merge(boards, { libraryVersion: manifest.libraryVersion });
  engine.loadLibrary(boards, { libraryVersion: manifest.libraryVersion });
  return engine;
}

module.exports = { readCatalog, loadCatalog };
