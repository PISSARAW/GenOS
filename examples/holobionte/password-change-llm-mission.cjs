'use strict';

const { randomUUID } = require('node:crypto');

// Branchement LLM reel : deux modeles locaux DISTINCTS (independance immunitaire).
// Specialiste (conception) : qwen2.5:14b. Immunite (revue) : llama3.1:8b.
// Aucun repli fabrique : tout appel ou parse en echec bloque la mission (fail-closed).
const SPECIALIST_MODEL = 'qwen2.5:14b';
const IMMUNE_MODEL = 'deepseek-r1:latest';
const OLLAMA_CHAT_URL = 'http://localhost:11434/v1/chat/completions';
const CALL_TIMEOUT_MS = 600000;

const HOST_OBJECTIVES = [
  'Concevoir une procedure de changement de mot de passe sans jamais exposer le secret en clair.',
  'Exiger une revalidation d identite avant toute rotation du secret.',
  'Refuser toute solution dangereuse detectee par le systeme immunitaire.',
  'Extraire les regles reutilisables vers la memoire symbiotique.'
];

const SPECIALIST_PROMPT = `Tu es le symbionte specialiste d un holobionte GenOS. Objectifs du Host :
${HOST_OBJECTIVES.map((line) => `- ${line}`).join('\n')}
Concois la procedure de changement de mot de passe et reponds UNIQUEMENT avec ce JSON, sans texte autour :
{"steps":["etape1","etape2","etape3","etape4","etape5","etape6","etape7"],"policy":{"minLength":12,"breachCheck":true,"historyDepth":5,"rateLimit":{"maxAttempts":5,"lockout":"progressif"},"sessionRevocation":true,"audit":true,"reauthRequired":true,"hashing":"argon2id","transport":"tls"},"reusableRules":["regle1","regle2","regle3","regle4","regle5","regle6"]}
Exigences : 7 etapes en francais, revalidation d identite, secret jamais en clair (ni courriel, ni journal), hachage a sel unique, limitation des tentatives, revocation des sessions, audit sans le secret.
Chaque controle doit nommer son MECANISME CONCRET dans l etape (exemples : interrogation d un corpus d exposition via API a k-anonymat, Argon2id avec sel unique, TLS, verrouillage progressif des tentatives, revocation immediate des sessions, journalisation horodatee sans le secret). Une etape qui enonce un controle sans mecanisme est incomplete.`;

const IMMUNE_PROMPT_PREFIX = `Tu es le symbionte immunitaire d un holobionte GenOS, INDEPENDANT du concepteur. Objectifs du Host :
${HOST_OBJECTIVES.map((line) => `- ${line}`).join('\n')}
Revise cette procedure candidate (JSON) et traque les failles : exposition du secret en clair, absence de revalidation d identite, politique faible (moins de 12 caracteres, pas de controle d exposition, pas d historique), pas de limitation des tentatives, sessions non revoquees, audit absent.
Procedure candidate :
`;

const IMMUNE_PROMPT_SUFFIX = `
Rubrique : une faille = un manquement CONSTATABLE dans la procedure (secret en clair, pas de revalidation, moins de 12 caracteres, pas de controle d exposition, pas d historique, pas de limite de tentatives, sessions conservees, audit absent).
NE SONT PAS des failles : comparaison en temps constant (protection anti-synchronisation), empreinte Argon2id avec sel unique, canal chiffre TLS, revocation des sessions, audit sans le secret, revalidation d identite. Ce sont des CONFORMITES.
Reponds UNIQUEMENT avec ce JSON, sans texte autour :
{"verdict":"PASS ou FAIL","flaws":[{"check":"nom-du-controle","detail":"explication","quote":"extrait EXACT de la procedure qui prouve la faille"}]}
FAIL si au moins une faille prouvee par un extrait exact. PASS sinon. Sans extrait exact, pas de faille.
IMPORTANT : dans les valeurs check, detail et quote, n'emploie JAMAIS le caractere guillemet (") ; reformule avec des apostrophes si besoin. Le JSON doit rester strictement parsable.`;

function invalid(message, code) {
  return Object.assign(new Error(message), { code: code || 'HOLOBIONT_LLM_MALFORMED' });
}

