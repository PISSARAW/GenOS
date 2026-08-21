import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const SRC_DIR = path.resolve('src');

const EMOJI_REGEX = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;

const GRADIENT_PATTERNS = [
  /linear-gradient/i,
  /radial-gradient/i,
  /conic-gradient/i,
  /repeating-linear-gradient/i,
  /repeating-radial-gradient/i,
  /bg-gradient/i,
  /gradient-to-/i
];

function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (file !== 'assets') {
        getAllFiles(filePath, fileList);
      }
    } else {
      const ext = path.extname(file);
      if (['.ts', '.tsx', '.css', '.js', '.jsx', '.json'].includes(ext)) {
        fileList.push(filePath);
      }
    }
  }
  return fileList;
}

function countFunctionsAndCheckParams(sourceFile) {
  let funcCount = 0;
  let maxParams = 0;
  const violations = [];

  function visit(node) {
    let isFunction = false;
    let funcName = '<anonymous>';
    let paramCount = 0;

    if (ts.isFunctionDeclaration(node)) {
      isFunction = true;
      funcName = node.name ? node.name.text : '<anonymous>';
      paramCount = node.parameters.length;
    } else if (ts.isFunctionExpression(node)) {
      isFunction = true;
      funcName = node.name ? node.name.text : '<anonymous>';
      paramCount = node.parameters.length;
    } else if (ts.isArrowFunction(node)) {
      isFunction = true;
      const parent = node.parent;
      if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
        funcName = parent.name.text;
      } else if (parent && ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
        funcName = parent.name.text;
      }
      paramCount = node.parameters.length;
    } else if (ts.isMethodDeclaration(node)) {
      isFunction = true;
      funcName = node.name ? node.name.getText(sourceFile) : '<method>';
      paramCount = node.parameters.length;
    } else if (ts.isConstructorDeclaration(node)) {
      isFunction = true;
      funcName = 'constructor';
      paramCount = node.parameters.length;
    }

    if (isFunction) {
      funcCount++;
      if (paramCount > maxParams) maxParams = paramCount;
      if (paramCount > 3) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        violations.push({
          line: line + 1,
          column: character + 1,
          name: funcName,
          paramCount,
          params: node.parameters.map(p => p.getText(sourceFile))
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { funcCount, maxParams, violations };
}

async function runStaticScan() {
  const files = getAllFiles(SRC_DIR).sort();
  console.log(`Auditing ${files.length} studio source files...\n`);

  const fileReports = [];

  for (const filePath of files) {
    const relPath = path.relative(SRC_DIR, filePath).replace(/\\/g, '/');
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const lineCount = lines.length;

    let gradientCount = 0;
    for (const line of lines) {
      for (const pattern of GRADIENT_PATTERNS) {
        if (pattern.test(line)) gradientCount++;
      }
    }

    let emojiCount = 0;
    for (const line of lines) {
      if (EMOJI_REGEX.test(line)) emojiCount++;
    }

    let funcCount = 0;
    let maxParams = 0;
    let paramViolations = [];

    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
      const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true,
        filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
      );
      const res = countFunctionsAndCheckParams(sourceFile);
      funcCount = res.funcCount;
      maxParams = res.maxParams;
      paramViolations = res.violations;
    }

    fileReports.push({
      file: relPath,
      lineCount,
      funcCount,
      maxParams,
      gradientCount,
      emojiCount,
      paramViolations,
      pass: lineCount <= 400 && paramViolations.length === 0 && gradientCount === 0 && emojiCount === 0
    });
  }

  console.log('| # | File Path | Lines (<=400) | Funcs | Max Params (<=3) | Gradients (0) | Emojis (0) | Status |');
  console.log('|---|---|---|---|---|---|---|---|');
  fileReports.forEach((r, idx) => {
    console.log(`| ${idx + 1} | \`src/${r.file}\` | ${r.lineCount} | ${r.funcCount} | ${r.maxParams} | ${r.gradientCount} | ${r.emojiCount} | ${r.pass ? 'PASS' : 'FAIL'} |`);
  });

  const totalLines = fileReports.reduce((sum, r) => sum + r.lineCount, 0);
  const totalFuncs = fileReports.reduce((sum, r) => sum + r.funcCount, 0);
  const failedFiles = fileReports.filter(r => !r.pass);

  console.log('\n===============================================================');
  console.log(`Total Files Audited: ${fileReports.length}`);
  console.log(`Total Lines of Code: ${totalLines}`);
  console.log(`Total AST Functions: ${totalFuncs}`);
  console.log(`Failed Files: ${failedFiles.length}`);
  console.log(`Overall Compliance: ${failedFiles.length === 0 ? '100% PASS' : 'FAIL'}`);
  console.log('===============================================================');
}

runStaticScan().catch(err => {
  console.error(err);
  process.exit(1);
});
