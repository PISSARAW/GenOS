# ADR 0451 — Portée de budget modèle dans le runtime local en sous-processus

- **Statut** : accepté pour le runtime `local-codex-runtime.cjs`
- **Date** : 2026-10-12
- **Domaine** : budget de mission et exécution déléguée
- **Complète** : [ADR 0447](0447-portee-budget-modele-parent-et-workers.md)

## Contexte

La portée `mission_model_budget_scopes` était vérifiée pour le worker local en
processus. Le runtime local lancé en sous-processus appelait aussi
`modelRouter`, mais recevait seulement un budget isolé dans l'enveloppe. Deux
processus pouvaient donc lancer des générations sans réservation commune.

## Décision

L'enveloppe protobuf transporte la copie de la portée persistée. Le superviseur
transmet le chemin de la base SQLite partagée par son environnement contrôlé ;
l'enveloppe ne contient pas ce chemin. Au moment d'une génération effective,
le runtime ouvre cette base en lecture et écriture, vérifie la copie contre
`mission_model_budget_scopes` et exige un plafond local explicite en coût et en
tokens. Il transmet au `modelRouter` la connexion, l'identité du scope commun,
ses plafonds et l'identité de la mission. Le routeur réserve avant l'appel au
fournisseur, puis règle ou conserve la réservation selon son reçu.

Une portée absente ou altérée, un plafond local absent ou supérieur à celui du
parent, ainsi qu'une base partagée inaccessible, bloquent la génération avant
l'appel au fournisseur. La branche déterministe qui ne sollicite aucun modèle
ne doit pas ouvrir cette base.

## Vérification

`node backend/tests/test_subprocess_model_budget_route.js` transmet des
enveloppes protobuf à deux vrais processus enfants sur la même base SQLite.
Une seule génération atteint le fournisseur sous un plafond unique. Le test
vérifie aussi les refus pour portée absente ou altérée, identité parent fausse,
budget local absent et base introuvable.

## Limites

Le chemin `caller_mcp`, `solar-direct` et les autres consommateurs de modèles
ne sont pas couverts par cet adaptateur. Une estimation de coût ou de tokens
avant appel ne garantit pas que le fournisseur respecte le devis ; les reçus
tardifs et les dépassements relèvent du registre de réservations.
