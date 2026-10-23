# Plan de campagne — Cycle génome / AgentDNA (5 agents)

**Objectif** : trancher si un changement génomique améliore une tâche réelle sans régression, avec preuve indépendante.
**Base** : audit du cycle complet (voir conversation précédente et `docs/06-qualite-preuves/audit-concepts-01-07.md`).
**Contraintes** : pas de service externe ; scope de test isolé ; lecture/écriture contrôlée ; rollback prévu.

## Vue d'ensemble

| Agent | Rôle | Sortie attendue |
|---|---|---|
| A1 | Activation & signature | Génome parent signé, trusted, importé |
| A2 | Candidat & opérations | Candidat DRAFT avec provenance et hash |
| A3 | Benchmark apparié | Gain réel mesuré par oracle indépendant |
| A4 | Déploiement & effet | Sélection réelle + effet sur lease/prompt |
| A5 | Rollback & audit | Traces d'audit + verdict final |

Dépendances : A2 dépend de A1 ; A3 dépend de A1+A2 ; A4 dépend de A3 (promotion) ; A5 dépend de A4.

---

## A1 — Activation & signature

**Tâches**
1. Définir env dans un scope de test isolé : `GENOS_AGENT_DNA=1`, `GENOS_AGENT_DNA_REQUIRE_SIGNED=1`, `GENOS_DB_PATH=<tmp>/campagne.db`.
2. Générer une clé Ed25519 via `genos genome keygen` (CLI) ou `sign.generate_signing_key`.
3. Enregistrer la clé publique comme trusted signer dans `genome_trusted_signers` pour le tenant de test.
4. Signer un génome parent (`agents/dna/fondations/preuve_evidence.dna` ou manifeste compilé) avec la clé.
5. Importer le génome signé via `agentDnaStore.importDirectory` ou `saveGenome`.
6. Vérifier `dnaEnabled()=true`, `isSignatureRequired=true`, `evaluateGenomeTrust.trusted=true`.

**Critères de réussite**
- `agent_genomes` contient ≥1 ligne avec `content_hash` de 64 hex.
- `evaluateGenomeTrust` retourne `{trusted:true, reason:'trusted_signer'}`.
- Le `.dna` décodé a `signed=true, signatureValid=true`.

**Critères d'échec**
- `dnaEnabled()` reste false ; import échoue ; signature invalide.

**Livrable** : clé (chemin), génome parent ID, hash, rapport A1.

---

## A2 — Candidat & opérations

**Tâches**
1. Charger le parent (A1) via `store.loadGenome`.
2. Créer un candidat par `agentDnaOperations.runOperation` avec `operation:'mutate'` (ou `speciate`) et un gène nouveau (ex. `TOOL_GENOS_SANDBOX_EXEC`).
3. Vérifier le résultat : `status:'candidate'`, `dnaStatus:'DRAFT'`, `contentHash` ≠ parent.
4. Vérifier la provenance : `provenance.mutations.length ≥ 1`, `parents` correct.
5. Vérifier que le candidat n'est pas sélectionnable par défaut (`selectGenome` avec `genomeRef` candidat retourne null tant que non promu).
6. Calculer le hash canonique et comparer à `row.content_hash`.

**Critères de réussite**
- Candidat persisté en `agent_genomes` avec `status='candidate'`.
- `content_hash` distinct et stable (re-hash identique).
- `agent_genome_innovations` contient une ligne `candidate`.

**Critères d'échec**
- Opération CLI échoue ; hash identique au parent ; candidat sélectionnable sans promotion.

**Livrable** : candidat ID, hash, provenance, rapport A2.

---

## A3 — Benchmark apparié

**Tâches**
1. Construire un scénario de tâche réelle (ex. mission `historian research` avec un outil nouveau).
2. Exécuter avec le parent : enregistrer `body_action_receipts` observés (phase `observed`, status `completed`).
3. Exécuter avec le candidat : même tâche, même seed, même budget.
4. Produire les tentatives via `morphogenesisPairedOutcomeProducer.buildRow` (candidate + control + prediction).
5. Signer les receipts avec un oracle indépendant (`epistemicVerifierReceiptService.issueReceipt`).
6. Appeler `morphogenesisGenomeOutcomeEvidence.verifyGenomeOutcomeEvidence` avec `actualGain > 0`.
7. Vérifier `fingerprintsMatch` (contentHash candidat/parent, genomeBinding).

**Critères de réussite**
- `verifyGenomeOutcomeEvidence` retourne `true`.
- `actualGain > 0` avec oracle indépendant.
- `fingerprintsMatch` vrai (pas de dérive).

**Critères d'échec**
- `actualGain ≤ 0` ; fingerprints ne correspondent pas ; oracle non indépendant.

**Livrable** : paire d'outcome, gain mesuré, receipts signés, rapport A3.

---

## A4 — Déploiement & effet

