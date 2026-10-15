# ADR 0529 — Authentifier les ponts métaboliques vers le CLI Rust

- **Statut** : Accepté pour le pont local backend/CLI
- **Date** : 2026-10-15
- **Domaine** : Autorité d'exécution, backend, CLI Rust
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0324 — Biologie, exécution et autorité durable

## Contexte

Les routes `metabolic-pool/consume` et `guard-flux/apply` vérifient le principal,
la permission et le tenant côté HTTP, puis invoquaient le CLI Rust avec
`--experimental`. Le CLI ne pouvait donc pas authentifier la provenance de la
demande, ni vérifier que sa mission, cellule et ses paramètres correspondaient au
scope autorisé par le backend.

## Décision

Le backend signe une capacité Ed25519 éphémère (30 secondes) pour chaque mutation.
La capacité lie l'organisation, le projet, la mission API et la mission Rust, la
cellule, le type et le détail de l'opération, sa quantité, le tick et la clé
d'idempotence. Le fichier est écrit sous `tenants/<organisation>/<projet>/` avec
des permissions limitées, passé au CLI par référence relative, puis supprimé.

Le CLI vérifie la clé publique épinglée dans `GENOS_CLI_AUTHORITY_TRUST_JSON`,
l'empreinte de la clé, la signature, la fenêtre de validité, le chemin tenant/projet
du fichier et la correspondance de tous les paramètres avant d'ouvrir le journal
de reçus. Une autorité ou configuration absente, altérée, expirée ou hors scope
refuse l'opération. Le chemin local `--experimental` reste disponible pour des
tests et expériences explicitement non authentifiés; les routes backend ne
l'utilisent plus.

## Conséquences

### Positives

- Le CLI Rust authentifie l'émetteur backend avant l'effet durable.
- La capacité ne peut pas être réutilisée pour une autre mission, cellule,
  opération, quantité, tick, clé d'idempotence ou scope tenant/projet.
- Les relectures exactes restent gouvernées par l'idempotence du journal Rust.

### Négatives

- L'exploitant doit protéger `GENOS_CLI_AUTHORITY_PRIVATE_KEY_PEM` et installer la
  clé publique correspondante dans `GENOS_CLI_AUTHORITY_TRUST_JSON` sur le backend
  et ses processus CLI.
- Cette preuve couvre le pont local backend/CLI et ne démontre ni rotation des
  clés en production, ni révocation distribuée immédiate, ni déploiement multi-hôte.
- Le chemin `--experimental` conserve une capacité locale sans principal signé;
  il n'est pas utilisé par les routes protégées.

## Preuve d'intégration

Commande exécutée avec succès (exit 0) :

```text
$env:CARGO_TARGET_DIR = 'D:\Temp\genos-maturity-target-20261015'
node backend/tests/test_metabolic_guard_rust_e2e.cjs
```

Le runner a utilisé le vrai binaire
`D:\Temp\genos-maturity-target-20261015\debug\genos.exe`. Il a démarré et fermé
son backend local et vérifié les parcours authentifiés `MetabolicPool` et
`Guard Flux`, les reçus persistés et leur rejeu sans doublon, le refus d'une
quantité excédant le pool, le refus d'un scope projet incorrect avant mutation,
et le refus par le CLI d'une capacité signée dont les paramètres ne correspondent
pas, sans changement du journal.

Cette preuve est limitée à un environnement local de test SQLite et à des clés
éphémères de test. Elle ne valide pas le provisioning ou la rotation des clés en
production, la révocation distribuée, ni le déploiement multi-hôte.

## Alternatives

- Continuer à s'appuyer uniquement sur l'autorisation HTTP puis envoyer
  `--experimental` : écarté, car le CLI ne vérifie pas l'autorité qui a franchi
  cette frontière.
- Partager un secret HMAC avec le processus enfant : écarté, car la vérification
  Ed25519 ne transmet pas la clé de signature au CLI.
