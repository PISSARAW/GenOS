# ADR 0517 — Lier les reçus métaboliques aux identités de commande

- **Statut** : Accepté
- **Date** : 2026-10-15
- **Domaine** : Cellules biologiques, reçus durables, pont backend/Rust
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : [ADR 0514 — Route backend pour la cellule de garde expérimentale](0514-route-backend-cellule-de-garde-experimentale.md)

## Contexte

Les routes HTTP vérifient la mission, la cellule inscrite et le tick courant avant
d’appeler le CLI Rust. Guard Flux n’acheminait toutefois pas l’identifiant de cellule
validé ; le runtime débitait alors la cellule racine. Les contrôleurs acceptaient aussi
des reçus expérimentaux sans comparer tous leurs champs à la requête. Une clé
d’idempotence réutilisée avec une autre cellule ou opération pouvait donc produire une
réponse HTTP qui semblait confirmer une action différente.

Le reçu métabolique durable contenait l’opération mesurée, mais sa clé et son tick
restaient uniquement dans l’enveloppe du journal. Le pont backend avait besoin de ces
identités directement dans le reçu afin de contrôler chaque champ retourné.

## Décision

Guard Flux transporte `cell_id` jusqu’au runtime Rust, débite cette cellule et lie le
rejeu durable à la même cellule. Le contrôleur exige que le reçu corresponde à la
mission Rust, la cellule, la clé d’idempotence, le tick et le flux demandé.

Les reçus métaboliques durables portent aussi la clé d’idempotence et le tick. Le
contrôleur recoupe ces valeurs avec l’identité de commande, la mission, la cellule,
l’opération et la quantité. Les reçus produits par le chemin non durable omettent ces
deux champs. Au rejeu d’un ancien reçu durable, le runtime récupère la clé et le tick
depuis l’enveloppe historique après avoir vérifié ces valeurs, puis les expose dans le
reçu retourné.

## Conséquences

### Positives

- Les réponses HTTP lient l’autorisation, la cellule effectivement débitée et le reçu.
- Le rejeu exact reste idempotent et un reçu portant une autre identité est refusé.
- Les anciens journaux gardent leur compatibilité de rejeu grâce à leur enveloppe
  durable existante.

### Négatives

- Le format sérialisé du reçu métabolique ajoute deux champs facultatifs ; les chemins
  non durables ne peuvent pas prétendre fournir une identité idempotente.
- Le parcours CLI reste explicitement expérimental et n’établit pas une autorité
  authentifiée du runtime.

## Alternatives

- Déduire silencieusement la cellule racine dans le pont HTTP : rejeté, car cela rend
  possible un débit sur une autre cellule que celle validée.
- Faire confiance au seul code de sortie du CLI ou à une réponse `success` : rejeté,
  car le transport ne prouve ni la correspondance de la requête ni l’identité du reçu.
- Supprimer le rejeu des reçus historiques : rejeté, car leur enveloppe journalisée
  porte déjà la clé et le tick nécessaires pour les reconstituer sans ambiguïté.
