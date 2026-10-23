'use strict';
const assert=require('node:assert/strict');
const {ensureJsonExport}=require('../src/services/workerCodeExportRepair');
const result=ensureJsonExport('<form><button type="submit" onclick="exportPantryJSON()" aria-label="Add Item">Add Item</button><button onclick="exportPantry()" aria-label="Export JSON">Export</button></form><script>let pantry=[];</script>');
assert.match(result,/<button type="submit" onclick="exportPantryJSON\(\)" aria-label="Add Item">Add Item<\/button>/);
assert.match(result,/<button[^>]*aria-label="Export JSON"[^>]*type="button"[^>]*>Export<\/button>/);
assert.match(result,/link\.download='pantry\.json'/);
console.log('Pantry download button repair checks passed.');
