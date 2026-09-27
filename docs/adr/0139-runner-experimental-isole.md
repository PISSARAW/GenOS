# ADR 0139 — Runner expérimental isolé

## Statut

Accepté.

## Décision

Le runner du lot 04 réutilise `arenaService.runTournament` pour exécuter un
bras contrôle et un bras intervention sur chaque seed. Les options sont
reconstruites par exécution, les résultats sont conservés séparément et aucun
état partagé n’est déclaré entre les bras. Le budget borne le nombre total
d’exécutions et le nombre de rounds.

Chaque exécution exige un leaderboard non vide. Le runner calcule un taux
d’accord des signatures de résultats, conserve les seeds et budgets consommés,
puis produit un `CausalInterventionReceipt` réutilisable par la persistance du
lot 03. Un verdict `supported` exige un effet positif et un accord d’au moins
50 % ; sinon le résultat reste `inconclusive`.
