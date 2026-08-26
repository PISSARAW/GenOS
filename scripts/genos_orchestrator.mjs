import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SERVER_URL = process.argv.find((_, i, a) => a[i - 1] === '--server') ?? process.env.OPENCODE_SERVER_URL ?? 'http://127.0.0.1:59291';
const USERNAME = process.env.OPENCODE_SERVER_USERNAME;
const PASSWORD = process.env.OPENCODE_SERVER_PASSWORD;

const MODEL = { providerID: 'opencode', modelID: 'x-preview-f-free' };

const MISSION = {
  id: 'question-order-impact',
  goal: "Évaluer l'impact de l'ordre des questions sur la réponse d'un modèle de langage.",
  questions: {
    Q1: 'Une intelligence artificielle peut-elle apprendre ?',
    Q2: "Comment définirais-tu l'apprentissage ?",
  },
  sequences: [
    { id: 'A', order: ['Q1', 'Q2'] },
    { id: 'B', order: ['Q2', 'Q1'] },
  ],
  reportLanguage: 'en',
  reportFocus:
    "Analyser spécifiquement si la réponse concernant la capacité d'apprentissage de l'IA change ou se contredit selon qu'elle a été posée avant ou après avoir défini le concept d'apprentissage.",
};

class TelemetryAgent {
  constructor() {
    this.name = 'Observer';
  }

  log(message) {
    console.log(`[${this.name}] TELEMETRY: ${message}`);
  }
}

function authHeader() {
  return 'Basic ' + Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');
}

