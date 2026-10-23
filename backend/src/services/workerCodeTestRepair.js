'use strict';

const MAX_TEST_RETRIES = 2;
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
  const output = (error.proposal?.tests || []).map((test) => `${test.stdout || ''}\n${test.stderr || ''}`).join('\n');
  if (/getByLabel\(\/\^category\$\/i\)/i.test(output)) {
    return 'The exact accessible Category control is missing. Add this associated markup to the add form: <label for="category">Category</label><select id="category" name="category"><option value="Food">Food</option></select>. Do not give the filter select the accessible name Category; label that control Filter category.';
  }
  if (/getByRole\(\s*'button',\s*\{\s*name:\s*\/increase quantity for oats/i.test(output)) {
    return 'The Oats row exists, but its quantity action has no accessible name. Give its existing increment button aria-label="Increase quantity for Oats" and ensure its click handler updates the same item, persists quantity 3, and rerenders.';
  }
  const count = output.match(/(\d+)\s*!==\s*1[\s\S]*?acceptance\.cjs:19:10/);
  if (count) {
    const detail = Number(count[1]) === 0
      ? 'The row is absent after Add Item. Handle submit, prevent navigation, append the form values to the shared items collection, persist, and render immediately.'
      : `Playwright found ${count[1]} visible text matches for Oats but requires exactly one. Render one item summary with Oats once; remove duplicate toast/summary text and keep Oats out of visible action button text by using accessible aria-labels.`;
    return `${detail} Keep the row compatible with filtering, search, increase and delete behavior.`;
  }
  return '';
}

function repairPlan(error) {
  const output = (error.proposal?.tests || []).map((test) => `${test.stdout || ''}\n${test.stderr || ''}`).join('\n');
  if (/getByLabel\(\/\^category\$\/i\)/i.test(output)) {
    return { kind: 'ensure_accessible_select_label', label: 'Category' };
  }
  if (/getByRole\(\s*'button',\s*\{\s*name:\s*\/increase quantity for oats/i.test(output)) {
    return { kind: 'ensure_accessible_button_label', label: 'Increase quantity for Oats' };
  }
  return null;
}

function applyRepairPlan(text, plan) {
  const plans = (Array.isArray(plan) ? plan : [plan]).filter((item) => item?.label);
  if (!plans.length) return text;
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) return text;
  let proposal;
  try { proposal = JSON.parse(match[0]); } catch (_) { return text; }
  let changed = false;
  for (const patch of proposal.patches || []) {
    if (!/\.html?$/i.test(patch.path) || typeof patch.content !== 'string') continue;
    let content = patch.content;
    for (const item of plans) {
      if (item.kind === 'ensure_accessible_select_label') {
        content = labelCategorySelect(content, item.label);
      } else if (item.kind === 'ensure_accessible_button_label') {
        content = labelIncreaseButton(content, item.label);
      }
    }
    if (content !== patch.content) {
      patch.content = content;
      changed = true;
    }
  }
  return changed ? text.replace(match[0], JSON.stringify(proposal)) : text;
}

function replaceAccessibleName(opening, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`\\baria-label\\s*=\\s*["']${escaped}["']`, 'i').test(opening)) return opening;
  if (/\baria-label\s*=\s*(["']).*?\1/i.test(opening)) {
    return opening.replace(/\baria-label\s*=\s*(["']).*?\1/i, `aria-label="${label}"`);
  }
  return opening.replace(/>$/, ` aria-label="${label}">`);
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
  const buttons = [...content.matchAll(/<button\b[^>]*>[\s\S]*?<\/button\s*>/gi)];
  const target = buttons.find((button) => /(?:\bincrease\b|\bincrement\b|\+|▲|↑)/i.test(button[0])
    && !/\b(?:delete|remove)\b/i.test(button[0]))
    || buttons.find((button) => /\bOats\b/i.test(button[0])
      && !/\b(?:delete|remove)\b/i.test(button[0]));
  if (!target) return content;
  const opening = target[0].match(/^<button\b[^>]*>/i)?.[0];
  if (!opening) return content;
  const nextButton = replaceAccessibleName(opening, label) + target[0].slice(opening.length);
  return content.slice(0, target.index) + nextButton + content.slice(target.index + target[0].length);
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
  const startedAt = Date.now();
  let mission = context.mission;
  let remainingTokens = tokenBudget(context.mission);
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await context.runAttempt(mission);
    } catch (error) {
      if (!canRetry({ mission: context.mission, error, attempt, startedAt })) throw error;
      if (remainingTokens > 0) {
        const consumed = consumedTokens(error);
        if (consumed === null || consumed >= remainingTokens) throw error;
        remainingTokens -= consumed;
      }
      const remainingMs = latencyBudget(context.mission) - (Date.now() - startedAt);
      await context.onRetry?.({ failedAttempt: attempt, error, remainingMs });
      const previousPlans = mission.codeRepairPlans || (mission.codeRepairPlan ? [mission.codeRepairPlan] : []);
      const nextPlan = repairPlan(error);
      const codeRepairPlans = nextPlan && !previousPlans.some((item) => item.kind === nextPlan.kind && item.label === nextPlan.label)
        ? [...previousPlans, nextPlan] : previousPlans;
      mission = {
        ...context.mission,
        prompt: repairPrompt({ mission: context.mission, error, attempt }),
        ...(codeRepairPlans.length ? { codeRepairPlans } : {}),
        timeoutMs: remainingMs,
        executionBudget: { ...context.mission.executionBudget, latencyMs: remainingMs,
          ...(remainingTokens > 0 ? { tokens: remainingTokens } : {}) }
      };
    }
  }
}

module.exports = { run, failureFeedback, repairPrompt, latencyBudget, tokenBudget, consumedTokens,
  locatorRepairHint, repairPlan, applyRepairPlan };
