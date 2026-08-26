import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SERVER_URL = process.env.OPENCODE_SERVER_URL ?? 'http://127.0.0.1:59291';
const USERNAME = process.env.OPENCODE_SERVER_USERNAME;
const PASSWORD = process.env.OPENCODE_SERVER_PASSWORD;
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';

const QUESTIONS = {
  Q1: 'Une intelligence artificielle peut-elle apprendre ?',
  Q2: "Comment définirais-tu l'apprentissage ?",
};

const SEQUENCES = [
  { id: 'A', order: ['Q1', 'Q2'] },
  { id: 'B', order: ['Q2', 'Q1'] },
];

const MODELS = [
  { id: 'x-preview-f-free', provider: 'opencode' },
  { id: 'qwen2.5-coder:14b', provider: 'ollama' },
];

const ORCHESTRATION = ['on', 'off'];

const SYSTEM_PROMPT =
  'You are a thoughtful assistant. Answer the user directly and concisely. Do not use any tools.';

const RUNS_PER_CELL = Number(process.argv[process.argv.indexOf('--runs') + 1] ?? 3);
const TEMP_ARG = process.argv.indexOf('--temp');
const SEED_ARG = process.argv.indexOf('--seed');
const OLLAMA_TEMP = TEMP_ARG !== -1 ? Number(process.argv[TEMP_ARG + 1]) : 0;
const OLLAMA_SEED = SEED_ARG !== -1 ? Number(process.argv[SEED_ARG + 1]) : 42;

class TelemetryAgent {
  constructor() {
    this.name = 'Observer';
  }

  log(message) {
    console.log(`[${this.name}] TELEMETRY: ${message}`);
  }
}

function basicAuth() {
  return 'Basic ' + Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');
}

