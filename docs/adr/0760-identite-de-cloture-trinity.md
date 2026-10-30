# ADR 0760 — Identité de clôture du sous-graphe Trinity

- Statut : accepté
- Date : 2026-10-30

## Contexte

Les workers Trinity sont liés à une mission de comparaison propre au run. La
barrière finale validait pourtant leurs reçus avec l'identifiant de la mission
racine. Les preuves valides étaient rejetées pour incompatibilité de portée.
Deux appels au gate de vérité utilisaient aussi des noms retirés après extraction
du module, au lieu du service importé.

## Décision

La clôture de comparaison porte l'identité Trinity scellée à la création des
mondes. Les appels de vérité utilisent explicitement le module du gate. Le
contrôle du binding et des reçus reste strict : aucun reçu d'une autre mission
n'est accepté par repli.

## Conséquences

La comparaison peut terminer et rester escaladée, sans promotion d'un monde.
Sa clôture n'est pas une clôture fictive de la mission racine. Le test GQWF vérifie
la portée enfant acceptée, la même preuve refusée sous l'identité racine, la
comparaison escaladée et l'absence de promotion après redémarrage.

## Alternatives

Supprimer le contrôle d'identité ou accepter toute preuve du même orchestrateur
élargirait l'autorité. Ces alternatives sont rejetées.