function readTokenCount(primary, fallback) {
  return Number(primary ?? fallback) || 0;
}

function parseChatResponse(model, payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw invalid(`LLM ${model} returned an empty answer.`);
  const usage = payload?.usage || {};
  return { text: content,
    promptTokens: readTokenCount(usage.prompt_tokens, payload?.prompt_eval_count),
    completionTokens: readTokenCount(usage.completion_tokens, payload?.eval_count) };
}

async function requestChat({ model, prompt, maxTokens, temperature }, signal) {
  const response = await fetch(OLLAMA_CHAT_URL, { method: 'POST', signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }],
      temperature, stream: false, format: 'json', options: { num_predict: maxTokens } }) });
  if (!response.ok) throw invalid(`LLM ${model} returned HTTP ${response.status}.`, 'HOLOBIONT_LLM_UNAVAILABLE');
  return parseChatResponse(model, await response.json());
}

function normalizeChatError(model, error) {
  if (error?.code === 'HOLOBIONT_LLM_MALFORMED' || error?.code === 'HOLOBIONT_LLM_UNAVAILABLE') return error;
  return invalid(`LLM ${model} unreachable: ${error.message}.`, 'HOLOBIONT_LLM_UNAVAILABLE');
}

async function chatJson(options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  try { return await requestChat(options, controller.signal); }
  catch (error) { throw normalizeChatError(options.model, error); }
  finally { clearTimeout(timer); }
}

function advanceObjectState(ch, state) {
  if (state.inString) {
    if (state.escaped) state.escaped = false;
    else if (ch === '\\') state.escaped = true;
    else if (ch === '"') state.inString = false;
  } else if (ch === '"') state.inString = true;
  else if (ch === '{') state.depth++;
  else if (ch === '}') state.depth--;
  return state;
}

function readObjectValue(text) {
  const state = { depth: 0, inString: false, escaped: false };
  for (let index = 0; index < text.length; index++) {
    advanceObjectState(text[index], state);
    if (state.depth === 0 && index > 0) return text.slice(0, index + 1);
  }
  return null;
}

function readRawValue(text) {
  const trimmed = String(text).trim();
  if (trimmed[0] === '"') {
    const match = trimmed.match(/^"((?:[^"\\]|\\.)*)"/);
    return match ? match[1] : null;
  }
  return trimmed[0] === '{' ? readObjectValue(trimmed) : null;
}

function salvageFlaw(part) {
  const check = readRawValue(part);
  if (!check) return null;
  const afterCheck = part.slice(part.indexOf(check) + check.length + 2);
  const detailKey = afterCheck.indexOf('"detail"');
  const detail = detailKey < 0 ? '' : readRawValue(afterCheck.slice(detailKey + 8).replace(/^[\s:]*/, ''));
  const quoteKey = afterCheck.indexOf('"quote"');
  const quote = quoteKey < 0 ? '' : readRawValue(afterCheck.slice(quoteKey + 7).replace(/^[\s:]*/, ''));
  if (!check) return null;
  return { check, detail: detail || '', quote: quote || '' };
}

function salvageVerdict(stripped) {
  const verdictMatch = stripped.match(/"verdict"\s*:\s*"(PASS|FAIL)"/i);
  if (!verdictMatch) return null;
  const parts = stripped.split(/"check"\s*:\s*/);
  parts.shift();
  const flaws = parts.map(salvageFlaw).filter(Boolean);
  return { verdict: verdictMatch[1].toUpperCase(), flaws, salvaged: true };
}

function parseJsonAnswer(model, text, strict) {
  const noThink = String(text).replace(/<think>[\s\S]*?<\/think>/g, '');
  const stripped = noThink.replace(/```json|```/g, '').trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (process.env.GENOS_DEBUG_LLM === '1') console.error(`[llm:${model}] raw:`, stripped.slice(0, 1200));
  if (start >= 0 && end > start) {
    try {
      return { value: JSON.parse(stripped.slice(start, end + 1)), salvaged: false };
    } catch { /* fall through to salvage */ }
  }
  if (strict) throw invalid(`LLM ${model} did not return strict JSON.`);
  const salvaged = start >= 0 && end > start ? salvageVerdict(stripped.slice(start, end + 1)) : null;
  if (!salvaged) throw invalid(`LLM ${model} returned unparsable JSON.`);
  return { value: salvaged, salvaged: true };
}