async function opencodeCreateSession(title) {
  const res = await fetch(`${SERVER_URL}/session`, {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`session create ${res.status}: ${await res.text()}`);
  return (await res.json()).id;
}

async function opencodeAsk(sessionID, text, system) {
  const body = { model: { providerID: 'opencode', modelID: 'x-preview-f-free' }, parts: [{ type: 'text', text }] };
  if (system !== null) body.system = system;
  const started = Date.now();
  const res = await fetch(`${SERVER_URL}/session/${sessionID}/message`, {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(600_000),
  });
  if (!res.ok) throw new Error(`message ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { text: data.parts.filter((p) => p.type === 'text').map((p) => p.text).join('\n').trim(), ms: Date.now() - started };
}

async function ollamaAsk(messages, seed) {
  const started = Date.now();
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen2.5-coder:14b',
      messages,
      stream: false,
      options: { temperature: OLLAMA_TEMP, seed, num_predict: 700, num_ctx: 8192 },
    }),
    signal: AbortSignal.timeout(600_000),
  });
  if (!res.ok) throw new Error(`ollama ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { text: data.message.content.trim(), ms: Date.now() - started };
}

const CITATION_RE =
  /(au sens d[ée]fini|d[ée]finition (donn[ée]e|[ée]nonc[ée]e|pr[ée]c[ée]dente|que j'ai donn[ée]e|tout à l'heure)|tout à l'heure|comme d[ée]fini|d[ée]fini(e)? (juste |pr[ée]c[ée]demment )?(plus haut|avant|pr[ée]c[ée]demment)|ci-dessus|selon (la|ma|cette) d[ée]finition|j'ai d[ée]fini|je (l')?ai d[ée]fini|pr[ée]c[ée]demment)/i;

const CONTAMINATION_RE =
  /(intelligence artificielle|\bIA\b|machine[s]?\b|algorithme|r[ée]seau(x)? de neurones|mod[èe]le (de )?(langage|pr[ée]dictif|math[ée]matique)|descente de gradient|donn[ée]es|informatique|num[ée]rique)/i;

const AFFIRMATIVE_RE = /\boui\b|bien s[ûr]|effectivement|absolument|clairement oui/i;

function analyze(turns, orderId) {
  const last = turns[turns.length - 1];
  const defTurn = orderId === 'B' ? turns[0] : turns[1];
  const capTurn = orderId === 'B' ? turns[1] : turns[0];
  const citationMatch = orderId === 'B' ? capTurn.answer.match(CITATION_RE) : null;
  const contamination = Boolean(defTurn.answer.match(CONTAMINATION_RE));
  const affirmative = Boolean(capTurn.answer.match(AFFIRMATIVE_RE));
  return {
    citationOfPriorDefinition: Boolean(citationMatch),
    citationExcerpt: citationMatch ? capTurn.answer.slice(Math.max(0, citationMatch.index - 90), citationMatch.index + 110) : null,
    aiContaminatedDefinition: contamination,
    capabilityAnswerAffirmative: affirmative,
  };
}

async function runSequence(model, orch, seq, telemetry, stamp, runIndex) {
  const label = `${model.id}|orch-${orch}|seq-${seq.id}|r${runIndex}`;
  const messages = [];
  let sessionID = null;
  if (model.provider === 'opencode') {
    sessionID = await opencodeCreateSession(`GenOS Ablation - ${label} - ${stamp}`);
    telemetry.log(`Session ${sessionID} (${label})`);
  }
  if (orch === 'on') {
    messages.push({ role: 'system', content: SYSTEM_PROMPT });
  }
  const turns = [];
  for (const key of seq.order) {
    const question = QUESTIONS[key];
    if (model.provider === 'opencode') {
      const r = await opencodeAsk(sessionID, question, orch === 'on' ? SYSTEM_PROMPT : null);
      turns.push({ key, question, answer: r.text, ms: r.ms });
    } else {
      messages.push({ role: 'user', content: question });
      const r = await ollamaAsk(messages, OLLAMA_SEED + runIndex * 101 + turns.length * 7);
      messages.push({ role: 'assistant', content: r.text });
      turns.push({ key, question, answer: r.text, ms: r.ms });
    }
    telemetry.log(`${label} :: ${key} done (${turns[turns.length - 1].ms} ms)`);
  }
  return {
    cell: { model: model.id, orchestration: orch, sequence: seq.id },
    sessionId: sessionID,
    turns,
    analysis: analyze(turns, seq.id),
  };
}

function safeName(str) {
  return str.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
}

async function main() {
  const modelArg = process.argv[process.argv.indexOf('--model') + 1];
  const model = MODELS.find((m) => m.id === modelArg);
  if (!model) throw new Error('pass --model x-preview-f-free | qwen2.5-coder:14b');

  const telemetry = new TelemetryAgent();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const runDir = join('.genos', 'experiments', `ablation-coherence-${stamp}`);
  mkdirSync(runDir, { recursive: true });

  for (const orch of ORCHESTRATION) {
    for (const seq of SEQUENCES) {
      const decodingSuffix = OLLAMA_TEMP !== 0 || OLLAMA_SEED !== 42 ? `-t${OLLAMA_TEMP}-s${OLLAMA_SEED}` : '';
      const cellFile = join(runDir, `cell-${safeName(model.id)}-orch${orch}-seq${seq.id}${decodingSuffix}.json`);
      let cellData = { cell: { model: model.id, orchestration: orch, sequence: seq.id }, runs: [] };
      if (existsSync(cellFile)) cellData = JSON.parse(readFileSync(cellFile, 'utf8'));
      while (cellData.runs.length < RUNS_PER_CELL) {
        telemetry.log(`RUN ${cellData.runs.length + 1}/${RUNS_PER_CELL} [${model.id} | orch=${orch} | seq=${seq.id}]`);
        try {
          cellData.runs.push(await runSequence(model, orch, seq, telemetry, stamp, cellData.runs.length));
        } catch (err) {
          telemetry.log(`ERROR in cell: ${err.message}`);
          break;
        }
        writeFileSync(cellFile, JSON.stringify(cellData, null, 2));
      }
      writeFileSync(cellFile, JSON.stringify(cellData, null, 2));
      telemetry.log(`CELL DONE [${model.id} | orch=${orch} | seq=${seq.id}]: ${cellData.runs.length}/${RUNS_PER_CELL} runs`);
    }
  }
  telemetry.log(`Model sweep complete: ${model.id}`);
}

main().catch((err) => {
  console.error('[Observer] TELEMETRY: ABLATION FAILED:', err.message);
  process.exit(1);
});
