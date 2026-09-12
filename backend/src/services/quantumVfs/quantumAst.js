/**
 * @file quantumAst.js
 * @description Point 1 du Quantum VFS : La Quantification (Quanta d'Édition).
 * Transposition du principe quantique E = h*nu à l'intégrité logicielle :
 * Les fichiers ne sont plus modifiés par flux de caractères arbitraires continus,
 * mais par transitions discrètes de quanta syntaxiques et sémantiques indivisibles.
 */

const crypto = require('crypto');

// Constante de Planck logicielle (quantum élémentaire d'action syntaxique)
const PLANCK_SYNTACTIC_CONSTANT = 1.054571817e-34;
const MIN_QUANTUM_ENERGY = 1.0;

/**
 * Types de quanta syntaxiques reconnus dans le VFS
 */
const QuantumType = Object.freeze({
  IMPORT_BLOCK: 'IMPORT_BLOCK',
  FUNCTION: 'FUNCTION',
  CLASS: 'CLASS',
  VARIABLE_DECLARATION: 'VARIABLE_DECLARATION',
  INTERFACE_TYPE: 'INTERFACE_TYPE',
  EXPORT_BLOCK: 'EXPORT_BLOCK',
  ATOMIC_STATEMENT: 'ATOMIC_STATEMENT'
});

/**
 * Calcule l'empreinte cryptographique d'un quantum
 */
function hashQuantum(content) {
  return crypto.createHash('sha256').update(content.trim()).digest('hex');
}

/**
 * Représente un quantum d'AST indivisible
 */
class AstQuantum {
  constructor({ id, type, content, lineStart, lineEnd, energy = MIN_QUANTUM_ENERGY }) {
    this.id = id || `qnt_${crypto.randomBytes(6).toString('hex')}`;
    this.type = type || QuantumType.ATOMIC_STATEMENT;
    this.content = String(content || '');
    this.lineStart = Number.isInteger(lineStart) ? lineStart : 1;
    this.lineEnd = Number.isInteger(lineEnd) ? lineEnd : this.lineStart;
    this.energy = Math.max(MIN_QUANTUM_ENERGY, Number(energy) || MIN_QUANTUM_ENERGY);
    this.hash = hashQuantum(this.content);
  }

  /**
   * Vérifie la validité structurelle du quantum (intégrité atomique)
   */
  validate() {
    if (!this.content || typeof this.content !== 'string' || !this.content.trim()) {
      return { valid: false, reason: 'Le contenu du quantum ne peut être vide.' };
    }
    // Vérification de fermeture des parenthèses/accolades pour garantir l'indivisibilité
    let braces = 0;
    let parens = 0;
    let brackets = 0;
    for (const char of this.content) {
      if (char === '{') braces++;
      else if (char === '}') braces--;
      else if (char === '(') parens++;
      else if (char === ')') parens--;
      else if (char === '[') brackets++;
      else if (char === ']') brackets--;
      if (braces < 0 || parens < 0 || brackets < 0) {
        return { valid: false, reason: 'Rupture de confinement : parenthèses ou accolades non équilibrées.' };
      }
    }
    if (braces !== 0 || parens !== 0 || brackets !== 0) {
      return { valid: false, reason: 'Quantum incomplet : état de demi-déclaration interdit par la barrière de Planck.' };
    }
    return { valid: true };
  }
}

/**
 * Décompose un contenu textuel source en quanta syntaxiques discrets
 */
