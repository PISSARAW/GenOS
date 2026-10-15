'use strict';
const fs = require('fs');
const { createHash } = require('crypto');
for (const file of process.argv.slice(2)) {
  console.log(createHash('sha256').update(fs.readFileSync(file)).digest('hex'), file);
}
