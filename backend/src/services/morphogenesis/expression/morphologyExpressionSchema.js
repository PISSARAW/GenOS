'use strict';

const EXPRESSION_KINDS = Object.freeze(['TOPOLOGY', 'NEST', 'PARALLEL', 'SEQUENCE', 'GATE', 'COMPETE', 'WRAP', 'BRIDGE', 'FEDERATE']);
const NODE_KINDS = Object.freeze(['TOPOLOGY', 'OPERATOR', 'GATE', 'ADAPTER', 'ENVIRONMENT', 'DIRECT_WORKER']);
const PORT_TYPES = Object.freeze(['INPUT', 'OUTPUT', 'STATE', 'EVIDENCE', 'CONTROL', 'RESOURCE']);
const COMPOSITE_KINDS = ['NEST', 'PARALLEL', 'SEQUENCE', 'GATE', 'COMPETE', 'WRAP', 'BRIDGE', 'FEDERATE'];

function validateExpression(expr) {
  const errors = [];
  if (!expr || typeof expr !== 'object') return { valid: false, errors: ['Expression must be an object'] };
  if (!expr.kind || !EXPRESSION_KINDS.includes(expr.kind)) errors.push(`Invalid or missing kind. Must be one of: ${EXPRESSION_KINDS.join(', ')}`);

  const validators = { TOPOLOGY: validateTopology, NEST: validateNest, GATE: validateGate, WRAP: validateWrap, BRIDGE: validateBridge, FEDERATE: validateFederate };
  if (validators[expr.kind]) validators[expr.kind](expr, errors);
  else if (COMPOSITE_KINDS.includes(expr.kind)) validateChildren(expr, errors);

  if (expr.nodeKind !== undefined && !NODE_KINDS.includes(expr.nodeKind)) errors.push(`Invalid nodeKind. Must be one of: ${NODE_KINDS.join(', ')}`);
  if (expr.ports !== undefined) validatePorts(expr.ports, errors);

  return { valid: errors.length === 0, errors };
}

function validateTopology(expr, errors) { if (!expr.topology || typeof expr.topology !== 'string') errors.push('TOPOLOGY expression requires a string topology field'); if (expr.variant !== undefined && typeof expr.variant !== 'string') errors.push('TOPOLOGY variant must be a string'); }
function validateNest(expr, errors) { if (!expr.host || !expr.inner) errors.push('NEST requires both host and inner expressions'); else { addPrefixedErrors(validateExpression(expr.host).errors, 'host', errors); addPrefixedErrors(validateExpression(expr.inner).errors, 'inner', errors); } }
function validateGate(expr, errors) { if (!expr.condition || !expr.thenBranch || !expr.elseBranch) errors.push('GATE requires condition, thenBranch, and elseBranch expressions'); else { addPrefixedErrors(validateExpression(expr.condition).errors, 'condition', errors); addPrefixedErrors(validateExpression(expr.thenBranch).errors, 'thenBranch', errors); addPrefixedErrors(validateExpression(expr.elseBranch).errors, 'elseBranch', errors); } }
function validateWrap(expr, errors) { if (!expr.inner || !expr.environment) errors.push('WRAP requires inner expression and environment'); else { addPrefixedErrors(validateExpression(expr.inner).errors, 'inner', errors); if (typeof expr.environment !== 'string' && typeof expr.environment !== 'object') errors.push('WRAP environment must be a string or object'); } }
function validateBridge(expr, errors) { if (!expr.source || !expr.target || !expr.adapter) errors.push('BRIDGE requires source, target, and adapter expressions'); else { addPrefixedErrors(validateExpression(expr.source).errors, 'source', errors); addPrefixedErrors(validateExpression(expr.target).errors, 'target', errors); if (typeof expr.adapter !== 'string' && typeof expr.adapter !== 'object') errors.push('BRIDGE adapter must be a string or object'); } }
function validateFederate(expr, errors) { if (!Array.isArray(expr.members) || expr.members.length < 2) errors.push('FEDERATE requires at least 2 member expressions'); else expr.members.forEach((m, i) => addPrefixedErrors(validateExpression(m).errors, `member[${i}]`, errors)); if (expr.quorum !== undefined && (typeof expr.quorum !== 'number' || expr.quorum < 1)) errors.push('FEDERATE quorum must be a positive number'); }
function validateChildren(expr, errors) { if (!Array.isArray(expr.children) || expr.children.length === 0) errors.push(`${expr.kind} requires a non-empty children array`); else expr.children.forEach((c, i) => addPrefixedErrors(validateExpression(c).errors, `children[${i}]`, errors)); }
function addPrefixedErrors(childErrors, prefix, errors) { errors.push(...childErrors.map(e => `${prefix}: ${e}`)); }
function validatePorts(ports, errors) { if (!Array.isArray(ports)) { errors.push('ports must be an array'); return; } ports.forEach((port, i) => { if (!port.name || typeof port.name !== 'string') errors.push(`ports[${i}]: missing or invalid name`); if (!port.type || !PORT_TYPES.includes(port.type)) errors.push(`ports[${i}]: invalid type, must be one of ${PORT_TYPES.join(', ')}`); if (port.direction !== undefined && !['in', 'out', 'bidirectional'].includes(port.direction)) errors.push(`ports[${i}]: direction must be in, out, or bidirectional`); }); }