function decomposeIntoQuanta(sourceCode, language = 'javascript') {
  if (typeof sourceCode !== 'string') return [];
  const lines = sourceCode.split('\n');
  const quanta = [];
  let currentBuffer = [];
  let startLine = 1;
  let braceDepth = 0;
  let currentType = QuantumType.ATOMIC_STATEMENT;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (currentBuffer.length === 0) {
      startLine = i + 1;
      if (trimmed.startsWith('import ') || (trimmed.startsWith('const ') && trimmed.includes('require('))) {
        currentType = QuantumType.IMPORT_BLOCK;
      } else if (/^(async\s+)?function\s+/.test(trimmed) || /^(pub\s+)?fn\s+/.test(trimmed)) {
        currentType = QuantumType.FUNCTION;
      } else if (/^(export\s+)?class\s+/.test(trimmed) || /^(pub\s+)?struct\s+/.test(trimmed)) {
        currentType = QuantumType.CLASS;
      } else if (/^(export\s+)?(type|interface)\s+/.test(trimmed)) {
        currentType = QuantumType.INTERFACE_TYPE;
      } else if (trimmed.startsWith('module.exports') || trimmed.startsWith('export default')) {
        currentType = QuantumType.EXPORT_BLOCK;
      } else {
        currentType = QuantumType.ATOMIC_STATEMENT;
      }
    }

    currentBuffer.push(line);

    for (const ch of line) {
      if (ch === '{') braceDepth++;
      else if (ch === '}') braceDepth--;
    }

    const isStatementTerminator = trimmed.endsWith(';') || trimmed === '}' || trimmed === '';
    if (braceDepth === 0 && (isStatementTerminator || currentType === QuantumType.IMPORT_BLOCK)) {
      const quantumContent = currentBuffer.join('\n');
      if (quantumContent.trim().length > 0) {
        quanta.push(new AstQuantum({
          type: currentType,
          content: quantumContent,
          lineStart: startLine,
          lineEnd: i + 1,
          energy: Math.max(1.0, currentBuffer.length * 0.5)
        }));
      }
      currentBuffer = [];
    }
  }

  if (currentBuffer.length > 0) {
    const remaining = currentBuffer.join('\n');
    if (remaining.trim().length > 0) {
      quanta.push(new AstQuantum({
        type: currentType,
        content: remaining,
        lineStart: startLine,
        lineEnd: lines.length,
        energy: Math.max(1.0, currentBuffer.length * 0.5)
      }));
    }
  }

  return quanta;
}

/**
 * Calcule l'Action de Planck requise pour une transition d'état de fichier
 * Action S = sum(E_i)
 */
function calculateActionPotential(quanta = []) {
  return quanta.reduce((sum, q) => sum + (q.energy || MIN_QUANTUM_ENERGY), 0.0);
}

/**
 * Applique une transition atomique quantifiée sur un contenu de fichier
 */
function applyQuantumTransition(baseContent, operations = []) {
  const currentQuanta = decomposeIntoQuanta(baseContent);

  for (const op of operations) {
    if (op.quantum) {
      const validation = op.quantum.validate();
      if (!validation.valid) {
        throw new Error(`Barrière de Planck violée : transition interdite (${validation.reason})`);
      }
    }
  }

  const workingQuanta = [...currentQuanta];

  for (const op of operations) {
    const action = op.action;
    if (action === 'replace') {
      const targetIndex = workingQuanta.findIndex(q => q.hash === op.targetHash || q.id === op.targetId);
      if (targetIndex === -1) {
        throw new Error(`État cible non trouvé pour remplacement de quantum (hash/id: ${op.targetHash || op.targetId})`);
      }
      workingQuanta[targetIndex] = op.quantum;
    } else if (action === 'delete') {
      const targetIndex = workingQuanta.findIndex(q => q.hash === op.targetHash || q.id === op.targetId);
      if (targetIndex === -1) {
        throw new Error(`État cible non trouvé pour absorption de quantum (hash/id: ${op.targetHash || op.targetId})`);
      }
      workingQuanta.splice(targetIndex, 1);
    } else if (action === 'insert') {
      const atIndex = Number.isInteger(op.index) ? Math.min(workingQuanta.length, Math.max(0, op.index)) : workingQuanta.length;
      workingQuanta.splice(atIndex, 0, op.quantum);
    }
  }

  const reconstitutedContent = workingQuanta.map(q => q.content).join('\n');
  const actionPotential = calculateActionPotential(workingQuanta);

  return {
    success: true,
    content: reconstitutedContent,
    quantaCount: workingQuanta.length,
    actionPotential,
    quanta: workingQuanta
  };
}

module.exports = {
  PLANCK_SYNTACTIC_CONSTANT,
  MIN_QUANTUM_ENERGY,
  QuantumType,
  AstQuantum,
  decomposeIntoQuanta,
  calculateActionPotential,
  applyQuantumTransition
};
