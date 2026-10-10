# Diagnostic : qualifier l'attention des 19 types de workers

## État constaté le 10 octobre 2026

Une campagne native exécutée depuis le commit `c36f6c0f7fd264b5788888d6d2fe7779c0188bad` a créé les 19 types de workers en espaces isolés. Dix-huit ont émis un `EVIDENCE_REPORT` dont l'artefact passe `validateWorkerArtifact`. Le `sub_orchestrator` a créé un child `bounded_worker` ; le child a calculé la somme demandée et émis un artefact valide, mais son exécution est restée `blocked`. Le parent s'est arrêté avec `WORKER_CHILD_FAILED`. Le scorer de la campagne a passé 13/13 assertions, dont huit épreuves structurées avec distracteurs. Les reçus détaillés sont conservés localement dans le dossier de sortie du banc `benchmarks/attention-workers/` et ne sont pas commités.

Les 18 exécutions dotées d'artefacts sont `blocked` par la règle `require_independent_verification`. Le contrat demande un reçu signé d'un vérificateur indépendant avec un digest de confiance et un nonce non réutilisé ; `strategyPromotionPolicyService` valide ces éléments. Supprimer la règle rendrait le score artificiellement vert. L'artefact natif et le reçu du solveur ne remplacent pas ce contrôle.

Le comportement de sélection reste limité : `globalWorkspaceService.admit` classe par `salience`, puis `diffuse` ne transmet qu'un gagnant. Un essai avec une source hors sujet plus saillante a sélectionné cette source ; deux faits complémentaires admis n'ont pas été transmis ensemble par cette API directe. `modelControlledAttentionService` peut réallouer selon un état déclaré, mais les essais présents ne démontrent pas que l'objectif et les erreurs observées mettent correctement cet état à jour. Le worker créatif natif choisit la première combinaison et signale lui-même que qualité et nouveauté ne sont pas vérifiées. Plusieurs autres fixtures n'offrent aucun distracteur ou choix concurrent.

## Critère de réussite complète

La propriété « sélectionner et intégrer les informations pertinentes » ne sera qualifiée pour **chaque type** que si les conditions suivantes sont toutes satisfaites :

1. Le worker est créé dans un workspace lié à son parent, exécute la mission, laisse un reçu exploitable et termine selon son contrat. Pour les workers natifs, les sorties déterministes restent admissibles, mais leur portée est déclarée.
2. Une épreuve propre au rôle contient au moins un distracteur plausible et au moins deux informations nécessaires à la réponse ou à l'action. La réponse attendue est conservée hors du prompt. Un échange de l'ordre des candidats et un changement du but doivent changer le résultat quand ils changent la pertinence, et le préserver sinon.
3. Les mêmes cas sont exécutés avec le mécanisme d'attention activé et ablaté, à budget et entrée constants. On mesure les faits sélectionnés, les faits omis, les distractions retenues, la réponse finale, les tokens, le temps et les coûts. Le bénéfice doit être observable au-delà d'une simple conformité au format d'artefact.
4. Un vérificateur indépendant rejoue les assertions sur les données et produit un reçu reconnu par le registre de confiance. Le contrôle de promotion accepte ce reçu sans affaiblissement de `require_independent_verification`. Le child du sous orchestrateur et le parent doivent ensuite terminer avec des preuves distinctes.
5. Le protocole, les graines, le commit, les identités des modèles, les erreurs et tous les essais sont conservés. Au moins trois répétitions sur des corpus disjoints sont nécessaires avant une revendication de robustesse. Les échecs et expirations comptent dans le dénominateur.

## Travaux à mener, dans l'ordre

| Étape | Changement concret | Test d'acceptation |
| --- | --- | --- |
| 1. Fiabiliser l'exécution | Résoudre le désaccord d'identité de workspace observé avec `genos_orchestrate` depuis MCP, et créer le dossier de snapshots avant la télémétrie. Conserver le bail et les limites du sandbox. | Une mission de lecture seule crée son worker, son workspace et un reçu sans erreur de binding ni `ENOENT`. |
| 2. Rendre la vérification indépendante effective | Exécuter un vrai vérificateur distinct après l'artefact natif ; lier le reçu au résultat, au digest des preuves, au registre de confiance et à un nonce unique. Propager la complétion vérifiée au child puis au sous orchestrateur. | Les 19 types finissent avec une décision vérifiée ; un reçu forgé, non fiable ou rejoué est toujours rejeté. |
| 3. Mesurer la pertinence du but | Ajouter à chacune des 19 fixtures un but explicite, des sources utiles et des distracteurs comparables. Pour les rôles où la méthode ne choisit rien, introduire une tâche de sélection propre au rôle sans élargir son autorité. | Chaque type réussit un test où changer le but modifie la sélection attendue et où permuter l'ordre seul ne la modifie pas. |
| 4. Relier sélection et intégration | Évaluer l'usage de `goalRelevance` dans l'arbitrage, la liaison de faits complémentaires dans le workspace et la diffusion aux consommateurs autorisés. Mesurer aussi les requêtes successives pilotées par l'état. | Les cas saillance trompeuse et deux faits complémentaires réussissent ; l'ablation réduit la réponse correcte dans les conditions prévues. |
| 5. Répliquer et qualifier | Geler les cas et réponses, rejouer avec trois graines disjointes et un contrôle sans attention, puis publier les taux par type et les coûts. | Aucune catégorie « non probante » ne subsiste ; tous les reçus et limites sont vérifiables indépendamment. |

Cette progression correspond aux épreuves GWT-2, GWT-3, GWT-4 et AST-1 proposées dans `plan-validation-indicateurs.md`. Un passage de tests de contrat ou une sortie de transport réussie ne suffit pas à promouvoir la propriété cognitive.
