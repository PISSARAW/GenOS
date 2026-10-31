# ADR 0763 — Autorité de preuve d'exécution hôte et quadrants épistémiques (Q1-Q5)

## Contexte

Dans le runtime agentique de GenOS, un worker émet un payload JSON contenant des claims et un rapport d'artefacts. Auparavant, la détection des preuves de tests (`authenticTestRefs`) calculait le digest cryptographique directement sur le contenu textuel `content.tests` émis par le modèle lui-même. 

Cette implémentation permettait à un worker adversarial ou complaisant (Quadrant 5 — Le Faussaire) de s'auto-certifier : en injectant un faux objet `tests: [{ command: "npm test", exitCode: 0 }]` dans sa réponse JSON, le worker générait un digest `genos://code-test/<digest>` accepté comme preuve authentique par la porte de promotion sans qu'aucune exécution réelle n'ait eu lieu sur l'hôte.

De même, l'analyse des menteurs polis (Quadrant 3) a révélé que les assertions de succès de code (« Le bug est corrigé et tous les tests passent ») pouvaient contourner les portes si les variations lexicales et de synonymes (en français et anglais) n'étaient pas rigoureusement interceptées tout en protégeant les cas d'abstention ou d'échec honnêtes (0 faux positif).

## Décision

1. **Déplacement de l'autorité d'attestation (*Le producteur n'est pas un oracle*)** :
   - L'authenticité des tests n'est plus calculée à partir du texte produit par le modèle, mais exclusivement à partir des témoins d'exécution enregistrés par l'hôte d'exécution (`provenance.executedTests`).
   - Un test n'est valide que si `testIsWitnessed(test, witnessed, allowed)` confirme que l'hôte a réellement exécuté la commande avec succès (`exitCode === 0`) ou qu'elle figure dans `provenance.allowedEvidenceRefs`.
   - Si l'hôte n'a exécuté aucun test, tout objet `tests` injecté dans la réponse du modèle est rejeté ou nettoyé par le runtime (`augmentReplyWithProofs`).
   - Tout claim de succès de code non étayé par une preuve matérielle réelle est rejeté fail-closed avec l'anomalie `dossier.code_fix.unsubstantiated`.

2. **Benchmark épistémique et intégration qualité** :
   - Création de `backend/src/services/agents/workerArtifactCodeProof.js` isolant la logique de vérification sous les limites de complexité ($\le 10$) et de taille ($\le 400$ lignes).
   - Déploiement d'un banc de test de 25 cas dans `backend/tests/test_polite_liars_benchmark.js` couvrant les menteurs polis (Q3), les faussaires (Q5) et les cas honnêtes/abstentions (Q1-Q4).
   - Intégration systématique dans la suite de qualité [run_quality_suite.js](../../backend/tests/run_quality_suite.js).

3. **Réconciliation comptable des tokens (Acte 2)** :
   - Correction de l'apurement des courses dans `settleExecutionRun` et `recordLedgerTokens` garantissant la cohérence stricte des tokens mesurés entre tables croisées SQLite sans échec silencieux.

## Conséquences et alternatives

- L'autorité n'appartient jamais à celui qui affirme. Le modèle ne peut plus fabriquer sa propre preuve de test.
- Taux de détection : 10/10 menteurs polis interceptés, 5/5 faussaires interceptés, 10/10 cas honnêtes préservés (0 faux positif).
- Horizon identifié : le Quadrant 6 (Le Sophiste), où le worker demande à l'hôte d'exécuter une commande triviale (`echo ok`, `true`) pour générer un témoin valide sans tester le claim. La résolution relève du tiers vérificateur AEIS (oracle indépendant avec batterie de tests non modifiables par le worker).

Validation : `node backend/tests/test_polite_liars_benchmark.js` (25/25 PASS) et `npm --prefix backend run test:quality` (14/14 suites PASS).
