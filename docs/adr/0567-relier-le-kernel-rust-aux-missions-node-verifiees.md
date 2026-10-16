# ADR 0567 — Relier le kernel Rust aux missions Node vérifiées

- **Statut** : Accepté
- **Date** : 2026-10-16
- **Domaine** : noyau de contrôle, runtime Node, preuves durables

## Contexte

Le `ControlKernel` Rust planifiait et gouvernait ses transitions dans un état
mémoire. La CLI savait lancer `genos-orchestrate.cjs`, mais ce lancement ne
transportait pas le plan du kernel et le succès du processus suffisait à la
commande. Le rapport Rust restait donc `verified: false` : il ne prouvait ni la
création de workers Node ni la fermeture d'une mission réelle.

Le runtime Node persiste déjà les identités de mission, les workers, les runs,
les observations, les reçus biologiques et les transitions homéostatiques. Ces
preuves sont plus fortes que stdout, mais elles doivent être relues par une
frontière qui ne produit pas les affirmations de la mission.

## Décision

1. `genos run <mission>` exécute d'abord le `ControlKernel`, exige sa décision
   de gouvernance et transmet le `MorphogenesisPlan` au runtime Node avec un
   identifiant de mission généré par Rust. La CLI impose le même chemin SQLite
   au producteur Node et au lecteur Rust.
2. Le processus Rust lance le vrai point d'entrée
   `backend/bin/genos-orchestrate.cjs`. Un code de sortie nul n'est qu'une
   précondition et ne vérifie pas la mission.
3. Après la fin de Node, la CLI lance une seconde instance du binaire Rust en
   mode vérifieur. Cette instance ouvre SQLite en lecture seule et n'utilise pas
   le rapport stdout du runtime.
4. Node scelle le plan et les hashes de l'objectif dans
   `rust_kernel_mission_plans`. La ligne est immuable ; un même plan peut être
   lié à plusieurs missions, mais chaque mission ne peut en recevoir qu'un. Le
   hash porte sur le JSON exact émis par Rust, ce qui évite toute divergence de
   canonicalisation numérique entre Rust et JavaScript.
5. Le vérifieur exige une mission `completed`, au moins un worker Node effectif
   `completed`, un run et un reçu biologique par worker, des observations toutes
   appliquées, un budget satisfait et un résultat vérifié.
6. Il recalcule les hashes des reçus et vérifie que chaque reçu worker est lié
   à la dernière transition homéostatique autorisée et à son état durable
   `homeostasis_satisfied`.
7. `ControlKernel::mission_report()` reste non vérifié. Seule la méthode
   `verified_report()` accepte le type produit par ce vérifieur et remplace les
   identités prévues en mémoire par les identités workers réellement persistées.

## Conséquences

- La frontière Rust lance désormais une mission Node et ses workers au lieu de
  seulement simuler leur incarnation.
- Un succès de transport, un rapport de worker ou un stdout Node ne peut pas
  promouvoir le rapport du kernel.
- Toute preuve absente, altérée, non appliquée ou non liée à l'homéostasie
  bloque la vérification.
- La disponibilité d'un modèle ou fournisseur externe reste une condition
  d'exploitation ; elle n'est pas affirmée par les tests déterministes.
- `rusqlite` est ajouté au crate orchestrateur avec SQLite embarqué afin que la
  vérification ne dépende ni du client Node ni d'un exécutable `sqlite3` local.

## Validation

- Tests du lecteur indépendant sur une mission durable valide.
- Refus après altération du hash d'un reçu worker.
- Tests existants du cycle de contrôle et compilation de la CLI.

## Références

- [Noyau de contrôle morphogénétique](../02-orchestration/noyau-controle-morphogenetique.md)
- [ADR 0045 — Noyau de contrôle morphogénétique](0045-noyau-controle-morphogenetique.md)
- [ADR 0566 — Autorité Rust et snapshot durable](0566-autorite-rust-et-snapshot-durable-de-morphogenese.md)
