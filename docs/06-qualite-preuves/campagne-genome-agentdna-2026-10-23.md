# Campagne — Cycle génome / AgentDNA (2026-10-23)

**Objectif** : trancher si un changement génomique améliore une tâche réelle sans régression.
**Plan** : `docs/06-qualite-preuves/plan-campagne-genome-agentdna-5-agents.md`.
**Mode** : scope de test isolé (`GENOS_DB_PATH` en tmpdir), `GENOS_AGENT_DNA=1`, signature optionnelle.

## Résultats par agent

### A1 — Activation & signature ✅
- Clé Ed25519 générée (`genos genome keygen`), génome parent signé (`genos genome sign`).
- `signed=true, signatureValid=true, signer=<pubkey>`.
- Génome importé en scope protégé (`camp-org`/`camp-proj`) et en scope null.
- Trusted signer enregistré ; trust verdict `trusted_signer` (mode requis) / `signature_not_required` (mode défaut).

### A2 — Candidat & opérations ✅
- Mutate produit un candidat DRAFT avec hash distinct et provenance (1 mutation).
- Candidat non sélectionnable tant que non promu (`selectGenome` retourne null).
- `content_hash` stable (re-hash identique).

### A3 — Benchmark apparié ✅
- `verifyGenomeOutcomeEvidence` retourne `true`.
- `actualGain = 0.5` (> 0) avec oracle indépendant (receipts signés).
- `fingerprintsMatch` vrai (pas de dérive parent/candidat).

### A4 — Déploiement & effet ✅
- Promotion réussie : innovation `promoted`, audit `GENOME_INNOVATION_PROMOTED` par `operator-camp`.
- Sélection : `workerGenesForAssignment` retourne le candidat avec `selectionId`.
- Effet observable : phénotype candidat inclut `genos_sandbox_exec` (absent du parent).
- Non-régression structurelle : tous les outils parents présents dans le candidat.

### A5 — Rollback & audit ✅
- Rejet : innovation `rejected`, génome `rejected`, audit `GENOME_INNOVATION_REJECTED`.
- Candidat rejeté non sélectionnable.
- Abandon (morphogenesis executor) : génome `rejected`.
- Comptes finaux : 7 génomes (3 active, 2 candidate, 2 rejected), 3 innovations (1 candidate, 1 promoted, 1 rejected), 1 sélection.

## Verdict

**Le cycle complet est démontré en conditions contrôlées** : création → canonicalisation → signature → validation → mutation → expression → versionnement → déploiement → rollback, avec effet observable sur le comportement (outils, phénotype) et preuve de gain réel par oracle indépendant.

**Limites** :
- La démonstration est en scope de test (DB tmpdir), pas en production (0 génomes dans les DB de production).
- La signature n'est pas requise par défaut (`GENOS_AGENT_DNA_REQUIRE_SIGNED=0`) ; le mode requis a été testé séparément et fonctionne.
- Les benchmarks sont des simulations contrôlées (quality 0.8 vs 0.3), pas des tâches réelles sur un LLM.
- Le gain mesuré (0.5) est sur un scénario synthétique.

## Conclusion

La machinerie est **fonctionnelle et le cycle est démontrable**, mais la démonstration réelle en production reste à faire (activation + génomes signés + benchmark sur tâches réelles). Le statut passe de « implémenté sous contrats de format » à « expérimental démontré en conditions contrôlées ».
