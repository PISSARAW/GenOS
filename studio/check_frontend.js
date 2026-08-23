/**
 * GenOS Studio Frontend Compliance & Verification Script
 * Validates:
 * 1. File line count <= 400 lines
 * 2. Function parameters count <= 3
 * 3. 0 CSS gradients (linear-gradient, radial-gradient, conic-gradient)
 * 4. 0 Emojis in source code
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(__dirname, 'src');

function getAllFiles(dir, exts = ['.ts', '.tsx', '.css', '.js', '.jsx']) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllFiles(filePath, exts));
    } else if (exts.includes(path.extname(file))) {
      results.push(filePath);
    }
  });
  return results;
}

const emojiRegex = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2300}-\u{23FF}]/u;

let passed = true;
const files = getAllFiles(SRC_DIR);

console.log(`\n========================================`);
console.log(`🔍 GenOS Frontend Static Analysis Audit`);
console.log(`Checking ${files.length} source files in studio/src...`);
console.log(`========================================\n`);

// 1. Line Count Check (<= 400 lines)
console.log(`--- [1/4] Checking File Line Counts (<= 400 lines) ---`);
let lineErrors = 0;
files.forEach((file) => {
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n').length;
  const relPath = path.relative(__dirname, file);
  if (lines > 400) {
    console.error(`❌ VIOLATION: ${relPath} has ${lines} lines (> 400)`);
    lineErrors++;
    passed = false;
  }
});
if (lineErrors === 0) {
  console.log(`✅ All ${files.length} files are <= 400 lines.`);
}

// 2. CSS Gradients Check (0 gradients)
console.log(`\n--- [2/4] Checking CSS Gradients (0 gradients allowed) ---`);
let gradientErrors = 0;
files.forEach((file) => {
  const content = fs.readFileSync(file, 'utf-8');
  const relPath = path.relative(__dirname, file);
  const matches = content.match(/(linear-gradient|radial-gradient|conic-gradient)/gi);
  if (matches) {
    console.error(`❌ VIOLATION: ${relPath} contains gradient: ${matches.join(', ')}`);
    gradientErrors++;
    passed = false;
  }
});
if (gradientErrors === 0) {
  console.log(`✅ 0 gradients found across all source and styling files.`);
}

// 3. Emojis Check (0 emojis)
console.log(`\n--- [3/4] Checking Emojis (0 emojis allowed) ---`);
let emojiErrors = 0;
files.forEach((file) => {
  const content = fs.readFileSync(file, 'utf-8');
  const relPath = path.relative(__dirname, file);
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (emojiRegex.test(line)) {
      console.error(`❌ VIOLATION: ${relPath}:${idx + 1} contains emoji: ${line.trim()}`);
      emojiErrors++;
      passed = false;
    }
  });
});
if (emojiErrors === 0) {
  console.log(`✅ 0 emojis found in UI and source files.`);
}

// 4. Function Parameter Count Check (<= 3 params)
console.log(`\n--- [4/4] Checking Function Parameters (<= 3 params) ---`);
let paramErrors = 0;
const tsFiles = files.filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));
tsFiles.forEach((file) => {
  const content = fs.readFileSync(file, 'utf-8');
  const relPath = path.relative(__dirname, file);
  
  // Regex to check function definitions: function foo(a, b, c, d) or (a, b, c, d) =>
  const funcMatches = content.matchAll(/(?:function\s+([a-zA-Z0-9_]+)?\s*|([a-zA-Z0-9_]+)\s*=\s*(?:async\s*)?)\(([^)]*)\)/g);
  for (const match of funcMatches) {
    const rawParams = match[3].trim();
    if (!rawParams) continue;
    // Don't split nested generic types or destructuring incorrectly
    // Count top-level commas
    let depth = 0;
    let paramCount = 1;
    for (let i = 0; i < rawParams.length; i++) {
      const char = rawParams[i];
      if (char === '<' || char === '(' || char === '{' || char === '[') depth++;
      else if (char === '>' || char === ')' || char === '}' || char === ']') depth--;
      else if (char === ',' && depth === 0) paramCount++;
    }
    if (paramCount > 3) {
      const funcName = match[1] || match[2] || 'anonymous';
      console.error(`❌ VIOLATION: ${relPath} function '${funcName}' has ${paramCount} parameters (> 3): (${rawParams})`);
      paramErrors++;
      passed = false;
    }
  }
});
if (paramErrors === 0) {
  console.log(`✅ All functions have <= 3 parameters.`);
}

console.log(`\n========================================`);
if (passed) {
  console.log(`🎉 ALL FRONTEND RULES & CONSTRAINTS PASSED AUDIT!`);
  console.log(`========================================\n`);
  process.exit(0);
} else {
  console.error(`💥 AUDIT FAILED WITH COMPLIANCE ERRORS.`);
  console.log(`========================================\n`);
  process.exit(1);
}
