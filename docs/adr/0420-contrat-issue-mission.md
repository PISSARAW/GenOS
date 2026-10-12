# ADR 0420 — Contrat explicite d'issue de mission

Statut : accepté pour le parcours `strategy_execution_runs` avec contrat explicite.

## Contexte

Une fin de transport ou une déclaration `verified` dans le payload ne démontre pas
que le but de la mission a été atteint. Les contrats de stratégie décrivaient les
gates de promotion, mais ne nommaient pas les obligations de preuve de la mission.

## Décision

Un contrat de stratégie peut désormais porter `mission_outcome` avec un but, des
obligations identifiées par leur énoncé canonique et quatre issues possibles :
`verified`, `rejected`, `inconclusive`, `abstained`. À la clôture, seules les
attestations indépendantes déjà validées par le gate natif peuvent satisfaire
ces obligations. L'issue est conservée dans les métriques du run. Sans toutes
les obligations vérifiées, le run est bloqué, même si le payload annonce un
succès. Une abstention ou un rejet déclaré ne produit jamais `verified`.
L'évaluateur recompte les reçus uniquement si leur signature est valide, si leur
vérificateur est approuvé, si le digest de preuve et les obligations couvertes
correspondent au résultat, et si deux nonces et deux identités de vérification
distincts le couvrent. L'identité utilise la stratégie exécutée, l'acteur
attesté ou, à défaut, le digest du vérificateur.

Le champ est facultatif pour les contrats existants. Les nouveaux appelants qui
veulent cette protection doivent fournir `missionOutcomeContract` lors de la
création du contrat de stratégie.
Un run historique sans ce contrat conserve son statut d'exécution ; ses métriques
portent `missionOutcome.status = unmeasured`. Ce cinquième état décrit l'absence
de mesure et ne fait pas partie des quatre verdicts d'un contrat explicite.

## Limites

Le gate natif actuel porte généralement un résultat canonique. Plusieurs
obligations ne sont satisfaites que si chacune apparaît dans l'assemblage
vérifié avec deux reçus indépendants ; sinon la clôture reste inconclusive.
Cette tranche ne crée ni oracle supplémentaire ni preuve pour une mission.
Elle ne qualifie pas les autres chemins de clôture hors
`strategy_execution_runs`.
