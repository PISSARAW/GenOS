'use strict';
const assert=require('node:assert/strict');
const {ensureJsonExport}=require('../src/services/workerCodeExportRepair');
const result=ensureJsonExport('<form><button type="submit" onclick="oldExport()">Export JSON</button></form><script>let pantry=[];</script>');
assert.match(result,/<button type="button" onclick="exportPantryJSON\(\)">Export JSON<\/button>/);
assert.match(result,/link\.download='pantry\.json'/);
console.log('Pantry download button repair checks passed.');
