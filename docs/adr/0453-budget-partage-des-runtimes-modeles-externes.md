# ADR 0453 — Budget partagé des runtimes modèles externes

Statut : accepté pour les runtimes `caller_mcp` et `solar-direct`.

## Contexte

L'ADR 0451 transmet le scope de budget modèle au sous-processus et protège le
routage `local-codex-runtime`. Les deux autres exécutables sélectionnés par le
catalogue de harness appellent directement leur fournisseur : Sampling MCP pour
`caller_mcp`, API Nous pour `solar-direct`. Leur limite locale de jetons ne
réservait rien dans le budget persistant du parent. Deux enfants concurrents
pouvaient donc envoyer chacun une génération malgré un plafond commun.

## Décision

Lorsque `modelBudgetScopeJson` est présent, chacun de ces runtimes ouvre la base
partagée par `GENOS_DB_PATH` et vérifie le scope persisté, l'identité du parent
et les plafonds de l'enfant avant le premier appel. Chaque requête réserve, dans
`model_budget_reservations`, tous les jetons d'entrée estimés plus le maximum de
sortie demandé et le coût restant autorisé à cet enfant. Le maximum de sortie
est réduit si nécessaire avant l'envoi. Une réservation est créée avant chaque
appel au fournisseur, y compris après un tour d'outil.

Le reçu du fournisseur doit contenir séparément les jetons d'entrée, les jetons
de sortie et un coût numérique, éventuellement nul. La réservation est soldée
avec ces valeurs. En l'absence de reçu complet ou après une erreur d'appel, elle
reste `uncertain` et la mission échoue : la capacité potentiellement consommée
ne redevient pas disponible par supposition. Un dépassement mesuré est également
rejeté. L'absence de scope explicite conserve le comportement historique.

Le canal Sampling de l'hôte doit donc transmettre `usage` dans son résultat
pour qu'une mission `caller_mcp` à budget partagé aboutisse. La réservation du
coût maximal de l'enfant est conservatrice en l'absence de tarif fiable avant
l'appel. Elle peut réduire le parallélisme, mais prévient la concurrence au-delà
du plafond déclaré. Un tarif inconnu ne peut pas garantir que le fournisseur
respectera le plafond pendant l'appel; un dépassement constaté invalide le
résultat et demeure enregistré.

## Vérification

`backend/tests/test_external_subprocess_model_budget.js` lance deux véritables
sous-processus sur la même base SQLite : un seul atteint le fournisseur simulé
sous un plafond commun. Il vérifie aussi les scopes altérés, l'identité parent,
la base absente, le reçu manquant et le chemin sans scope. Le contrôle qualité
du dépôt doit rester sans nouvelle violation.
`backend/tests/test_caller_mcp_budget_runtime.js` exécute également le vrai
runtime `caller_mcp` avec un canal Sampling local et vérifie son règlement
persistant ainsi que le rejet avant appel d'un scope falsifié.
