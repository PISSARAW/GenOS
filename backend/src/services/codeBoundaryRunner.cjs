'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const deepEqual = assert.deepStrictEqual;
const notSame = assert.notStrictEqual;
const SAFE_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const FORBIDDEN = new Set(['constructor', 'prototype', '__proto__', 'toString', 'valueOf', 'require', 'eval', 'Function']);

function invalid() { throw Object.assign(new Error('Invalid declarative boundary cases.'), { code: 'Q7_BOUNDARY_FORMAT_INVALID' }); }
function name(value) { return typeof value === 'string' && SAFE_NAME.test(value) && !FORBIDDEN.has(value); }
function keys(value, allowed) {
  if (!value || Array.isArray(value) || typeof value !== 'object') invalid();
  if (Object.keys(value).some(key => !allowed.includes(key))) invalid();
}
function names(value) {
  if (!Array.isArray(value) || value.length > 16 || !value.every(name) || new Set(value).size !== value.length) invalid();
  return [...value];
}
function api(raw = {}) {
  keys(raw, ['functions', 'constructors', 'postconditions', 'domains']);
  const functions = names(raw.functions || []), constructors = raw.constructors || {}, postconditions = raw.postconditions || {};
  keys(constructors, Object.keys(constructors));
  keys(postconditions, functions);
  for (const [id, methods] of Object.entries(constructors)) {
    if (!name(id)) invalid();
    names(methods);
  }
  validatePostconditions(postconditions);
  if (functions.length + Object.keys(constructors).length < 1) invalid();
  const domains = publicDomains(raw.domains || {}, { functions, constructors });
  return structuredClone({ functions, constructors, postconditions, domains });
}
function validatePostconditions(postconditions) {
  for (const checks of Object.values(postconditions)) {
    if (!Array.isArray(checks) || checks.some(check => !['preserveArguments', 'newResult'].includes(check))) invalid();
  }
}
function signatures(raw, members) {
  keys(raw, members);
  const result = {};
  for (const member of members) {
    const signature = raw[member];
    if (!Array.isArray(signature) || signature.length > 32
      || signature.some(item => !['iso8601', 'numericKeyRecords', 'integer', 'string', 'json'].includes(item))) invalid();
    result[member] = [...signature];
  }
  return result;
}
function publicDomains(raw, members) {
  keys(raw, ['functions', 'constructors', 'methods']);
  const functions = signatures(raw.functions || {}, members.functions);
  const constructors = signatures(raw.constructors || {}, Object.keys(members.constructors));
  const methods = {}, supplied = raw.methods || {};
  keys(supplied, Object.keys(members.constructors));
  for (const [id, names] of Object.entries(members.constructors)) {
    methods[id] = signatures(supplied[id] || {}, names);
  }
  return { functions, constructors, methods };
}
function jsonValue(value, depth = 0) {
  if (depth > 12) return false;
  if (value === null) return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string' || typeof value === 'boolean') return true;
  if (!value || typeof value !== 'object') return false;
  return Object.values(value).every(item => jsonValue(item, depth + 1));
}
function isoInstant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  return calendarInstant(value) && Number.isFinite(Date.parse(value));
}
function calendarInstant(value) {
  const [year, month, day, hour, minute, second] = value.slice(0, 19).split(/[-T:]/).map(Number);
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month, 0);
  const days = calendar.getUTCDate();
  return month >= 1 && month <= 12 && day >= 1 && day <= days
    && hour < 24 && minute < 60 && second < 60;
}
function numericRecords(value) {
  return Array.isArray(value) && value.every(record => record && !Array.isArray(record)
    && typeof record === 'object' && Number.isFinite(record.key) && jsonValue(record));
}
function domain(value, type) {
  const checks = { iso8601: isoInstant, numericKeyRecords: numericRecords,
    integer: Number.isSafeInteger, string: item => typeof item === 'string', json: jsonValue };
  return checks[type](value);
}
function argumentsInDomain(step, signature) {
  if (step.args.length !== signature.length || !step.args.every((value, index) => domain(value, signature[index]))) {
    throw Object.assign(new Error('Boundary arguments are outside the declared public domain.'), { code: 'Q7_BOUNDARY_DOMAIN_INVALID' });
  }
}
function hasExpectation(step) {
  if (Object.hasOwn(step, 'expected') && Object.hasOwn(step, 'expectedUndefined')) invalid();
  if (Object.hasOwn(step, 'expectedUndefined') && step.expectedUndefined !== true) invalid();
  if (Object.hasOwn(step, 'expected') && !jsonValue(step.expected)) invalid();
  return Object.hasOwn(step, 'expected') || step.expectedUndefined === true;
}
function validateStep(step, context) {
  keys(step, ['op', 'name', 'args', 'as', 'target', 'expected', 'expectedUndefined']);
  if (!name(step.name) || !Array.isArray(step.args) || step.args.length > 32) invalid();
  if (step.op === 'construct') {
    validateConstructor(step, context);
    argumentsInDomain(step, context.api.domains.constructors[step.name]);
    context.targets.set(step.as, step.name); return false;
  }
  if (Object.hasOwn(step, 'as')) invalid();
  validateCall(step, context);
  const signature = step.op === 'call' ? context.api.domains.functions[step.name]
    : context.api.domains.methods[context.targets.get(step.target)][step.name];
  argumentsInDomain(step, signature);
  return hasExpectation(step);
}
function validateConstructor(step, context) {
  if (!Object.hasOwn(context.api.constructors, step.name) || !name(step.as)
    || context.targets.has(step.as) || hasExpectation(step) || Object.hasOwn(step, 'target')) invalid();
}
function validateCall(step, context) {
  if (step.op === 'call') {
    if (!context.api.functions.includes(step.name) || Object.hasOwn(step, 'target')) invalid();
  } else if (step.op === 'method') {
    const constructor = context.targets.get(step.target);
    if (!constructor || !context.api.constructors[constructor].includes(step.name)) invalid();
  } else invalid();
}
function validate(suite, publicApi) {
  keys(suite, ['schema', 'cases']);
  if (suite.schema !== 'genos.boundary-cases/v1' || !Array.isArray(suite.cases)
    || !suite.cases.length || suite.cases.length > 20) invalid();
  const contractApi = api(publicApi), ids = new Set();
  for (const item of suite.cases) {
    validateCase(item, ids);
    ids.add(item.id);
    const context = { api: contractApi, targets: new Map() };
    const checks = item.steps.map(step => validateStep(step, context));
    if (!checks.some(Boolean)) invalid();
  }
  return suite;
}
function validateCase(item, ids) {
  keys(item, ['id', 'steps']);
  if (typeof item.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(item.id) || ids.has(item.id) || !Array.isArray(item.steps)
    || !item.steps.length || item.steps.length > 40) invalid();
}
function expectation(result, step, context) {
  if (!hasExpectation(step)) return;
  context.stats.assertions += 1;
  deepEqual(result, step.expectedUndefined ? undefined : step.expected, context.label);
}
function postconditions(input) {
  for (const check of input.checks) {
    input.stats.assertions += 1;
    if (check === 'preserveArguments') deepEqual(input.args, input.before, input.label);
    if (check === 'newResult') notSame(input.sameArgument, true, input.label);
  }
}
function runStep(step, context) {
  const observed = context.invoke(step);
  if (step.op === 'construct') return;
  context.stats.calls += 1;
  const label = `${context.generatedPath} ${context.caseId} ${step.name}`;
  expectation(observed.result, step, { stats: context.stats, label });
  const checks = step.op === 'call' ? context.api.postconditions[step.name] || [] : [];
  postconditions({ args: observed.args, before: step.args, sameArgument: observed.sameArgument,
    checks, stats: context.stats, label });
}
function subject(source) {
  const options = { codeGeneration: { strings: false, wasm: false } };
  const sourceContext = vm.createContext(Object.create(null), options);
  const parse = new vm.Script('JSON.parse').runInContext(sourceContext, { timeout: 1000 });
  const code = `(function(){'use strict';const module={exports:{}};
    (function(module,exports){${source}\n})(module,module.exports);return module.exports;})()`;
  const exported = new vm.Script(code).runInContext(sourceContext, { timeout: 1000 });
  const globals = Object.assign(Object.create(null), { subject: exported });
  const context = vm.createContext(globals, options);
  new vm.Script(`const invoke=(()=>{const apply=Reflect.apply,construct=Reflect.construct;
    const targets=new Map(), get=Map.prototype.get, set=Map.prototype.set;
    return s=>{if(s.op==='construct'){
      apply(set,targets,[s.as,construct(subject[s.name],s.args)]);return null;}
      const receiver=s.op==='call'?subject:apply(get,targets,[s.target]);
      const result=apply(receiver[s.name],receiver,s.args);
      return {result,args:s.args,sameArgument:result===s.args[0]};};})();`).runInContext(context, { timeout: 1000 });
  return step => {
    const { expected, expectedUndefined, ...call } = step;
    globals.nextCall = parse(JSON.stringify(call));
    return structuredClone(new vm.Script('invoke(nextCall)').runInContext(context, { timeout: 1000 }));
  };
}
function emit(result) { process.stdout.write(`GENOS_BOUNDARY_RESULT:${JSON.stringify(result)}\n`); }
function main() {
  const stats = { schema: 'genos.boundary-run-result/v1', calls: 0, assertions: 0, cases: 0 };
  try {
    const root = process.cwd(), contract = JSON.parse(fs.readFileSync(path.join(root, '.genos/boundary-contract.json'), 'utf8'));
    const suite = validate(JSON.parse(fs.readFileSync(path.join(root, contract.generatedTestPath), 'utf8')), contract.api);
    const invoke = subject(fs.readFileSync(path.resolve(root, contract.sourcePaths[0]), 'utf8'));
    for (const item of suite.cases) {
      const context = { invoke, api: api(contract.api), stats,
        generatedPath: contract.generatedTestPath, caseId: item.id };
      for (const step of item.steps) runStep(step, context);
      stats.cases += 1;
    }
    emit({ ...stats, status: 'passed' });
  } catch (error) {
    emit({ ...stats, status: 'failed', kind: error.code === 'ERR_ASSERTION' ? 'assertion' : 'error' });
    process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1;
  }
}
module.exports = { api, validate };
if (require.main === module) main();
