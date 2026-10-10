# ADR 0367 — Sections durables des snapshots d'organisme

Statut : accepté
Date : 2026-10-10
Domaine : snapshots, persistance, orchestrateur
Décideurs : équipe GenOS
Lié à : [ADR 0366](0366-manifeste-snapshot-organisme.md)

## Contexte

Le manifeste initial vérifiait l'état de la ligne `agents` et du workspace,
mais déclarait explicitement l'absence du runtime, du contexte LLM, des
mémoires et relations et du checkpoint de l'orchestrateur. Une restauration
globale annoncée sur cette base aurait été trompeuse.

## Décision

- Versionner le bundle d'agent à 4 et son manifeste à 3. Son empreinte inclut
  l'identité de l'agent, le workspace, les sections SQLite et les références
  immuables des checkpoints Rust.
- Capturer les données durables de l'agent dans une transaction SQLite après
  le snapshot vérifié du workspace. Refuser un processus supervisé actif, un
  appel LLM en attente, une relation hors tenant et une charge supérieure à
  16 Mio.
- Journaliser les appels du routeur LLM Node avant l'inférence et à sa fin.
  Seuls la requête et le résultat visibles de ce routeur sont enregistrés.
- Sauver les checkpoints Rust sous des noms contenant la séquence WAL et le
  SHA-256, tout en conservant le fichier historique pour compatibilité. Une
  erreur de sérialisation du runtime Rust empêche désormais la capture.
- Vérifier les références Rust avant restauration. Créer un snapshot de sécurité
  des fichiers et de SQLite ; restaurer les données persistées dans une
  transaction. Un processus doit être relancé explicitement et les checkpoints
  de missions Rust ne sont pas repositionnés par l'API d'agent.

## Conséquences

### Positives

- Les composants durables ont une identité et une empreinte vérifiables.
- Les captures incohérentes connues échouent au lieu d'être annoncées comme
  complètes.
- Une restauration réussie conserve un point de retour de l'état précédent.

### Négatives

- Le contenu LLM visible peut contenir des données sensibles dans SQLite ; les
  politiques d'accès et de rétention de cette base s'appliquent à ce journal.
- La restauration de fichiers et la transaction SQLite restent deux phases ;
  un arrêt entre les deux nécessite une réconciliation opérationnelle.
- Les relations et synapses partagées peuvent concerner d'autres agents du même
  tenant. La restauration d'un agent n'est donc pas un rollback global de mission.
- Les ressources mémoire, appels externes et contextes cachés des fournisseurs
  LLM ne sont pas repris.

## Alternatives

- Sérialiser la RAM du processus : rejeté car les handles et fournisseurs
  externes ne disposent pas d'un contrat de reprise vérifiable.
- Déclarer le checkpoint Rust restauré lors du rollback de l'agent : rejeté
  car une mission peut être partagée et dispose de son propre cycle de vie.
