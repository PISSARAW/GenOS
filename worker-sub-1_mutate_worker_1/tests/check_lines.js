const fs = require('fs');
const path = require('path');

function checkDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      checkDir(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.ts'))) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n').length;
      console.log(`${lines} lines : ${path.relative(path.resolve(__dirname, '..'), fullPath)}`);
      if (lines > 400) {
        console.error(`❌ VIOLATION: ${fullPath} has ${lines} lines (>400)`);
      }
    }
  }
}

console.log('Checking file lengths in backend/src and backend root:');
checkDir(path.resolve(__dirname));
