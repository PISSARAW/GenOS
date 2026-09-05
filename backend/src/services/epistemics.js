/**
 * GenOS Epistemic Perception Validation Layer (Rule 2 & 4 Compliant)
 * Validates tool outputs and memory recalls, enforces epistemic states,
 * and intercepts placeholders and unverified hallucinations.
 */

const PLACEHOLDER_PATTERNS = [
  /sujet de secours/i,
  /placeholder recognized/i,
  /\bplaceholder\b/i,
  /lorem ipsum/i,
  /todo: implement/i,
  /unverified claim/i,
  /\[obsolete\/corrected fact - do not use\]/i
];

class EpistemicData {
  constructor(sourceOrConfig, content, isSelf = false) {
    if (sourceOrConfig && typeof sourceOrConfig === 'object') {
      const config = sourceOrConfig;
      this._content = config.content ?? config.value ?? '';
      this.source = config.source ?? config.provenance?.origin ?? (config.isSelf ? 'self' : 'external');
      this.isSelf = Boolean(config.isSelf ?? (this.source === 'self' || this.source === 'memory_core'));
      this.confidence = typeof config.confidence === 'number' ? config.confidence : 1.0;
      this._state = config.state ?? config.epistemic_state ?? 'VALID';
      this.provenance = config.provenance || { origin: this.source };
      this.allowed_ops = Array.isArray(config.allowed_ops) ? [...config.allowed_ops] : [];
      this.forbidden_ops = Array.isArray(config.forbidden_ops) ? [...config.forbidden_ops] : [];
    } else {
      this.source = String(sourceOrConfig || 'unknown');
      this._content = content ?? '';
      this.isSelf = Boolean(isSelf);
      this.confidence = 1.0;
      this._state = 'VALID';
      this.provenance = { origin: this.source };
      this.allowed_ops = [];
      this.forbidden_ops = [];
    }
  }

  get content() {
    return this._content;
  }

  set content(val) {
    this._content = val;
  }

  get value() {
    return this._content;
  }

  set value(val) {
    this._content = val;
  }

  get state() {
    return this._state;
  }

  set state(val) {
    this._state = val;
  }

  get epistemic_state() {
    return this._state;
  }

  set epistemic_state(val) {
    this._state = val;
  }

  isInvalid() {
    return this._state === 'INVALID';
  }

  markInvalid(reason) {
    this._state = 'INVALID';
    this.confidence = 0.0;
    if (reason && !this.forbidden_ops.includes(reason)) {
      this.forbidden_ops.push(reason);
    }
  }

  isOperationAllowed(op) {
    if (this.isInvalid()) return false;
    if (this.forbidden_ops.includes(op)) return false;
    if (this.allowed_ops.length > 0 && !this.allowed_ops.includes(op)) return false;
    return true;
  }
}

function detectPlaceholderOrHallucination(content) {
  const text = String(content || '').trim();
  if (!text) return { isPlaceholder: true, reason: 'Empty content' };
  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(text)) {
      return { isPlaceholder: true, reason: `Pattern matched: ${pattern.source}` };
    }
  }
  return { isPlaceholder: false, reason: null };
}

function processPerception(epistemicData, intendedOperation = null) {
  if (!epistemicData || typeof epistemicData !== 'object') return true;

  const content = epistemicData.content ?? epistemicData.value ?? '';
  const state = epistemicData.state || epistemicData.epistemic_state;

  if (state === 'INVALID') {
    throw new Error(`HALT: Invalid epistemic state - Placeholder recognized (${content})`);
  }

  if (intendedOperation && Array.isArray(epistemicData.forbidden_ops)) {
    if (epistemicData.forbidden_ops.includes(intendedOperation)) {
      throw new Error(`HALT: Invalid epistemic state - Operation "${intendedOperation}" interdite pour la valeur "${content}"`);
    }
  }

  return true;
}

function evaluatePerception(epistemicData, intendedOperation = null) {
  return processPerception(epistemicData, intendedOperation);
}

function validateMemoryPerception(memoryItem, options = {}) {
  const content = typeof memoryItem === 'string'
    ? memoryItem
    : (memoryItem?.summary || memoryItem?.content || memoryItem?.title || '');
  const tags = Array.isArray(memoryItem?.tags) ? memoryItem.tags : [];
  const isObsolete = tags.includes('obsolete_suppressed') || /\[obsolete\/corrected fact/i.test(content);
  const placeholder = detectPlaceholderOrHallucination(content);

  const epistemic = new EpistemicData('memory_core', content, true);
  if (isObsolete || placeholder.isPlaceholder) {
    epistemic.markInvalid('generate');
    epistemic.forbidden_ops.push('act', 'plan');
    epistemic.reason = isObsolete ? 'Obsolete suppressed memory' : placeholder.reason;
  } else {
    epistemic.confidence = typeof memoryItem?.credibility === 'number' ? memoryItem.credibility : 1.0;
  }

  if (options.throwOnInvalid && epistemic.isInvalid()) {
    processPerception(epistemic, options.intendedOperation);
  }
  return epistemic;
}

function validateToolPerception(toolResult, toolName = 'unknown', options = {}) {
  const isError = !toolResult || toolResult.success === false || !!toolResult.error;
  const output = toolResult ? (toolResult.output ?? toolResult.content ?? toolResult) : '';
  const placeholder = detectPlaceholderOrHallucination(output);

  const epistemic = new EpistemicData(`tool:${toolName}`, output, false);
  if (isError || placeholder.isPlaceholder) {
    epistemic.markInvalid('generate');
    epistemic.forbidden_ops.push('execute', 'act');
    epistemic.reason = isError ? (toolResult?.error || 'Tool failed') : placeholder.reason;
  }

  if (options.throwOnInvalid && epistemic.isInvalid()) {
    processPerception(epistemic, options.intendedOperation);
  }
  return epistemic;
}

module.exports = {
  EpistemicData,
  evaluatePerception,
  processPerception,
  detectPlaceholderOrHallucination,
  validateMemoryPerception,
  validateToolPerception
};