**Tâches**
1. Promouvoir le candidat via `agentDnaInnovation.promoteCandidate` avec un `operatorId`.
2. Vérifier `status='promoted'` et audit log `GENOME_INNOVATION_PROMOTED`.
3. Sélectionner le candidat via `store.workerGenesForAssignment` (scope de test).
4. Vérifier que `agent_genome_selections` contient une ligne avec `innovation_id` lié.
5. Vérifier l'effet sur le comportement :
   - `workerGenes` inclut le nouvel outil/capacité.
   - `intersectLease` inclut le nouvel outil dans le lease.
   - `dnaPromptBlock` injecte le nouveau rôle/stratégie/outils.
   - `expressedCapabilities` inclut la nouvelle capacité.
6. Vérifier que tous les outils/capacités du parent sont présents (non-régression structurelle).

**Critères de réussite**
- Promotion réussie avec audit.
- Sélection retourne le candidat avec `selectionId`.
- Lease et prompt reflètent le changement.
- Aucun outil/capacité parent manquant.

**Critères d'échec**
- Promotion bloquée (`INNOVATION_GATE_BLOCKED`) ; sélection retourne null ; lease inchangé ou régressé.

**Livrable** : audit de promotion, sélection, diff lease/prompt, rapport A4.

---

## A5 — Rollback & audit

**Tâches**
1. Créer un second candidat (muté différemment) et l'abandonner via `abandonCandidate`.
2. Vérifier `status='rejected'` dans `agent_genomes` et `agent_genome_innovations`.
3. Vérifier la trace d'audit (raison, acteur).
4. Vérifier que le candidat abandonné n'est plus sélectionnable.
5. Compiler le rapport final : tableau des 5 agents, critères remplis/non, verdict de maturité.
6. Mettre à jour `docs/06-qualite-preuves/statuts-maturite.md` si applicable (avec ADR si changement d'architecture).

**Critères de réussite**
- Rollback laisse une trace d'audit.
- Candidat rejeté non sélectionnable.
- Rapport final avec verdict et chaîne de preuves.

**Critères d'échec**
- Pas de trace d'audit ; candidat toujours sélectionnable.

**Livrable** : rapport final, verdict, mise à jour doc.

---

## Matrice de dépendances

```
A1 ──► A2 ──► A3 ──► A4 ──► A5
```

- A1 et A2 peuvent démarrer en séquence (A2 a besoin du parent).
- A3 nécessite parent + candidat.
- A4 nécessite le gain prouvé (A3).
- A5 peut préparer le rollback en parallèle mais l'exécute après A4.

## Fichiers et commandes clés

| Étape | Fichier | Fonction |
|---|---|---|
| A1 | `backend/src/services/agentDnaStore.js` | `saveGenome`, `importDirectory`, `dnaEnabled` |
| A1 | `backend/src/services/agentDnaPolicy.js` | `isSignatureRequired`, `setPolicy` |
| A1 | `backend/src/services/agentDnaTrust.js` | `evaluateGenomeTrust` |
| A2 | `backend/src/services/agentDnaOperations.js` | `runOperation` |
| A2 | `crates/genos-dna/src/operations.rs` | `mutate`, `speciate` |
| A3 | `backend/src/services/morphogenesis/morphogenesisGenomeOutcomeEvidence.js` | `verifyGenomeOutcomeEvidence` |
| A3 | `backend/src/services/morphogenesis/morphogenesisPairedOutcomeProducer.js` | `buildRow`, `recordPairedOutcome` |
| A4 | `backend/src/services/agentDnaInnovation.js` | `promoteCandidate`, `captureFromSuccess` |
| A4 | `backend/src/services/agents/agentIncarnationService.js` | `computeLease`, `dnaPromptBlock` |
| A5 | `backend/src/services/morphogenesis/morphogenesisGenomeExecutorService.js` | `abandonCandidate` |

## Inconnues à surveiller

- `morphogenesisPairedOutcomeProducer` et `morphogenesisTransitionReceipt` peuvent nécessiter des fixtures complexes (voir `test_morphogenesis_genome_outcome_evidence.js`).
- L'oracle indépendant (`epistemicVerifierReceiptService`) doit être configuré avec une clé de test (`GENOS_EPISTEMIC_RECEIPT_SECRET`).
- Les DB de production ne doivent pas être touchées ; utiliser `GENOS_DB_PATH` en tmpdir.
- Le code est opt-in ; vérifier que `GENOS_AGENT_DNA=1` est bien propagé à tous les processus (CLI Rust inclus).

## Verdict attendu

À l'issue, le rapport A5 conclut soit :
- **Démontré** : le cycle améliore une tâche réelle sans régression (avec preuves).
- **Non démontré** : la machinerie existe mais l'effet réel n'est pas obtenu (documenter la cause).
- **Partiel** : certains critères remplis, d'autres non (lister lesquels).
