# Critique falsifiable d'une stratégie morphogénétique

- **Statut** : Implémenté (service autonome, intégration orchestrateur à effectuer)
- **Portée** : Contrat de critique, détection de consensus corrélé et défi borné par budget.
- **Dernière revue** : 2026-10-15

## Rôle

`backend/src/services/morphogenesis/strategyCritiqueService.js` compare une hypothèse
de stratégie courante à une alternative falsifiable. Le service empêche des rapports
qui partagent une source, une lignée ou une référence de preuve de compter comme des
confirmations indépendantes. En cas d'incertitude, il n'autorise qu'un défi et réserve
son coût dans le budget fourni.

## Contrat d'appel

Appeler `critiqueStrategy(input)` avec `currentStrategy` et `alternative`, chacun
muni d'un `id`, d'une `hypothesis` et d'un `falsifier`. Les rapports peuvent fournir
`id`, `sourceId`, `lineageId`, `evidenceRefs` et un résultat (`supports_current`,
`supports_alternative` ou `inconclusive`). Le budget exige `tokens`,
`challengeCostTokens` et `maxChallenges`.

Une observation indépendante ne peut résoudre la critique que si elle fournit un
identifiant de source, de preuve et d'observation distincts, une base d'indépendance
(`direct_measurement`, `independent_tool` ou `replay`), `verified: true` et un
`verifierReceiptId`. Le reçu doit être produit par le vérificateur appelant; ce service
vérifie la forme et les conflits de provenance, pas l'authenticité du reçu.

## Résultats et limites

Les états sont `challenge_authorized`, `challenge_budget_exhausted`,
`resolved_current`, `resolved_alternative` et `invalid_critique_contract`.
Une résolution fournit un `resolutionReceipt`, mais `promotionAuthorized` reste
toujours faux : l'orchestrateur garde ses propres portes de preuve et de promotion.
Le service ne lance pas de worker et ne constitue pas encore une boucle d'auto-critique
continue. Le test autonome est `node backend/tests/test_morphogenesis_strategy_critique.js`.