async function api(path, options = {}) {
  const response = await fetch(`${SERVER_URL}${path}`, {
    ...options,
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    signal: AbortSignal.timeout(600_000),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${options.method ?? 'GET'} ${path} -> ${response.status}: ${body.slice(0, 800)}`);
  }
  if (response.status === 204) return null;
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return await response.text();
  }
  return await response.json();
}

function extractText(parts) {
  return parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim();
}

class GenOSOrchestrator {
  constructor(telemetry = new TelemetryAgent()) {
    this.telemetry = telemetry;
  }

  async createSession(title) {
    const session = await api('/session', {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
    this.telemetry.log(`Session created: ${session.id} (${title})`);
    return session;
  }

  async ask(sessionID, text) {
    const startedAt = Date.now();
    const result = await api(`/session/${sessionID}/message`, {
      method: 'POST',
      body: JSON.stringify({
        model: MODEL,
        system: 'You are a thoughtful assistant. Answer the user directly and concisely. Do not use any tools.',
        parts: [{ type: 'text', text }],
      }),
    });
    const elapsed = Date.now() - startedAt;
    this.telemetry.log(`Response received (${elapsed} ms): "${text.slice(0, 60)}..."`);
    return {
      question: text,
      answer: extractText(result.parts),
      info: {
        model: result.info?.modelID,
        tokens: result.info?.tokens,
        cost: result.info?.cost,
        elapsedMs: elapsed,
      },
    };
  }

  async runSequence(sequence, questions) {
    const session = await this.createSession(`GenOS Experiment - Sequence ${sequence.id} (${sequence.order.join(' -> ')})`);
    const turns = [];
    for (const key of sequence.order) {
      this.telemetry.log(`Sequence ${sequence.id}: asking ${key}: "${questions[key]}"`);
      turns.push(await this.ask(session.id, questions[key]));
    }
    return { sequenceId: sequence.id, sessionId: session.id, turns };
  }

  async generateReport(results, mission) {
    const session = await this.createSession('GenOS Experiment - Comparative Report');
    const transcripts = results
      .map((run) => {
        const dialogue = run.turns
          .map((turn, i) => `### Turn ${i + 1}\n\n**Question:** ${turn.question}\n\n**Answer:**\n\n${turn.answer}`)
          .join('\n\n---\n\n');
        return `## Sequence ${run.sequenceId} (session ${run.sessionId})\n\n${dialogue}`;
      })
      .join('\n\n================\n\n');

    const prompt = `You are the reporting agent of the GenOS orchestrator. Write a rigorous COMPARATIVE REPORT in ENGLISH based exclusively on the experiment transcripts below.

Experiment goal: ${mission.goal}
Questions used: Q1 = "${mission.questions.Q1}" | Q2 = "${mission.questions.Q2}"
Sequence A = Q1 asked first, then Q2. Sequence B = Q2 asked first, then Q1.
Specific focus of the analysis: ${mission.reportFocus}

Experiment transcripts:

${transcripts}

Mandatory structure (markdown):
1. **Executive Summary** (3-5 sentences, direct verdict on whether question order changes the AI-learning-capability answer).
2. **Methodology** (isolated sessions, fixed neutral system prompt, identical wording, execution order).
3. **Observed Responses** (concise faithful summaries of the four answers, quoting short key French excerpts with English translations).
4. **Comparative Analysis** (the core section: place the AI-learning-capability answer side by side across Sequence A vs Sequence B; determine whether stance, confidence, hedging, terminology, or scope change; explicitly state whether the two answers CONTRADICT each other or merely rephrase; assess how the prior definition-of-learning answer influenced it).
5. **Verdict** (explicit conclusion: order-sensitive or order-insensitive, contradiction found yes/no).
6. **Limitations** (single run per sequence, single model, no statistical power).

Write the entire report in English. Quote French passages verbatim when needed, always followed by an English translation. Do not use tools. Output ONLY the markdown report.`;

    const result = await this.ask(session.id, prompt);
    return result.answer;
  }

  async handleMission(mission) {
    this.telemetry.log(`Mission received: "${mission.id}"`);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const runDir = join('.genos', 'experiments', `${mission.id}-${stamp}`);
    mkdirSync(runDir, { recursive: true });
    this.telemetry.log(`Run directory: ${runDir}`);

    const results = [];
    for (const sequence of mission.sequences) {
      results.push(await this.runSequence(sequence, mission.questions));
    }
    this.telemetry.log('Both sequences completed.');

    writeFileSync(
      join(runDir, 'raw-results.json'),
      JSON.stringify({ mission, model: MODEL, executedAt: new Date().toISOString(), runs: results }, null, 2),
    );

    for (const run of results) {
      const md = run.turns
        .map((turn, i) => `### Turn ${i + 1}\n\n**Question:** ${turn.question}\n\n**Answer:**\n\n${turn.answer}\n`)
        .join('\n---\n\n');
      writeFileSync(join(runDir, `sequence-${run.sequenceId}-transcript.md`), `# Transcript - Sequence ${run.sequenceId}\n\n${md}`);
    }

    this.telemetry.log('Generating comparative report...');
    const report = await this.generateReport(results, mission);
    const reportPath = join(runDir, 'REPORT.md');
    writeFileSync(reportPath, report);
    this.telemetry.log(`Comparative report written: ${reportPath}`);

    return { runDir, reportPath, report, results };
  }
}

async function main() {
  const orchestrator = new GenOSOrchestrator();
  const reportOnlyIndex = process.argv.indexOf('--report-only');
  if (reportOnlyIndex !== -1) {
    const runDir = process.argv[reportOnlyIndex + 1];
    const saved = JSON.parse(readFileSync(join(runDir, 'raw-results.json'), 'utf8'));
    const report = await orchestrator.generateReport(saved.runs, saved.mission);
    const reportPath = join(runDir, 'REPORT.md');
    writeFileSync(reportPath, report);
    console.log('\n=== REPORT REGENERATED ===');
    console.log(`Report: ${reportPath}\n`);
    console.log(report);
    return;
  }
  const outcome = await orchestrator.handleMission(MISSION);
  console.log('\n=== RUN COMPLETE ===');
  console.log(`Run directory: ${outcome.runDir}`);
  console.log(`Report: ${outcome.reportPath}\n`);
  console.log(outcome.report);
}

main().catch((error) => {
  console.error('[Observer] TELEMETRY: Mission FAILED:', error.message);
  process.exit(1);
});
