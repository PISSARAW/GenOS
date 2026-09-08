function parseWorkflowCondition(condition) {
  const text = String(condition ?? '').trim();
  if (!text) return () => true;
  if (text.toLowerCase() === 'true') return () => true;
  if (text.toLowerCase() === 'false') return () => false;
  const match = text.match(/^input\.([A-Za-z_][\w-]*)\s*===?\s*(?:"([^"\r\n]*)"|'([^'\r\n]*)'|([^\s"']+))$/);
  if (!match) throw new Error('Unsupported workflow condition.');
  const expected = match[2] ?? match[3] ?? match[4];
  return (input = {}) => String(input[match[1]]) === expected;
}

function validateWorkflowCondition(condition) {
  try { parseWorkflowCondition(condition); return true; } catch (_) { return false; }
}

module.exports = { parseWorkflowCondition, validateWorkflowCondition };
