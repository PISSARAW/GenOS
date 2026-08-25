import { join } from "node:path";
import { scaffoldWorkspace, ws, runClaude, Ledger, sh, resultsDir } from "./lib.mjs";

const AGENT = "autogen";
const dir = scaffoldWorkspace(AGENT);
const ledger = new Ledger(AGENT);
const MAX_ROUNDS = 6;

const coderBase = `Tu es CoderAgent dans un GroupChat AutoGen. Ton repertoire de travail courant contient SCENARIO.md.
Lis SCENARIO.md puis implemente ou corrige le middleware en Rust dans src/.
Reponds uniquement par un court resume technique de ce que tu as ecrit/modifie.`;

const criticTemplate = (focus) => `Tu es ${focus.name} dans un GroupChat AutoGen.
Lis les fichiers .rs du repertoire courant et verifie l'aspect suivant : ${focus.check}.
Reponds EXACTEMENT au format :
VERDICT: PASS
ou
VERDICT: FAIL
ISSUES:
- <probleme concret et correctif precise>`;

async function verify(round) {
  ledger.log(`[UserProxy] round ${round}: cargo test`);
  const test = await sh("cargo test", dir);
  const clippy = await sh("cargo clippy --all-targets -- -D warnings", dir);
  return { test, clippy, green: test.code === 0 && clippy.code === 0 };
}

let consoleOutput = "(premiere iteration, aucun output)";
let finalVerdict = "MAX_ROUNDS_REACHED";

for (let round = 1; round <= MAX_ROUNDS; round++) {
  const coder = await runClaude({
    cwd: dir,
    label: `round${round}-coder`,
    maxTurns: 40,
    prompt: `${coderBase}\n\nSortie console de la derniere verification (UserProxyAgent):\n${consoleOutput.slice(-6000)}`,
  });
  ledger.add(coder.meta);

  const { test, clippy, green } = await verify(round);
  consoleOutput = `${test.output}\n${clippy.output}`;

  if (!green) {
    ledger.log(`[UserProxy] round ${round}: NOT green, back to coder`);
    continue;
  }

  const [security, perf] = await Promise.all([
    runClaude({
      cwd: dir,
      label: `round${round}-SecurityCritic`,
      prompt: criticTemplate({ name: "SecurityCritic", check: "attaques temporelles (comparaison constant-time), hachage des secrets, validation stricte des entrees, injection" }),
    }),
    runClaude({
      cwd: dir,
      label: `round${round}-PerformanceCritic`,
      prompt: criticTemplate({ name: "PerformanceCritic", check: "allocations inutiles dans le chemin critique, complexite, structures de donnees, respect du budget <1ms pour 10000 requetes" }),
    }),
  ]);
  ledger.add(security.meta);
  ledger.add(perf.meta);

  const pass = /VERDICT:\s*PASS/i.test(security.text) && /VERDICT:\s*PASS/i.test(perf.text);
  ledger.log(`[GroupChat] SecurityCritic=${/VERDICT:\s*(PASS|FAIL)/i.exec(security.text)?.[1]} PerformanceCritic=${/VERDICT:\s*(PASS|FAIL)/i.exec(perf.text)?.[1]}`);
  if (pass) {
    finalVerdict = `CONSENSUS_ROUND_${round}`;
    break;
  }
  consoleOutput += `\nCritiques:\n${security.text.slice(0, 2000)}\n${perf.text.slice(0, 2000)}`;
}

ledger.dump({ termination: finalVerdict });
console.log(`[${AGENT}] termine: ${finalVerdict}`);
