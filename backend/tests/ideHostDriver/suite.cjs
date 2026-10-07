'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vscode = require('vscode');

async function run() {
  const config = JSON.parse(fs.readFileSync(process.env.B06_IDE_CONFIG, 'utf8'));
  const extension = vscode.extensions.getExtension('genos.genos-runtime-client');
  assert.ok(extension, 'Installed extension must be discovered by the real extension host');
  const relative = path.relative(config.extensionsDir, extension.extensionPath);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'Use the installed VSIX, not the development source');
  const api = await extension.activate();
  await api.configure(config.settings, config.token);
  const first = await vscode.commands.executeCommand('genos.connect');
  const state = await vscode.commands.executeCommand('genos.inspect');
  assert.equal(state.run.id, config.runId);
  assert.equal(state.run.status, 'completed');
  assert.equal(state.promotion.phase, 'completed');
  assert.equal(state.provenance[0].memories.length, 1);
  assert.equal(state.snapshots.length, 1);
  const editor = vscode.window.activeTextEditor;
  assert.ok(editor, 'Inspection opens a real IDE editor');
  assert.equal(JSON.parse(editor.document.getText()).run.id, config.runId);
  await vscode.commands.executeCommand('genos.disconnect');
  await api.configure(config.settings, config.token);
  const second = await vscode.commands.executeCommand('genos.connect');
  assert.equal(second.id, first.id, 'Reconnect preserves the durable client identity');
  const reconnected = await vscode.commands.executeCommand('genos.inspect');
  assert.equal(reconnected.provenance[0].hash, state.provenance[0].hash);
  await vscode.commands.executeCommand('genos.disconnect');
  fs.writeFileSync(config.resultPath, JSON.stringify({ runId: config.runId, extensionPath: extension.extensionPath,
    vscodeVersion: vscode.version, integrationId: first.id, reconnectedIntegrationId: second.id,
    editorLanguage: editor.document.languageId, provenance: state.provenance, snapshots: state.snapshots }, null, 2));
}

module.exports = { run };
