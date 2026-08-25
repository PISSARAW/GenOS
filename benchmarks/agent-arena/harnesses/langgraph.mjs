import { join } from "node:path";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { scaffoldWorkspace, runClaude, Ledger, sh } from "./lib.mjs";

const AGENT = "langgraph";
const dir = scaffoldWorkspace(AGENT);
const ledger = new Ledger(AGENT);
const statePath = join(dir, ".graph_state.json");

const MAX_VISITS = { write_code: 6 };
let state = {
  node: "write_code",
  visits: { write_code: 0 },
  code_source_present: false,
  test_failures: null,
  lint_warnings: null,
  benchmark_ok: null,
  security_approved: false,
  feedback: "(aucune)",
};

function saveState() {
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

async function writeCodeNode() {
  state.visits.write_code++;
  const res = await runClaude({
    cwd: dir,
    label: `node-write_code-${state.visits.write_code}`,
    maxTurns: 40,
    prompt: `Tu es le noeud Write_Code d'un graphe LangGraph. Lis SCENARIO.md puis ecris/corrige le code Rust dans src/.
Etat courant du graphe:
${JSON.stringify(state, null, 2)}
Retour d'erreur precedent a prendre en compte:
${String(state.feedback).slice(-5000)}
Reponds par un resume bref.`,
  });
  ledger.add(res.meta);
}

async function sandboxEvaluatorNode() {
  const hasCode = existsSync(join(dir, "src", "lib.rs"));
  const test = await sh("cargo test", dir);
  const clippy = await sh("cargo clippy --all-targets -- -D warnings", dir);
  state.code_source_present = hasCode;
  state.test_failures = test.code === 0 ? 0 : (/\d+ failed/.exec(test.output)?.[1] ?? "compile/other");
  state.lint_warnings = clippy.code === 0 ? 0 : ">0";
  state.feedback = `${test.output}\n${clippy.output}`;
  ledger.log(`[Run_Sandbox_Evaluator] tests=${state.test_failures} lint=${state.lint_warnings}`);
}

async function securityAuditNode() {
  const res = await runClaude({
    cwd: dir,
    label: `node-security_audit-${state.visits.write_code}`,
    prompt: `Tu es le noeud Security_Audit d'un graphe LangGraph.
Lis les fichiers .rs du repertoire et verifie: comparaisons constant-time sur les secrets, hachage cryptographique des jetons, validation stricte des entrees, aucune injection possible.
Reponds EXACTEMENT:
SECURITY_APPROVED: true
ou
SECURITY_APPROVED: false
ISSUES:
- ...`,
  });
  ledger.add(res.meta);
  state.security_approved = /SECURITY_APPROVED:\s*true/i.test(res.text);
  if (!state.security_approved) state.feedback = res.text;
}

while (true) {
  saveState();
  const { node } = state;

  if (node === "write_code") {
    if (state.visits.write_code >= MAX_VISITS.write_code) {
      state.node = "END_MAX_VISITS";
      continue;
    }
    await writeCodeNode();
    await sandboxEvaluatorNode();
    // Arete conditionnelle
    state.node =
      state.test_failures === 0 && state.lint_warnings === 0 ? "security_audit" : "write_code";
  } else if (node === "security_audit") {
    await securityAuditNode();
    // Arete conditionnelle
    state.node = state.security_approved ? "END_SUCCESS" : "write_code";
  } else {
    break; // END_*
  }
}
saveState();

const metrics = ledger.dump({ termination: state.node, finalState: state });
console.log(`[${AGENT}] termine: ${state.node} (${metrics.llmCalls} appels LLM)`);