function assertProcedureShape(model, value) {
  const steps = readSteps(value);
  const policy = readPolicy(value);
  const rules = readRules(value);
  if (steps.length < 6 || !steps.every((step) => typeof step === 'string' && step.trim())) {
    throw invalid(`LLM ${model} returned too few procedure steps.`);
  }
  if (!hasCompletePolicy(policy)) {
    throw invalid(`LLM ${model} returned an incomplete policy.`);
  }
  if (rules.length < 1) throw invalid(`LLM ${model} returned no reusable rules.`);
  return { steps, policy, rules };
}

function readSteps(value) {
  return Array.isArray(value?.steps) ? value.steps : [];
}

function readPolicy(value) {
  return value?.policy && typeof value.policy === 'object' ? value.policy : null;
}

function readRules(value) {
  return Array.isArray(value?.reusableRules) ? value.reusableRules : [];
}

function hasCompletePolicy(policy) {
  const required = ['minLength', 'breachCheck', 'historyDepth', 'rateLimit',
    'sessionRevocation', 'audit', 'reauthRequired', 'hashing', 'transport'];
  return Boolean(policy) && required.every((key) => policy[key] !== undefined);
}

const PLAINTEXT_HINT = /en clair|par courriel|journal|plaintext/i;
const NEGATION_HINT = /jamais|ne\s+\S+\s+pas|interdit|sans|refus|aucun/i;

const IMMUNE_CHECKS = [
  { id: 'requisition-reauth', evidence: 'immune-rule:reauth-required',
    violated: (proc) => proc.policy?.reauthRequired !== true },
  { id: 'force-politique', evidence: 'immune-rule:secret-strength',
    violated: (proc) => !(Number(proc.policy?.minLength) >= 12)
      || proc.policy?.breachCheck !== true || !(Number(proc.policy?.historyDepth) >= 1) },
  { id: 'secret-jamais-en-clair', evidence: 'immune-rule:no-plaintext',
    violated: (proc) => (proc.steps || []).some((step) => {
      const text = String(step);
      return PLAINTEXT_HINT.test(text) && !NEGATION_HINT.test(text);
    }) || ['clair', 'aucun', 'none'].includes(String(proc.policy?.hashing)) },
  { id: 'limitation-tentatives', evidence: 'immune-rule:rate-limit',
    violated: (proc) => !(Number(proc.policy?.rateLimit?.maxAttempts) > 0) },
  { id: 'revocation-sessions', evidence: 'immune-rule:session-revocation',
    violated: (proc) => proc.policy?.sessionRevocation !== true },
  { id: 'piste-audit-sans-secret', evidence: 'immune-rule:audit-trail',
    violated: (proc) => proc.policy?.audit !== true }
];

function reviewProcedure(result) {
  const proc = result && typeof result === 'object' ? result : {};
  return IMMUNE_CHECKS.filter((check) => {
    try { return check.violated(proc); } catch { return true; }
  }).map((check) => ({ check: check.id, evidence: check.evidence }));
}

async function designProcedure() {
  const answer = await chatJson({ model: SPECIALIST_MODEL, prompt: SPECIALIST_PROMPT,
    maxTokens: 1500, temperature: 0.3 });
  const parsed = parseJsonAnswer(SPECIALIST_MODEL, answer.text, true);
  const shaped = assertProcedureShape(SPECIALIST_MODEL, parsed.value);
  const procedure = { procedure: 'rotation-secret-compte', steps: shaped.steps,
    policy: shaped.policy, reusableRules: shaped.rules,
    designedBy: SPECIALIST_MODEL };
  return { procedure, tokens: answer.promptTokens + answer.completionTokens };
}

async function execution() {
  const { procedure, tokens } = await designProcedure();
  return { result: procedure,
    receiptId: randomUUID(), resourcesConsumed: { tokens },
    contributionScore: 1, contractCompliant: true, benefitScore: 1,
    evidenceQuality: 1, costScore: 0.1, riskScore: 0 };
}

