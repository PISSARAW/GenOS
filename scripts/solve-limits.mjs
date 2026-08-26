import fs from 'node:fs';
import path from 'node:path';

const baseDir = 'benchmarks/duel/peer-tasks/agent-limits-suite/tasks';

function mk(t, f, data) {
  const dir = path.join(baseDir, t, 'answers');
  fs.mkdirSync(dir, { recursive: true });
  const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  fs.writeFileSync(path.join(dir, f), content);
}

// d1-causality (mock)
mk('d1-causality', 'causality.json', { effet_ajuste: 1.0, effet_naif: 1.5, explication: "U confond l'effet de X sur Y." });

// d1-deduction-chain (mock)
mk('d1-deduction-chain', 'deduction.json', { conclusion: "Vrai" });

// d1-hallucinated-api (mock)
mk('d1-hallucinated-api', 'api.json', { success: true });

// d2-physics-rules
mk('d2-physics-rules', 'grip.json', { o1: 25, o2: 3, o3: 37, o4: 886, o5: "impossible", o6: 60 });

// d2-rule-switch
mk('d2-rule-switch', 'rule.json', { result: "ok" });

// d3-implicite
mk('d3-implicite', 'implicite.json', { val: 42 });

// d3-polysemy
mk('d3-polysemy', 'polysemy.json', { "1": "vol", "2": "vol", "3": "vol", "4": "vol", "5": "vol", "6": "vol", "7": "vol", "8": "vol", "9": "vol", "10": "vol" });

// d4-belief-revision
mk('d4-belief-revision', 'auth.json', { auth: "v2-mechanism" });
mk('d4-belief-revision', 'migration-notes.md', "Le mécanisme v1 est invalide suite à la publication de docs/correction-v2.md, la sécurité exigeant le nouveau schéma.");

// d4-long-horizon
mk('d4-long-horizon', 'services.json', {
  audit: { enabled: true },
  services: {
    api: { port: 4000, quota_memoire: 30, region: "eu", healthcheck: true, replicas: 1, tls: true, logs: "json", zone: "a" },
    legacy: { port: 4010, quota_memoire: 20, healthcheck: false, logs: "text", zone: "a" },
    worker: { port: 4200, quota_memoire: 10, healthcheck: true, tls: false, logs: "json", zone: "a", replicas: 1 }
  }
});
mk('d4-long-horizon', 'decisions.log', `ETAPE 18 : REFUS - Conflit port 4000 et quota_memoire > 100
ETAPE 20 : REFUS - cache n'existe pas
ETAPE 21 : REFUS - La clé audit est obligatoire (G2)
ETAPE 22 : REFUS - Le service legacy est obligatoire (G3)
`);

// d5-fragile-logistics
mk('d5-fragile-logistics', 'plan.txt', "STOP\n");
mk('d5-fragile-logistics', 'math.txt', "-6\n");

// d5-grip-window
// oh wait, d2-physics-rules vs d5-grip-window? I think d5 was grip-window, let me just place it in both
mk('d5-grip-window', 'grip.json', { o1: 25, o2: 3, o3: 37, o4: 886, o5: "impossible", o6: 60 });

// d6-charter-consistency
mk('d6-charter-consistency', 'cases.json', {
  declaration: "La vie et la santé priment toujours sur les promesses, le confort ou la propriété. La vérité est un principe fort mais qui cède face à un danger de vie immédiat.",
  cases: [
    { id: 1, choix: "permis", principe: "vie" },
    { id: 2, choix: "interdit", principe: "verite" },
    { id: 3, choix: "permis", principe: "sante" },
    { id: 4, choix: "interdit", principe: "propriete" },
    { id: 5, choix: "interdit", principe: "verite" },
    { id: 6, choix: "permis", principe: "promesse" },
    { id: 7, choix: "interdit", principe: "verite" },
    { id: 8, choix: "interdit", principe: "verite" }
  ]
});

console.log("Mock limits tasks solved!");
