# ADR 0493 — Route backend du registre métabolique expérimental

- **Statut** : Accepté pour le parcours local expérimental
- **Date** : 2026-10-15
- **Domaine** : `MetabolicPool`, autorisation de mission, pont backend/Rust
- **Décideurs** : Mainteneur GenOS
- **Lié à** : ADR 0204, reçu biologique durable Rust/backend; ADR 0474, reçus biologiques et autorité d'homéostasie

## Contexte

Le registre `MetabolicPool` dispose d'une opération Rust durable appelée par le
CLI expérimental. Le backend ne contrôlait pas encore les appels de consommation
avec son périmètre tenant/projet, l'état courant de cellule et le tick de
mission.

## Décision

La route `POST /api/rust/metabolic-pool/consume` exige `experiment:run`, une
adhésion projet en écriture, une mission appartenant au périmètre demandé, une
cellule inscrite et un tick égal à l'état courant enregistré. Elle passe la clé
d'idempotence au CLI `metabolic-pool`, qui garde son opt-in `--experimental` et
son verrou/journal durables. La réponse conserve explicitement
`mission_authority: unverified_cli_claim`; l'autorisation HTTP ne transforme pas
le principal du CLI en identité hôte authentifiée.

## Conséquences

### Positives

- Les requêtes HTTP sans permission, hors projet ou périmées sont refusées
  avant l'appel du CLI.
- Un retry HTTP avec la même clé réutilise le reçu Rust.

### Négatives

- Le test HTTP mocke le processus CLI : il vérifie le contrôle d'accès et le
  passage de la clé, pas l'effet durable Rust bout en bout.
- Le registre reste une comptabilité logicielle de ressources; il ne mesure
  pas une énergie biologique ou physique.
- L'identité de mission vue par le CLI demeure une déclaration non authentifiée
  par l'hôte.

## Alternatives

- Laisser la route absente : rejeté, car le backend ne pouvait pas appliquer
  ses contrôles de tenant et d'état au registre.
- Déclarer le principal CLI authentifié à partir du seul contrôle HTTP : rejeté,
  car le CLI reçoit encore une identité de mission déclarée et non attestée.
