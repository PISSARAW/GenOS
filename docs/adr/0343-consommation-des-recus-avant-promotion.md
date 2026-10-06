# ADR 0343 — Consommer les reçus avant les effets de promotion

- **Statut** : accepté.
- **Date** : 2026-10-06.

## Contexte

`approveRun` valide une assemblée AEIS, puis lance les primitives de promotion.
Le consommateur des politiques après promotion ne transmet pas les reçus à son
API de consommation des nonces. Le test du parcours réel observe donc une
absence de consommation durable avant le premier effet du pipeline.

## Décision

Après les gates de promotion et avant les primitives, consommer les reçus
indépendants de l'assemblée persistée dans une transaction SQLite. Relire et
vérifier le sceau de l'assemblée ; contrôler son run, son périmètre issu de la base,
son acceptation et le lien de chaque reçu à l'empreinte de son résultat.

Tous les nonces du lot sont réservés ensemble. Un rejeu, un reçu négatif ou non
lié, une erreur de stockage ou un état du run invalide interdit les effets aval.
Une erreur sur un reçu annule les insertions des précédents reçus du lot.

## Conséquences

Le même lot signé ne peut pas autoriser deux exécutions du pipeline. Les options
du demandeur ne remplacent pas l'assemblée persistée ni son périmètre authentifié.
Les validations sans affirmation ni reçu peuvent conserver un lot vide.

La transaction de nonces se termine avant le pipeline. Elle ne rend pas ses
effets externes atomiques et ne garantit pas une exécution exactement une fois
après crash. Un échec du pipeline conserve les nonces consommés : une nouvelle
vérification peut fournir un nouveau lot, avec évaluation des effets partiels.
La sérialisation de deux approbations concurrentes produisant deux lots frais
reste une obligation distincte. Une signature n'établit pas la vérité scientifique.

## Alternatives

- Transmettre seulement un reçu aux politiques après promotion : trop tard
  pour empêcher les primitives, et ne couvre pas le lot de l'assemblée.
- Faire confiance au lot fourni dans les options : ne protège pas le lien au run.
- Transaction couvrant tous les effets externes : impossible à garantir par SQLite.
