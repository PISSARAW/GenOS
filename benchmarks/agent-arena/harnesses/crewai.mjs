import { join } from "node:path";
import { scaffoldWorkspace, runClaude, Ledger, sh } from "./lib.mjs";

const AGENT = "crewai";
const dir = scaffoldWorkspace(AGENT);
const ledger = new Ledger(AGENT);

const persona = (role, goal, backstory, task) => `Tu es un agent CrewAI avec un persona strict.
Role: ${role}
Objectif: ${goal}
Historique: ${backstory}
Ta tache (Task): ${task}
Travaille directement dans le repertoire courant (lis SCENARIO.md). Reponds par un resume bref de ton livrable.`;

const architect = await runClaude({
  cwd: dir,
  label: "task1-architect",
  maxTurns: 40,
  prompt: persona(
    "Senior Rust Architect",
    "Ecrire un middleware ultra-performant et securise (timing-safe, hachage, validation stricte, rate limiting)",
    "15 ans de systemes bas niveau, obnubile par le zero-allocation et la surete memoire",
    "Implementer src/lib.rs (+ modules si besoin) conformement a SCENARIO.md",
  ),
});
ledger.add(architect.meta);

const qa = await runClaude({
  cwd: dir,
  label: "task2-qa",
  maxTurns: 30,
  prompt: persona(
    "QA Automation Engineer",
    "Produire une suite de tests exhaustive visant 100% de couverture incluant un bench bench_10k (<1ms moyen sur 10000 requetes)",
    "Specialiste des tests de propriete et des cas limites",
    "Ajouter les tests unitaires exhaustifs au crate existant (ne regraisse pas l'implementation)",
  ),
});
ledger.add(qa.meta);

const reviewRun = await sh("cargo test && cargo clippy --all-targets -- -D warnings", dir);
ledger.log(`[tooling] verification: exit=${reviewRun.code}`);
const testCount = parseInt(/(\d+) passed/.exec(reviewRun.output)?.[1] ?? "0", 10);
const objectiveGreen = reviewRun.code === 0 && testCount > 0;

let reviewerText = "";
for (let attempt = 1; attempt <= 3 && !(objectiveGreen && /APPROVED/i.test(reviewerText ?? "")); attempt++) {
  const reviewer = await runClaude({
    cwd: dir,
    label: `task3-reviewer-${attempt}`,
    maxTurns: 25,
    prompt: persona(
      "Strict Code Reviewer",
      "Traquer tout warning clippy et toute faille timing attack; valider la qualite globale",
      "Ancien auditeur cryptographique, intraitable. Tu dois lire chaque fichier .rs avec read_file AVANT de juger.",
      `Inspecte le code ET les resultats d'execution suivants.\n\nResultats cargo (exit=${reviewRun.code}, tests passes=${testCount}):\n${reviewRun.output.slice(-4000)}\n\nVerifie aussi que SCENARIO.md est respecte (constant-time, hachage, validation stricte, bench_10k <1ms, couverture).\nSi une contrainte n'est pas respectee ou si les tests sont absents/insuffisants, liste les corrections OBLIGATOIRES sous 'DELEGATION:' sinon reponds 'APPROVED'.`,
    ),
  });
  ledger.add(reviewer.meta);
  reviewerText = reviewer.text;
  if (objectiveGreen && /APPROVED/i.test(reviewerText)) break;
  if (!objectiveGreen || !/DELEGATION/i.test(reviewerText)) {
    // le reviewer doit deleguer : on force une passe de correction sur la base du verdict mecanique
    reviewerText = reviewerText.includes("DELEGATION")
      ? reviewerText
      : `DELEGATION:\n- Les tests mecaniques sont ${objectiveGreen ? "OK" : `en echec (exit=${reviewRun.code}, tests=${testCount})`}. Corriger l'implementation pour satisfaire SCENARIO.md.`;
  }

  const fix = await runClaude({
    cwd: dir,
    label: `delegation-fix-${attempt}`,
    maxTurns: 50,
    prompt: `${persona("Senior Rust Architect", "corriger le code selon la delegation du reviewer", "tu appliques les revues sans discuter", "applique les corrections demandees")}\n\nDelegation du reviewer:\n${reviewerText.slice(0, 4000)}`,
  });
  ledger.add(fix.meta);
  const rerun = await sh("cargo test && cargo clippy --all-targets -- -D warnings", dir);
  ledger.log(`[tooling] reverification apres delegation ${attempt}: exit=${rerun.code}`);
}

const finalRun = await sh("cargo test", dir);
const finalTests = parseInt(/(\d+) passed/.exec(finalRun.output)?.[1] ?? "0", 10);

ledger.dump({ reviewerApproved: /APPROVED/i.test(reviewerText), finalTestsPassed: finalTests });
console.log(`[${AGENT}] termine. Reviewer: ${/APPROVED/i.test(reviewerText) ? "APPROVED" : "NON APPROUVE"}, tests finaux: ${finalTests}`);