function validateGraphNode(node) {
  const errors = [];
  if (!node || typeof node !== 'object') return { valid: false, errors: ['Node must be an object'] };
  checkNodeId(node, errors);
  checkNodeKind(node, errors);
  checkNodeTopology(node, errors);
  checkOptStr({ node, field: 'parentNodeId', msg: 'parentNodeId must be a string or null', errors });
  checkChildrenArray(node, errors);
  if (node.ports !== undefined) validateNodePorts(node.ports, errors);
  checkBudget(node, errors);
  checkOptStr({ node, field: 'scope', msg: 'scope must be a string', errors });
  checkOptStr({ node, field: 'mission', msg: 'mission must be a string', errors });
  return { valid: errors.length === 0, errors };
}

function checkNodeId(node, errors) { if (!node.nodeId || typeof node.nodeId !== 'string') errors.push('Node requires a string nodeId'); }
function checkNodeKind(node, errors) { if (!node.kind || !NODE_KINDS.includes(node.kind)) errors.push(`Invalid or missing kind. Must be one of: ${NODE_KINDS.join(', ')}`); }
function checkNodeTopology(node, errors) { if (node.kind === 'TOPOLOGY' && (!node.topology || typeof node.topology !== 'string')) errors.push('TOPOLOGY node requires a string topology field'); }
function checkOptStr(opts) { const { node, field, msg, errors } = opts; const v = node[field]; if (v !== undefined && v !== null && typeof v !== 'string') errors.push(msg); }
function checkChildrenArray(node, errors) { if (node.children !== undefined) { if (!Array.isArray(node.children)) errors.push('children must be an array'); else node.children.forEach((c, i) => { if (typeof c !== 'string') errors.push(`children[${i}]: must be a string nodeId`); }); } }
function checkBudget(node, errors) { if (node.budget !== undefined && (node.budget === null || typeof node.budget !== 'object')) errors.push('budget must be an object'); }
function validateNodePorts(ports, errors) { if (!Array.isArray(ports)) { errors.push('ports must be an array'); return; } ports.forEach((port, i) => validatePort({ port, index: i, errors })); }
function validatePort(p) { const { port, index: i, errors } = p; checkPortId(port, i, errors); checkPortName(port, i, errors); checkPortType(port, i, errors); checkPortDir(port, i, errors); checkPortSchema(port, i, errors); }
function checkPortId(port, i, errors) { if (!port.portId || typeof port.portId !== 'string') errors.push(`ports[${i}]: missing or invalid portId`); }
function checkPortName(port, i, errors) { if (!port.name || typeof port.name !== 'string') errors.push(`ports[${i}]: missing or invalid name`); }
function checkPortType(port, i, errors) { if (!port.type || !PORT_TYPES.includes(port.type)) errors.push(`ports[${i}]: invalid type, must be one of ${PORT_TYPES.join(', ')}`); }
function checkPortDir(port, i, errors) { if (!port.direction || !['in', 'out', 'bidirectional'].includes(port.direction)) errors.push(`ports[${i}]: direction must be in, out, or bidirectional`); }
function checkPortSchema(port, i, errors) { if (port.schema !== undefined && typeof port.schema !== 'object') errors.push(`ports[${i}]: schema must be an object`); }

module.exports = { EXPRESSION_KINDS, NODE_KINDS, PORT_TYPES, validateExpression, validateGraphNode };