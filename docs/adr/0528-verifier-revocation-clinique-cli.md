# ADR 0528 — Vérifier la révocation clinique avant l'application Rust

- **Statut** : Accepté
- **Date** : 2026-10-15
- **Domaine** : Autorisation clinique, CLI Rust, registre backend
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0324 — Biologie, exécution et autorité durable

## Contexte

Une autorisation clinique signée et non expirée est vérifiée localement par le CLI
Rust. Une révocation inscrite dans le ledger backend ne peut donc pas invalider une
copie hors ligne avant son expiration. Le registre SQLite, scoped par organisation,
projet et mission, est l'autorité partagée entre les processus backend.

## Décision

Avant d'ouvrir le journal clinique, le CLI doit obtenir une confirmation en ligne
du backend. La requête est authentifiée et porte l'identifiant d'autorisation,
la mission, la cellule et la signature. Le backend vérifie l'identité immuable du
ledger, le tenant, la mission et l'absence de révocation. Toute configuration,
réponse ou connexion manquante fait échouer le CLI avant mutation.

L'URL de contrôle refuse les identifiants, query et fragment. HTTPS est requis
hors loopback; HTTP loopback est réservé à `NODE_ENV=test` et `development`.
Le test E2E emploie le vrai binaire `genos`, deux processus backend et un même
journal : le second processus révoque l'autorisation et le CLI refuse avant
d'en modifier les octets. L'absence d'URL et un backend inaccessible sont aussi
refusés avant mutation.

La validation en ligne constate l'état au point de contrôle. Elle ne confère pas
de capacité de traitement hors ligne et n'annule pas une opération déjà admise.
Le backend conserve son application dans une transaction SQLite afin de sérialiser
son application et les révocations concurrentes.

## Conséquences

### Positives

- Une révocation réalisée par un autre processus backend est visible au CLI.
- La vérification conserve les scopes tenant, mission et cellule.
- Un CLI déconnecté ou sans état de révocation est refusé avant d'ouvrir le journal.

### Négatives

- L'application clinique directe depuis le CLI nécessite un backend joignable et
  des variables d'environnement d'autorité tenant-scopées.
- Le contrôle direct du CLI est un point de linéarisation, pas un verrou distribué :
  une révocation concurrente après ce contrôle ne peut pas annuler une mutation déjà
  admise. L'application via l'API backend garde sa sérialisation transactionnelle.

## Alternatives

- Propager des listes de révocation répliquées aux appareils hors ligne : écarté,
  car leur fraîcheur ne peut pas être prouvée quand le réseau est coupé.
- Continuer à faire confiance au jeton signé jusqu'à expiration : écarté, car une
  révocation backend ne serait pas effective pour le CLI Rust.
