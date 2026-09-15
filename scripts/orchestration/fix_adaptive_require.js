#!/usr/bin/env node
'use strict';
/**
 * Corrige le require('../../../adaptiveStateBootstrap') → require('../../adaptiveStateBootstrap')
 * dans les handlers patchetés.
 */
const fs = require('fs');
const path = require('path');
const HANDLERS_DIR = 'backend/src/services/mcpBioTools/handlers';
const files = fs.readdirSync(HANDLERS_DIR).filter(f => f.endsWith('.js') && !f.endsWith('Proxy.js'));
let fixed = 0;
for (const f of files) {
  const filePath = path.join(HANDLERS_DIR, f);
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes("require('../../../adaptiveStateBootstrap')")) {
    content = content.replace(
      "require('../../../adaptiveStateBootstrap')",
      "require('../../adaptiveStateBootstrap')"
    );
    fs.writeFileSync(filePath, content, 'utf8');
    fixed++;
  }
}
console.log(`Correction des ${fixed} handlers avec chemin de require corrigé.`);
