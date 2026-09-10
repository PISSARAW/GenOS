const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function walk(directory, relative = '') {
  let results = [];
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const resolved = path.join(directory, entry.name);
    const rel = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(await walk(resolved, rel));
    } else if (entry.isFile()) {
      results.push(rel.replace(/\\/g, '/'));
    }
  }
  return results;
}

function spawnGit(first, second) {
  const args = Array.isArray(first) ? first : second;
  const cwd = Array.isArray(first) ? second : first;
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => stdout += data);
    child.stderr.on('data', (data) => stderr += data);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`Git error: ${stderr}`));
      else resolve(stdout);
    });
    child.on('error', reject);
  });
}

module.exports = { walk, spawnGit };
