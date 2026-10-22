# ADR 0728 — Security Qualification Laboratory (SQLab) et référentiel C0–C5

- **Statut** : Accepté
- **Date** : 2026-10-22
- **Domaine** : cybersécurité, qualification, reproductibilité, preuves de fonctionnement réel
- **Décideurs** : mainteneurs GenOS
- **Lié à** : ADR 0613, ADR 0721, ADR 0725, ADR 0727

## Contexte

Les tests unitaires de composants valident un contrat local (`C1` ou `C2`) mais
ne constituent pas à eux seuls une preuve de fonctionnement intégré ou
reproductible (`C3`–`C5`). Il manquait un laboratoire de qualification capable
d'évaluer des scénarios complets de sécurité sur un corpus incluant des
attaques simulées, des activités normales, des capteurs défaillants et des
incidents impossibles à conclure.

## Décision

Le module `backend/src/services/securityQualificationLab/` implémente le
**Security Qualification Laboratory (Chantier 13)** en conservant le
référentiel de qualification `C0` (`concept`), `C1` (`contrat`), `C2`
(`persistant`), `C3` (`intégré localement`), `C4` (`qualifié`) et `C5`
(`longitudinal réel`).

Chaque exécution de scénario (`runScenarioQualification`) assemble un dossier
scellé comportant neuf sections obligatoires :

1. **Manifeste du commit, des modèles et de l'environnement**
   (`environmentManifest`).
2. **Description de la mission et du résultat attendu** (`missionSpec`).
3. **Liste des agents, de leurs rôles et de leurs permissions** (`agentRoster`).
4. **Événements, interactions et changements d'état** (`executionTrace`).
5. **Preuves brutes et leurs empreintes SHA-256** (`rawEvidenceVault`).
6. **Verdicts déterministes et indépendants** (`independentVerdicts`).
7. **Coûts, latences et consommations de ressources** (`resourceMetrics`).
8. **Replay et analyse des écarts** (`replayAndDriftAnalysis`).
9. **Résultat classé `reussite`, `echec` ou `indetermine`**
   (`finalClassification`) accompagné du niveau `C0`–`C5` atteint.

Le corpus de référence (`sqlabCorpus.js`) couvre les quatre familles exigées :
`simulated_attack`, `normal_activity`, `failing_sensor` et
`inconclusive_incident`.

## Validation

- `node backend/tests/test_security_qualification_lab.js` valide le référentiel
  `C0`–`C5`, les neuf sections du dossier, la détection de falsification des
  preuves brutes, l'analyse de dérive au replay et les quatre familles du
  corpus.
