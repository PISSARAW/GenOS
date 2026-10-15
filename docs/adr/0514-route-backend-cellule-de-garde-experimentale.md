# ADR 0514 — Route backend pour la cellule de garde expérimentale

- **Statut** : Accepté pour le parcours local expérimental
- **Date** : 2026-10-15
- **Domaine** : Cellule de garde, backpressure et pont backend/Rust
- **Décideurs** : Mainteneur GenOS
- **Lié à** : ADR 0204, reçus biologiques durables Rust/backend; ADR 0493, route du registre métabolique

## Contexte

`genos guard-flux` restaure et modifie un état de mission durable sous verrou,
mais le backend ne vérifiait pas l'autorisation projet, la propriété de mission
ou l'inscription de cellule avant de lancer cette commande.

## Décision

`POST /api/rust/guard-flux/apply` exige `experiment:run`, une portée de projet
en écriture, une mission appartenant au tenant, une cellule du registre courant,
un tick égal au tick de cette cellule et au dernier tick de mission, ainsi
qu'une clé d'idempotence stable. Le backend transmet la clé au CLI et conserve
son opt-in `--experimental`. La réponse n'est acceptée que si le CLI annonce
`execution_mode: experimental`, un reçu et
`mission_authority: unverified_cli_claim`.

## Conséquences

### Positives

- Les requêtes non authentifiées, hors périmètre, sans cellule inscrite ou avec
  un tick périmé sont refusées avant l'exécution du CLI.
- Un rejeu conserve la même clé et permet au journal Rust durable de restituer
  le reçu idempotent.

### Négatives

- Le test HTTP simule le processus CLI; il couvre le contrôle d'accès et le
  contrat de transport, pas la persistance Rust de bout en bout.
- L'autorité du CLI reste une déclaration non authentifiée; cette route ne
  prouve pas de confiance hôte, d'ATP physique ou de biologie réelle.

## Alternatives

- Exposer le CLI sans contrôle tenant : rejeté, car cela contournerait les
  permissions et le cycle courant du projet.
- Traiter l'autorisation HTTP comme une identité hôte du CLI : rejeté, car le
  processus reçoit encore une mission déclarée par l'appelant.
