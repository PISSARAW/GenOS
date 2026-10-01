# ADR 0230 — Journal biologique et population signée

## Contexte

Les chemins normaux de tick contournaient la persistance. L'identité cellulaire
était perdue au redémarrage et le journal entier était réexpédié.

## Décision

Un journal configuré explicitement (`GENOS_BIOLOGICAL_JOURNAL` ou méthode Rust)
borne tous les ticks : la persistance précède le retour et un échec de livraison
reste un échec après exécution. Le journal append-only conserve les acquittements
après acceptation HTTP. `flush_receipt_journal` permet la reprise sans nouveau tick.
Chaque reçu contient la population sérialisée après tick, incluse dans son HMAC.
Les cellules et génomes sont restaurables et reliés à la mission et au reçu.
Les opérations restent de portée organisme : la population est un contexte,
pas une attribution d'exécution cellulaire.

## Conséquences

Le backend conserve le registre signé en SQLite. Le journal est à écrivain
unique ; ce contrat ne fournit pas un store distribué. Les snapshots population
ne restaurent pas toute la physiologie, les tissus ni les effets externes.

## Alternatives

Rattacher arbitrairement le tick à la première cellule produirait une fausse
preuve. Rejouer tout le journal reste idempotent mais manque un suivi de livraison.