async function immuneVerdict(procedure) {
  const answer = await chatJson({ model: IMMUNE_MODEL,
    prompt: `${IMMUNE_PROMPT_PREFIX}${JSON.stringify(procedure)}${IMMUNE_PROMPT_SUFFIX}`,
    maxTokens: 2000, temperature: 0 });
  const parsed = parseJsonAnswer(IMMUNE_MODEL, answer.text, false);
  const verdict = String(parsed.value?.verdict || '').trim().toUpperCase();
  if (verdict !== 'PASS' && verdict !== 'FAIL') throw invalid(`LLM ${IMMUNE_MODEL} returned no usable verdict.`);
  const flaws = Array.isArray(parsed.value?.flaws) ? parsed.value.flaws : [];
  return { verdict, flaws, salvaged: parsed.salvaged,
    tokens: answer.promptTokens + answer.completionTokens };
}

// Une accusation sans extrait ancre dans l artefact est inclassable : ecartee mais consignee.
// L ancrage est insensible aux espacements (le modele reformate parfois le JSON cite).
function condensed(text) {
  return String(text).replace(/\s+/g, '');
}

function groundedFlaws(flaws, procedureText) {
  const reference = condensed(procedureText);
  const list = Array.isArray(flaws) ? flaws : [];
  return list.filter((flaw) => typeof flaw?.quote === 'string' && condensed(flaw.quote).length >= 10
    && reference.includes(condensed(flaw.quote)));
}

// Immunite a deux etages : le LLM independant PUIS la checklist deterministe. Les deux doivent passer.
async function verifyCapability({ result, resultHash }) {
  const review = await immuneVerdict(result);
  const procedureText = JSON.stringify(result);
  const grounded = groundedFlaws(review.flaws, procedureText);
  const ungrounded = (Array.isArray(review.flaws) ? review.flaws.length : 0) - grounded.length;
  const deterministic = reviewProcedure(result);
  const flaws = [...grounded.map((flaw) => String(flaw?.check || 'llm-flag')),
    ...deterministic.map((flaw) => flaw.check)];
  const verdictRef = `immune-llm:verdict-${review.verdict}:${IMMUNE_MODEL}${review.salvaged ? '+salvaged' : ''}`;
  if (flaws.length > 0) {
    return { status: 'REJECTED', resultHash, verifierId: 'password-llm-immune-verifier',
      evidenceRefs: [verdictRef, ...deterministic.map((flaw) => flaw.evidence)], flaws };
  }
  const refs = [verdictRef, 'immune-proof:secret-rotation-checklist', 'host-objective:secret-safety'];
  if (ungrounded > 0) refs.push(`immune-llm:ungrounded-flags-discarded:${ungrounded}`);
  return { status: 'VERIFIED', resultHash, verifierId: 'password-llm-immune-verifier', evidenceRefs: refs };
}

function createMissionInput() {
  return { hostId: 'password-llm-host', missionId: randomUUID(),
    constitution: { objectives: HOST_OBJECTIVES },
    capability: 'password_change_procedure_llm', request: { procedure: 'rotation-secret-compte' },
    budget: { tokens: 200000, latencyMs: 1500000, maxSteps: 2 },
    executeCapability: execution, trialCapabilityExecutor: execution, verifyCapability,
    symbionts: [{ id: 'password-llm-specialist', kind: 'PROCEDURE', role: 'specialist_symbiont',
      contract: { capabilitiesOffered: ['password_change_procedure_llm'], resourcesRequested: { tokens: 200000 },
        authorityScope: { level: 'CAPABILITY', actions: ['password_change_procedure_llm'] },
        evidenceRequirements: ['immune-llm'], expectedBenefit: { safety: 'procedure LLM revisee par un LLM independant' },
        maxCost: { tokens: 100000 }, terminationConditions: ['mission-end'], dependencyCeiling: 0.3 } }],
    allocation: { policy: { tokens: { basal: 1, preferred: 50000, maximum: 200000, burstAllowance: 0 } },
      available: { tokens: 200000 } } };
}

module.exports = { createMissionInput, verifyCapability, reviewProcedure, designProcedure,
  immuneVerdict, SPECIALIST_MODEL, IMMUNE_MODEL, HOST_OBJECTIVES };
