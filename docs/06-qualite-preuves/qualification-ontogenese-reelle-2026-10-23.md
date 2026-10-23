# Qualification d'une exécution réelle Ontogenèse — 2026-10-23

## Verdict

Une mission exécutée par l'orchestrateur Ontogenèse réel a atteint `done`, puis
son changement a passé le vérificateur indépendant et l'intégration locale.
Cette preuve qualifie un parcours de bout en bout sur le dépôt de mission
isolé; elle ne qualifie pas toutes les classes de projets ni un déploiement.

## Mission observée

- Run : `onto_run_7ba12361-8cfe-4a2e-bcb1-66df2ee9262b`.
- Tâche : `task_9ba513ac-8fd5-4a4f-acfd-6415fa930d7b`.
- Commit de mission : `c43c1f862f644cf7127640c9fd3227eedd96c0d5`, branche
  `codex/live-ontogenesis-local` du dépôt de mission isolé.
- Résultat : tâche `done`, exécution `integrated`, tentative 8 marquée
  `attempt_succeeded` dans le registre.
- Changement candidat : implémentation de `sumPrices` dans `src/pricing.js`
  avec validation de l'entrée, des quantités et des prix.
- Vérification d'acceptation : `node verify.cjs` réussit.
- Preuve GVX : 561 événements et 255 chaînes vérifiés, aucune chaîne invalide;
  les MAC sont vérifiés. La preuve indépendante de la mission est présente.

Le commit candidat appartient au petit dépôt créé pour cette mission. Il n'est
pas un commit de code du dépôt GenOS. Les correctifs du runtime qui ont rendu
ce parcours possible sont, eux, présents dans l'historique de la branche V3.

## Correctifs V3 associés

Les commits suivants sont dans l'historique de `v3` avant cette qualification :

- `a4175ef68` lie les workers de reprise à l'espace de travail parent.
- `746abe18f` sélectionne un candidat de mission vérifié indépendamment.
- `79ac525df` lie la continuité à la mission Ontogenèse explicite.
- `67849da72` accepte les preuves d'exécution runtime vérifiées.
- `e28d67248` exclut les artefacts runtime scellés de l'intégration.
- `e8689c0d6` charge la clé HMAC locale du tool membrane pour les workers.
- `57093b948` marque les résultats Ontogenèse vérifiés dans l'homéostasie.
- `1db2cee6f` exclut la configuration runner des preuves source.
- `c4bdcd878` compare les fichiers capsule au baseline d'intégration.

La rotation locale du secret HMAC a été autorisée et configurée sans inscrire sa
valeur dans le dépôt ni dans ce rapport. Le runner reçoit le secret via
`GENOS_GVX_LEDGER_HMAC_SECRET`; les signatures du registre ont été contrôlées
avant l'exécution.

## Vérifications ciblées consignées

Les suites suivantes ont réussi après les correctifs :

```text
backend/tests/test_biological_receipt_bridge.js
backend/tests/test_db_local_ledger_secret.js
backend/tests/test_homeostasis_default_evidence.js
backend/tests/test_mission_completion_evidence_gate.js
backend/tests/test_ontogenesis_integration.js
backend/tests/test_ontogenesis_mission_verifier_receipt.js
backend/tests/test_ontogenesis_regressions.js
backend/tests/test_ontogenesis_worktree_generated_snapshots.js
```

## Portée et reprise

Le résultat démontre le chemin observé : sélection de tâche, exécution réelle,
production du commit, vérification indépendante, preuve signée et intégration.
Il ne démontre ni une réussite universelle des missions, ni la disponibilité
permanente du modèle local, ni le push ou la fusion automatiques. Les échecs
antérieurs restent consignés dans le registre de mission; le résultat positif
est une tentative distincte et ne les efface pas.

Pour exploiter le contrôleur et interpréter ses états, suivre le
[guide d'exploitation Ontogenèse](../04-exploitation/ontogenese.md). Les clés
HMAC doivent être provisionnées par le gestionnaire de secrets de l'hôte et
ne doivent jamais être copiées dans les journaux, la documentation ou Git.
