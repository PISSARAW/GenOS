'use strict';

const MAX_TEST_RETRIES = 25;
const MAX_FAILURE_TEXT = 20000;
const MAX_CANDIDATE_TEXT = 12000;
function isCodeWorker(mission) {
  return mission.localCodeWorker === true || mission.executionPolicy?.localCodeWorker === true;
}

function latencyBudget(mission) {
  const values = [mission.timeoutMs, mission.executionBudget?.latencyMs]
    .map(Number).filter((value) => Number.isFinite(value) && value > 0);
  return values.length ? Math.min(...values) : 30000;
}

function tokenBudget(mission) {
  const value = Number(mission.executionBudget?.tokens);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function consumedTokens(error) {
  const direct = Number(error.usage?.tokens);
  if (Number.isSafeInteger(direct) && direct >= 0) return direct;
  const input = Number(error.usage?.inputTokens);
  const output = Number(error.usage?.outputTokens);
  if (Number.isSafeInteger(input) && input >= 0 && Number.isSafeInteger(output) && output >= 0) {
    return input + output;
  }
  return null;
}

function locatorRepairHint(error) {
  return require('./workerCodeTestRepairRules').locatorRepairHint(error);
}

function repairPlan(error) {
  return require('./workerCodeTestRepairRules').repairPlan(error);
}

function applyRepairPlan(text, plan) {
  const plans = (Array.isArray(plan) ? plan : [plan]).filter((item) => item?.label);
  const parsed = parseProposal(text, plans);
  if (!parsed) return text;
  const { match, proposal } = parsed;
  let changed = false;
  for (const patch of proposal.patches || []) {
    const content = applyPatchRepairs(patch, plans);
    if (content !== null && content !== patch.content) { patch.content = content; changed = true; }
  }
  return changed ? text.replace(match[0], JSON.stringify(proposal)) : text;
}

function parseProposal(text, plans) {
  if (!plans.length) return null;
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return { match, proposal: JSON.parse(match[0]) }; } catch (_) { return null; }
}

function applyPatchRepairs(patch, plans) {
  if (!/\.html?$/i.test(patch.path) || typeof patch.content !== 'string') return null;
  return plans.reduce((content, item) => applyOneRepair(content, item), patch.content);
}

function applyOneRepair(content, item) {
  const handlers = {
    ensure_accessible_select_label: (value) => labelFilterSelect(labelCategorySelect(value, item.label), 'Filter category'),
    ensure_accessible_button_label: (value) => labelIncreaseButton(value, item.label),
    ensure_quantity_action_label: (value) => cleanQuantityActions(value, item.label),
    ensure_quantity_input_label: (value) => require('./workerCodeQuantityInputRepair').labelQuantityInput(value),
    ensure_quantity_field_after_reload: (value) => require('./workerCodeQuantityRepair').removeQuantityCollisionsAfterReload(value),
    ensure_unique_item_name_locator: cleanDuplicateItemName,
    ensure_filter_select_label: (value) => labelFilterSelect(value, item.label),
    ensure_search_input_label: (value) => labelSearchInput(value, item.label),
    ensure_best_before_input_label: (value) => labelBestBeforeInput(value, item.label),
    ensure_item_name_input_label: (value) => require('./workerCodeItemNameRepair').labelItemNameInput(value, item.label),
    ensure_search_filter_behavior: ensureSearchFilterBehavior,
    ensure_local_storage_mutations: ensureLocalStorageMutations,
    ensure_json_export: (value) => require('./workerCodeExportRepair').ensureJsonExport(value),
    ensure_add_item_behavior: (value) => require('./workerCodeAddRepair').ensureAddItemBehavior(value),
    ensure_quantity_increment_behavior: (value) => require('./workerCodeQuantityIncrementRepair').ensureQuantityIncrementBehavior(value)
  };
  return handlers[item.kind] ? handlers[item.kind](content) : content;
}

