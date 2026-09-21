#!/usr/bin/env node
'use strict';
/**
 * Wrapper pour lancer les runtimes cognitifs sur Windows.
 * Ce fichier utilise execFile au lieu de spawn pour éviter les problèmes
 * de chemins absolus sur Windows (ENOENT).
 */
const path = require('path');
const { execFile } = require('child_process');

// Chemin du node à utiliser (exprimé explicitement pour éviter les problèmes de résolution)
const NODE_PATH = 'C:/Users/Shadow/AppData/Local/hermes/node/node.exe';

// Vérifier que le node existe
if (!require('fs').existsSync(NODE_PATH)) {
  console.error('ERROR: Node.js not found at', NODE_PATH);
  process.exit(1);
}

// Le script à exécuter est passé en premier argument
const scriptToRun = process.argv[2];
if (!scriptToRun) {
  console.error('ERROR: No script specified');
  process.exit(1);
}

// Lancer le script avec execFile (plus robuste sur Windows que spawn)
const child = execFile(NODE_PATH, [scriptToRun], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ['inherit', 'inherit', 'inherit']
});

child.on('close', (code) => {
  process.exit(code || 0);
});

child.on('error', (err) => {
  console.error('ExecFile error:', err.message);
  process.exit(1);
});
