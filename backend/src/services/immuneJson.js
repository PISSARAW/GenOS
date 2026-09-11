/**
 * GenOS Immune JSON Extraction (N6)
 * Greedy `\{[\s\S]*\}` matches swallow several objects and return the
 * outermost span. These helpers parse the FIRST balanced JSON object
 * (brace counting that ignores string literals) and only fall back to the
 * LAST one when the first cannot be parsed. The object returned is always
 * parsed from the exact extracted text (same reference text guaranteed).
 */

function skipString(text, index) {
  let cursor = index + 1;
  while (cursor < text.length) {
    const ch = text[cursor];
    if (ch === '\\') cursor += 1;
    else if (ch === '"') return cursor;
    cursor += 1;
  }
  return cursor;
}

function braceState() {
  return { depth: 0, start: -1 };
}

function trackOpen(state, index) {
  if (state.depth === 0) state.start = index;
  state.depth += 1;
}

function resetBrace(state) {
  state.depth = 0;
  state.start = -1;
}

function trackClose(state, ctx) {
  state.depth -= 1;
  if (state.depth === 0 && state.start !== -1) ctx.spans.push(ctx.source.slice(state.start, ctx.index + 1));
  if (state.depth < 0) resetBrace(state);
}

function balancedSpans(text) {
  const source = String(text || '');
  const spans = [];
  const state = braceState();
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '"') i = skipString(source, i);
    else if (ch === '{') trackOpen(state, i);
    else if (ch === '}') trackClose(state, { spans, source, index: i });
    i += 1;
  }
  return spans;
}

function firstBalancedObject(text) {
  const spans = balancedSpans(text);
  if (spans.length === 0) return null;
  return spans[0];
}

function lastBalancedObject(text) {
  const spans = balancedSpans(text);
  if (spans.length === 0) return null;
  return spans[spans.length - 1];
}

function extractJsonCandidate(cleaned) {
  const first = firstBalancedObject(cleaned);
  if (first) return { text: first, fallback: false };
  const last = lastBalancedObject(cleaned);
  if (last) return { text: last, fallback: true };
  return null;
}

function parseJsonCandidate(candidate) {
  const parsed = JSON.parse(candidate.text);
  if (!parsed || typeof parsed !== 'object') throw new Error('No JSON object detected.');
  return { parsed, sourceText: candidate.text };
}

function cleanMarkdownAndNoise(raw) {
  let text = String(raw || '').trim();
  text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  const inner = firstBalancedObject(text);
  if (inner) text = inner;
  return text.replace(/,\s*([}\]])/g, '$1');
}

function arrayScanState(text, startIndex) {
  return { text, depth: 0, inString: false, escape: false, start: -1, index: startIndex, result: null, failed: false };
}

function arrayOpen(state) {
  if (state.depth === 0) state.start = state.index;
  state.depth += 1;
}

function arrayClose(state) {
  state.depth -= 1;
  if (state.depth === 0 && state.start !== -1) state.result = state.text.slice(state.start, state.index + 1);
  if (state.depth < 0) state.failed = true;
}

function scanArrayChar(state) {
  const ch = state.text[state.index];
  if (state.escape) { state.escape = false; return; }
  if (ch === '\\') { state.escape = true; return; }
  if (ch === '"') { state.inString = !state.inString; return; }
  if (state.inString) return;
  if (ch === '[') arrayOpen(state);
  else if (ch === ']') arrayClose(state);
}

function scanBalancedArray(text, startIndex) {
  const state = arrayScanState(text, startIndex);
  while (state.index < state.text.length && !state.result && !state.failed) {
    scanArrayChar(state);
    state.index += 1;
  }
  return state.result;
}

function extractBalancedArray(text, startIndex) {
  return scanBalancedArray(text, startIndex);
}

function extractClaimsFromText(text) {
    const match = text.match(/"claims"\s*:/i);
    if (match) {
        const colonIndex = text.indexOf(':', match.index);
        const bracketIndex = text.indexOf('[', colonIndex);
        if (bracketIndex !== -1) {
            const rawArray = extractBalancedArray(text, bracketIndex);
            if (rawArray) {
                try {
                    const parsed = JSON.parse(rawArray);
                    if (Array.isArray(parsed)) return parsed;
                } catch (_) {}
            }
        }
    }
    return null;
}

module.exports = {
  firstBalancedObject,
  lastBalancedObject,
  extractJsonCandidate,
  parseJsonCandidate,
  cleanMarkdownAndNoise,
  extractBalancedArray,
  extractClaimsFromText
};
