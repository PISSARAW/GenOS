import { join } from "node:path";
import { existsSync } from "node:fs";
import { scaffoldWorkspace, runClaude, Ledger, sh } from "./lib.mjs";

const AGENT = "metagpt";
const dir = scaffoldWorkspace(AGENT);
const ledger = new Ledger(AGENT);

const role = (name, instruction) =>
  `Tu es le ${name} d'une equipe MetaGPT suivant strictement les SOP (cascade Waterfall).
${instruction}
Travaille dans le repertoire courant. Reponds par un resume bref de ton livrable.`;

// Phase 1 : Product Manager -> PRD
const pm = await runClaude({
  cwd: dir,
  label: "phase1-pm-prd",
  maxTurns: 15,
  prompt: role("Product Manager", `Lis SCENARIO.md puis produis docs/PRD.md : un Product Requirements Document standardise qui fige les exigences (securite timing-safe, hachage, validation stricte, rate limiting <1ms sur 10000 requetes, couverture 100%, clippy zero warning) avec criteres d'acceptation mesurables.`),
});
ledger.add(pm.meta);

// Phase 2 : Architect -> design + interfaces
const architect = await runClaude({
  cwd: dir,
  label: "phase2-architect-design",
  maxTurns: 20,
  prompt: role("Architect", `Lis docs/PRD.md puis produis docs/DESIGN.md : diagramme de conception textuel, choix algorithmiques (ex: token bucket vs fenetre glissante, stockage des digests), signatures/interfaces publiques completes des types et fonctions, plan de modules. L'Engineer implementera EXACTEMENT ces interfaces.`),
});
ledger.add(architect.meta);

// Phase 3 : Engineer -> implementation fidele au design
const engineer = await runClaude({
  cwd: dir,
  label: "phase3-engineer-code",
  maxTurns: 40,
  prompt: role("Engineer", `Lis docs/PRD.md et docs/DESIGN.md puis implemente EXACTEMENT les interfaces designees en Rust dans src/. Aucune deviation du design autorisee.`),
});
ledger.add(engineer.meta);

// Phase 4 : QA -> tests associes
const qa = await runClaude({
  cwd: dir,
  label: "phase4-qa-tests",
  maxTurns: 30,
  prompt: role("QA Engineer", `Lis src/ et docs/DESIGN.md puis redige les tests unitaires exhaustifs visant 100% de couverture, incluant un test bench_10k (<1ms moyen sur 10000 validations). N'ajoute pas de code produit.`),
});
ledger.add(qa.meta);

// Verification finale enregistree telle quelle (pas de boucle : philosophie cascade)
const verification = await sh("cargo test && cargo clippy --all-targets -- -D warnings", dir);
ledger.log(`[waterfall] verification finale: exit=${verification.code}`);

// MetaGPT inclut une passe interne de code review de l'Engineer (unique)
if (verification.code !== 0) {
  const hotfix = await runClaude({
    cwd: dir,
    label: "phase5-engineer-self-review",
    maxTurns: 40,
    prompt: `${role("Engineer", "Passe de revue interne obligatoire avant livraison : corrige ton implementation pour satisfaire SCENARIO.md.")}\nErreurs de verification:\n${verification.output.slice(-5000)}`,
  });
  ledger.add(hotfix.meta);
  const rerun = await sh("cargo test && cargo clippy --all-targets -- -D warnings", dir);
  ledger.log(`[waterfall] apres self-review: exit=${rerun.code}`);
}

const compiled = existsSync(join(dir, "docs", "PRD.md")) && existsSync(join(dir, "docs", "DESIGN.md"));
ledger.dump({ sopArtifactsComplete: compiled });
console.log(`[${AGENT}] termine. Artefacts SOP complets: ${compiled}`);