function cleanQuantityActions(content, label) {
  const withoutInputs = content.replace(/<input\b[^>]*>/gi, (opening) => /\baria-label\s*=\s*["'][^"']*increase quantity/i.test(opening)
    ? opening.replace(/\s+aria-label\s*=\s*(["'])[^"']*\1/i, '') : opening);
  const withoutFixtures = withoutInputs.replace(/<button\b[^>]*>[\s\S]*?<\/button\s*>/gi,
    (button) => /(?:id\s*=\s*["'](?:increaseButton|deleteButton)["']|data-testid\s*=\s*["']addOatsButton["']|addItem\(\s*["']Oats["'])/i.test(button) ? '' : button);
  return labelIncreaseButton(withoutFixtures, label);
}

function cleanDuplicateItemName(content) {
  return content.replace(/<(?:label|td|th)\b[^>]*>/gi, (opening) => /\baria-label\s*=\s*["']item name["']/i.test(opening)
    ? opening.replace(/\s+aria-label\s*=\s*(["'])item name\1/i, '') : opening);
}

function replaceAccessibleName(opening, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`\\baria-label\\s*=\\s*["']${escaped}["']`, 'i').test(opening)) return opening;
  if (/\baria-label\s*=\s*(["']).*?\1/i.test(opening)) {
    return opening.replace(/\baria-label\s*=\s*(["']).*?\1/i, `aria-label="${label}"`);
  }
  const selfClosing = /\/\s*>$/.test(opening);
  const withoutClose = opening.replace(/\/?\s*>$/, '');
  return `${withoutClose} aria-label="${label}"${selfClosing ? ' />' : '>'}`;
}

function labelCategorySelect(content, label) {
  const forms = [...content.matchAll(/<form\b[^>]*>[\s\S]*?<\/form\s*>/gi)];
  const scopes = forms.length ? forms.map((form) => ({ start: form.index, html: form[0] })) : [{ start: 0, html: content }];
  for (const scope of scopes) {
    const selects = [...scope.html.matchAll(/<select\b[^>]*>[\s\S]*?<\/select\s*>/gi)];
    const target = selects.find((select) => /<option\b[^>]*>\s*Food\s*<\/option\s*>/i.test(select[0])
      || /<option\b[^>]*value\s*=\s*["']Food["']/i.test(select[0]))
      || selects.find((select) => /\bid\s*=\s*["']category["']/i.test(select[0]))
      || selects[0];
    if (!target) continue;
    const opening = target[0].match(/^<select\b[^>]*>/i)?.[0];
    if (!opening) continue;
    const nextOpening = replaceAccessibleName(opening, label);
    const nextSelect = nextOpening + target[0].slice(opening.length);
    return content.slice(0, scope.start + target.index) + nextSelect
      + content.slice(scope.start + target.index + target[0].length);
  }
  return content;
}

function labelIncreaseButton(content, label) {
  const dynamicContent = labelDynamicIncreaseButton(content, label);
  if (dynamicContent !== content) return dynamicContent;
  const buttons = [...content.matchAll(/<button\b[^>]*>[\s\S]*?<\/button\s*>/gi)];
  const dynamic = buttons.find((button) => /(?:\$\{\s*(?:itemName|item\.(?:name|label)|item\[['"](?:Item name|name)['"]\])|\b(?:itemName|item\.name)\b)/i.test(button[0])
    && /(?:\bincrease\b|\bincrement\b|\+|▲|↑)/i.test(button[0])
    && !/\b(?:delete|remove)\b/i.test(button[0]));
  if (dynamic) {
    for (const button of buttons) {
      if (button === dynamic || !/(?:\bincrease\b|\bincrement\b|\+|▲|↑)/i.test(button[0])) continue;
      const opening = button[0].match(/^<button\b[^>]*>/i)?.[0];
      if (!opening || !/\baria-label\s*=\s*(["'])[^"']*quantity[^"']*\1/i.test(opening)) continue;
      const nextOpening = opening.replace(/\s+aria-label\s*=\s*(["'])[^"']*\1/i, '');
      content = content.slice(0, button.index) + nextOpening + button[0].slice(opening.length)
        + content.slice(button.index + button[0].length);
    }
  }
  const currentButtons = [...content.matchAll(/<button\b[^>]*>[\s\S]*?<\/button\s*>/gi)];
  const target = currentButtons.find((button) => /(?:\$\{\s*(?:itemName|item\.(?:name|label)|item\[['"](?:Item name|name)['"]\])|\b(?:itemName|item\.name)\b)/i.test(button[0])
    && /(?:\bincrease\b|\bincrement\b|\+|▲|↑)/i.test(button[0])
    && !/\b(?:delete|remove)\b/i.test(button[0]))
    || currentButtons.find((button) => /(?:\bincrease\b|\bincrement\b|\+|▲|↑)/i.test(button[0])
    && !/\b(?:delete|remove)\b/i.test(button[0]))
    || currentButtons.find((button) => /\bOats\b/i.test(button[0])
      && !/\b(?:delete|remove)\b/i.test(button[0]));
  if (!target) return content;
  const opening = target[0].match(/^<button\b[^>]*>/i)?.[0];
  if (!opening) return content;
  const itemField = target[0].match(/\$\{\s*item\.([A-Za-z_$][\w$]*)\s*\}/i)?.[1];
  const dynamicLabel = itemField ? label.replace(/\bOats\b/g, `\${item.${itemField}}`) : /(?:\$\{\s*(?:itemName|item\.(?:name|label)|item\[['"](?:Item name|name)['"]\])|\b(?:itemName|item\.name)\b)/i.test(target[0]) ? label.replace(/\bOats\b/g, '${itemName}') : label;
  const nextButton = replaceAccessibleName(opening, dynamicLabel) + target[0].slice(opening.length);
  return content.slice(0, target.index) + nextButton + content.slice(target.index + target[0].length);
}

function labelDynamicIncreaseButton(content, label) {
  const scripts = [...content.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)];
  for (const script of scripts) {
    const code = script[1];
    const itemVariable = code.match(/\.forEach\s*\(\s*\(?\s*([A-Za-z_$][\w$]*)\s*(?:,|\))/i)?.[1]
      || code.match(/\.map\s*\(\s*\(?\s*([A-Za-z_$][\w$]*)\s*(?:,|\))/i)?.[1];
    if (!itemVariable) continue;
    const buttons = [...code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*document\.createElement\(\s*(['"])button\2\s*\)\s*;?/gi)];
    for (const button of buttons) {
      const variable = button[1];
      const nearby = code.slice(button.index, button.index + 900);
      if (!/(?:increase|increment|\+|▲|↑)/i.test(nearby)
        || new RegExp(`${variable}\\.(?:setAttribute|ariaLabel)[^;]{0,180}Increase quantity`, 'i').test(nearby)) continue;
      const dynamicLabel = label.replace(/\bOats\b/g, `\${${itemVariable}.name}`);
      const statement = `\n${variable}.setAttribute('aria-label', \`${dynamicLabel}\`);`;
      const insertion = button.index + button[0].length;
      const nextCode = code.slice(0, insertion) + statement + code.slice(insertion);
      const nextScript = script[0].replace(code, nextCode);
      return content.slice(0, script.index) + nextScript + content.slice(script.index + script[0].length);
    }
  }
  return content;
}

function labelFilterSelect(content, label) {
  return require('./workerCodeSelectRepair').labelFilterSelect(content, label);
}

function labelSearchInput(content, label) {
  const inputs = [...content.matchAll(/<input\b[^>]*>/gi)];
  const target = inputs.find((input) => /\b(?:id|name|placeholder)\s*=\s*["'][^"']*search/i.test(input[0])
    || /\btype\s*=\s*["']search["']/i.test(input[0]))
    || inputs.find((input) => /\baria-label\s*=\s*["'][^"']*search/i.test(input[0]));
  if (target) {
    const nextInput = replaceAccessibleName(target[0], label);
    return content.slice(0, target.index) + nextInput + content.slice(target.index + target[0].length);
  }
  const field = `<input type="search" id="search" name="search" aria-label="${label}">`;
  const filter = [...content.matchAll(/<select\b[^>]*>[\s\S]*?<\/select\s*>/gi)]
    .find((select) => /\b(?:id|name)\s*=\s*["'][^"']*filter|aria-label\s*=\s*["']filter category/i.test(select[0]));
  if (filter) {
    const end = filter.index + filter[0].length;
    return content.slice(0, end) + field + content.slice(end);
  }
  const formEnd = /<\/form\s*>/i.exec(content);
  if (formEnd) return content.slice(0, formEnd.index) + field + content.slice(formEnd.index);
  const bodyEnd = /<\/body\s*>/i.exec(content);
  return bodyEnd ? content.slice(0, bodyEnd.index) + field + content.slice(bodyEnd.index) : `${content}${field}`;
}

function labelBestBeforeInput(content, label) {
  const source = String(content || '');
  const inputs = [...source.matchAll(/<input\b[^>]*>/gi)];
  const targets = inputs.filter((input) => /\btype\s*=\s*["']date["']/i.test(input[0])
    || /\b(?:id|name)\s*=\s*["'][^"']*best.?before/i.test(input[0]));
  if (!targets.length) {
    const field = `<label for="bestBeforeDate">${label}</label><input id="bestBeforeDate" name="bestBeforeDate" type="date" aria-label="${label}">`;
    if (/<form\b[^>]*>[\s\S]*?<\/form\s*>/i.test(source)) return source.replace(/<\/form\s*>/i, `${field}</form>`);
    const button = /<button\b[^>]*>[\s\S]*?add\s*item[\s\S]*?<\/button\s*>/i.exec(source);
    if (button) return source.slice(0, button.index) + field + source.slice(button.index);
    return /<\/body\s*>/i.test(source) ? source.replace(/<\/body\s*>/i, `${field}</body>`) : `${source}${field}`;
  }
  let repaired = source;
  for (const target of targets.reverse()) {
    const nextInput = replaceAccessibleName(target[0], label);
    repaired = repaired.slice(0, target.index) + nextInput + repaired.slice(target.index + target[0].length);
  }
  const dateIds = new Set(targets.map((target) => target[0].match(/\bid\s*=\s*(["'])([^"']+)\1/i)?.[2]).filter(Boolean));
  if (!dateIds.size) return repaired;
  return repaired.replace(/<label\b[^>]*>[\s\S]*?<\/label\s*>/gi, (labelElement) => {
    const targetId = labelElement.match(/\bfor\s*=\s*(["'])([^"']+)\1/i)?.[2];
    return dateIds.has(targetId) ? labelElement.replace(/\s+aria-label\s*=\s*(["'])[^"']*\1/i, '') : labelElement;
  });
}

function ensureSearchFilterBehavior(content) {
  const scripts = [...content.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)];
  const searchId = content.match(/<input\b[^>]*\bid\s*=\s*(["'])[^"']*search[^"']*\1[^>]*>/i)?.[0]
    ?.match(/\bid\s*=\s*(["'])([^"']+)\1/i)?.[2] || 'search';
  const filterId = content.match(/<select\b[^>]*\bid\s*=\s*(["'])[^"']*filter[^"']*\1[^>]*>/i)?.[0]
    ?.match(/\bid\s*=\s*(["'])([^"']+)\1/i)?.[2] || 'filter-category';
  for (const script of scripts) {
    const code = script[1];
    const render = /function\s+renderItems\s*\(\s*([A-Za-z_$][\w$]*)\s*\)\s*\{/i.exec(code);
    if (!render || /\bfilteredItems\s*=/.test(code.slice(render.index))) continue;
    const itemList = render[1];
    const loopPattern = new RegExp(`\\b${itemList}\\.forEach\\s*\\(`);
    const loop = loopPattern.exec(code.slice(render.index + render[0].length));
    if (!loop) continue;
    const insertion = render.index + render[0].length + loop.index;
    const filterCode = `const searchTerm = (document.getElementById(${JSON.stringify(searchId)} )?.value || '').trim().toLowerCase(); const categoryFilter = document.getElementById(${JSON.stringify(filterId)} )?.value || ''; const filteredItems = ${itemList}.filter(item => (!searchTerm || String(item.name || '').toLowerCase().includes(searchTerm)) && (!categoryFilter || /^(all|any)$/i.test(categoryFilter) || item.category === categoryFilter)); filteredItems.forEach(`;
    const nextCode = code.slice(0, insertion) + filterCode + code.slice(insertion + loop[0].length);
    const nextScript = script[0].replace(code, nextCode);
    return content.slice(0, script.index) + nextScript + content.slice(script.index + script[0].length);
  }
  return content;
}

function ensureLocalStorageMutations(content) {
  const scripts = [...content.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)];
  for (const script of scripts) {
    let code = script[1];
    const state = /\b(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\[\s*\]\s*;?/i.exec(code);
    if (!state) continue;
    const stateName = state[1];
    const escapedName = stateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const key = code.match(/localStorage\.getItem\(\s*(['"])([^'"]+)\1\s*\)/i)?.[2] || stateName;
    const mutation = new RegExp(`\\b${escapedName}(?:\\s*\\[[^\\]]+\\])?\\.(?:push|splice)\\s*\\([^;]*\\);|\\b${escapedName}\\s*\\[[^\\]]+\\]\\.(?:quantity|count)\\s*(?:\\+\\+|--|[+*/-]=\\s*\\d+)\\s*;`, 'gi');
    if (!/localStorage\.getItem\(/i.test(code)) {
      const declaration = new RegExp(`\\b(?:let|const|var)\\s+${escapedName}\\s*=\\s*\\[\\s*\\]\\s*;?`, 'i');
      const initializer = `;(() => { const saved = JSON.parse(localStorage.getItem(${JSON.stringify(key)}) || '[]'); if (Array.isArray(saved)) ${stateName}.push(...saved); })();`;
      code = code.replace(declaration, (match) => `${match}${initializer}`);
    }
    code = code.replace(mutation, (statement, offset, source) => {
      if (/localStorage\.getItem\(/i.test(statement)) return statement;
      if (source.slice(offset, offset + statement.length + 200).includes(`localStorage.setItem(${JSON.stringify(key)}`)) return statement;
      return `${statement} localStorage.setItem(${JSON.stringify(key)}, JSON.stringify(${stateName}));`;
    });
    const nextScript = script[0].replace(script[1], code);
    return content.slice(0, script.index) + nextScript + content.slice(script.index + script[0].length);
  }
  return content;
}

function failureFeedback(error) {
  const tests = error.proposal?.tests || [];
  const result = tests.map((test) => [
    `Command: ${test.command || 'unknown'}`,
    `Exit code: ${test.exitCode}`,
    test.stdout ? `stdout:\n${test.stdout}` : '',
    test.stderr ? `stderr:\n${test.stderr}` : ''
  ].filter(Boolean).join('\n')).join('\n\n');
  const patches = error.proposal?.failedPatchContents || [];
  const candidate = patches.map((patch) => `Rolled-back candidate ${patch.path}:\n${patch.content}`)
    .join('\n\n').slice(0, MAX_CANDIDATE_TEXT);
  const diagnostics = error.workerArtifactDiagnostics;
  const schemaFeedback = diagnostics ? [
    `Worker output contract rejected (${error.code || 'unknown'}): ${diagnostics.error || error.message}`,
    Array.isArray(diagnostics.violations) ? diagnostics.violations.join('\n') : '',
    diagnostics.outputExcerpt ? `Rejected output excerpt:\n${diagnostics.outputExcerpt}` : ''
  ].filter(Boolean).join('\n') : '';
  const locatorHint = locatorRepairHint(error);
  return [locatorHint, schemaFeedback, result, candidate].filter(Boolean).join('\n\n').slice(0, MAX_FAILURE_TEXT);
}

function repairPrompt(context) {
  const { mission, error, attempt } = context;
  const reason = error.code === 'WORKER_OUTPUT_SCHEMA_VIOLATION'
    ? 'The previous model output was rejected before application; the workspace is unchanged.'
    : 'The previous patch was rolled back after the independent test failed; the workspace is back to its pre-attempt state.';
  return `${mission.prompt}\n\nRepair attempt ${attempt} of ${MAX_TEST_RETRIES}. ${reason} Fix the specific failure below, keep the original requirements, and return a complete valid patch. Do not claim success without rerunning the allow-listed test.\n\n${failureFeedback(error)}`;
}

function canRetry(context) {
  if (!isCodeWorker(context.mission)
    || !['WORKER_TESTS_FAILED', 'WORKER_OUTPUT_SCHEMA_VIOLATION'].includes(context.error.code)) return false;
  if (context.attempt > MAX_TEST_RETRIES) return false;
  return latencyBudget(context.mission) - (Date.now() - context.startedAt) > 1000;
}

async function run(context) {
  const state = { startedAt: Date.now(), mission: context.mission,
    remainingTokens: tokenBudget(context.mission), attempt: 0 };
  while (true) {
    state.attempt += 1;
    const result = await captureAttempt(context, state.mission);
    if (Object.hasOwn(result, 'value')) return result.value;
    await retryAfterFailure({ context, state, error: result.error });
  }
}

async function captureAttempt(context, mission) {
  try { return { value: await context.runAttempt(mission) }; }
  catch (error) { return { error }; }
}

async function retryAfterFailure(input) {
  const { context, state, error } = input;
  if (!canRetry({ mission: context.mission, error, attempt: state.attempt, startedAt: state.startedAt })) throw error;
  state.remainingTokens = remainingTokensAfter(error, state.remainingTokens);
  const remainingMs = latencyBudget(context.mission) - (Date.now() - state.startedAt);
  await context.onRetry?.({ failedAttempt: state.attempt, error, remainingMs });
  state.mission = nextMission({ base: context.mission, current: state.mission, error,
    attempt: state.attempt, remainingMs, remainingTokens: state.remainingTokens });
}

function remainingTokensAfter(error, remainingTokens) {
  if (remainingTokens <= 0) return remainingTokens;
  const consumed = consumedTokens(error);
  if (consumed === null || consumed >= remainingTokens) throw error;
  return remainingTokens - consumed;
}

function nextMission(input) {
  const { base, current, error, attempt, remainingMs, remainingTokens } = input;
  const previousPlans = current.codeRepairPlans || (current.codeRepairPlan ? [current.codeRepairPlan] : []);
  const nextPlan = repairPlan(error);
  const alreadyPlanned = nextPlan && previousPlans.some((item) => item.kind === nextPlan.kind && item.label === nextPlan.label);
  const codeRepairPlans = nextPlan && !alreadyPlanned ? [...previousPlans, nextPlan] : previousPlans;
  return {
    ...base,
    prompt: repairPrompt({ mission: base, error, attempt }),
    ...(codeRepairPlans.length ? { codeRepairPlans } : {}),
    timeoutMs: remainingMs,
    executionBudget: { ...base.executionBudget, latencyMs: remainingMs,
      ...(remainingTokens > 0 ? { tokens: remainingTokens } : {}) }
  };
}

module.exports = { run, failureFeedback, repairPrompt, latencyBudget, tokenBudget, consumedTokens,
  locatorRepairHint, repairPlan, applyRepairPlan };
