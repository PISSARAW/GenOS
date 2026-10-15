# ADR 0518 — Provenance signée des producteurs neuro-gliaux

- **Statut** : Accepté pour le CLI Rust expérimental
- **Date** : 2026-10-15
- **Domaine** : Neurobiologie logicielle, provenance, flux mission
- **Lié à** : ADR 0191, maturité biologique

## Contexte

Le flux `neuro-glia-stream` persistait des événements ordonnés, leurs réponses
gliales et des snapshots de population. Son CLI acceptait cependant un payload
local et un UUID de mission déclarés par l'appelant. Le digest de chaîne
détectait les modifications après écriture, mais ne prouvait pas l'identité de
la source qui avait produit le signal.

## Décision

Le CLI exige `GENOS_NEURO_GLIA_TRUST_JSON`, une configuration injectée par le
bootstrap de l'hôte sous le schéma `genos.neuro-glia-producer-trust/v1`. Elle
contient les couples `producer_id` et clé publique Ed25519. Les clés de
l'événement ou d'un argument contrôlé par son appelant ne sont jamais ajoutées
au registre de confiance. Le CLI requiert en outre `--producer-id` et
`--signature-hex`.

Le producteur signe les claims versionnés
`genos.neuro-glia-event-claims/v1`, liant mission, tick, producteur et SHA-256
d'un JSON compact qui couvre type d'événement, clé d'idempotence et payload.
Le runtime vérifie l'identité épinglée et la signature avant append. Les reçus
conservent producteur, digest et signature; le chemin CLI revalide chaque
événement contre le bootstrap courant avant de restaurer la population ou de
réutiliser une clé idempotente. Un flux historique sans preuve est refusé par
ce chemin authentifié.

Le quorum glial demeure un calcul logiciel local. Cette décision n'ajoute ni
transport distribué, ni consensus réseau, ni preuve de capteur biologique. La
configuration d'environnement n'est fiable que si l'hôte la contrôle; elle
n'atteste pas, à elle seule, l'identité du processus qui a fourni cette valeur.

## Conséquences

- Une source inconnue, un contenu modifié, une signature invalide ou une
  mission/tick différent ne peut être persisté ni rejoué par le CLI authentifié.
- Les événements restent idempotents et rejouables après redémarrage local.
- Le client doit calculer les claims canoniques et conserver sa clé privée.
- Les méthodes de bibliothèque historiques restent disponibles pour les tests
  et usages internes; elles ne constituent pas une frontière d'autorité CLI.

## Vérification

- `crates/genos-orchestrator/src/neuro_glia_authority.rs`
- `crates/genos-orchestrator/src/mission_neuro_glia_receipt.rs`
- `crates/genos-cli/tests/neuro_glia_stream_cli.rs`
