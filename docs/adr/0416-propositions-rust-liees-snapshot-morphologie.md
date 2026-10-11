# ADR 0416 — Propositions Rust liées au snapshot de morphologie

- **Statut** : accepté
- **Date** : 2026-10-11
- **Domaine** : morphogenèse après mission, persistance, noyau Rust

## Contexte

Le premier pont Rust post-mission (ADR 0412) appelait le planner avec une liste
vide. Son `NO_CHANGE` était réel, mais ne pouvait jamais refléter une
proposition issue du résultat de mission. Le parcours public prépare une
morphologie en mémoire sans graphe durable avant l'exécution.

## Décision

Avant la mission, `genos-orchestrate` enregistre un graphe `proposed` dans
`morphology_graph_versions` pour la topologie, le variant et les rôles préparés.
Il retient l'identifiant de mission, l'identifiant et la version du graphe,
ainsi que le SHA-256 du JSON effectivement stocké. Une erreur de persistance
est visible en télémétrie ; elle ne se transforme pas en snapshot supposé.

Après la mission, seul le verdict `unverified` devient un signal
`evidence_gap`. Le resolver Rust `EpistemicResolver` produit alors une
proposition `spawn_verifier` avec son gain et son coût propres. Les autres
verdicts donnent `none` : un échec générique n'est pas un diagnostic causal de
topologie. Le résultat du resolver est enregistré dans
`morphogenesis_read_only_proposals` avec la mission, le graphe, sa version,
le hash du snapshot, le verdict et un hash de l'enregistrement. L'adjudication
relit cet enregistrement et le graphe, vérifie le hash, la version courante,
la topologie et le variant, puis transmet les propositions persistées au
planner Rust. Un lien absent, périmé ou discordant retourne `UNAVAILABLE`.

Le pont reste consultatif. Une proposition significative passe par la
`GovernancePlane` Rust sous l'identité fixe `post_mission_read_only` et est
refusée. Aucun `APPLY`, commit CAS ou reçu de transition n'est créé.

## Limites et suites

Le graphe stocké est le **candidat préparé**, pas un snapshot de restauration
du workspace ou de l'état collectif. Le SHA-256 vérifie la cohérence des
enregistrements lus ; il n'authentifie pas le contenu contre un acteur capable
de modifier simultanément les données et leurs hashes. Le signal
`unverified` n'établit pas la cause profonde d'un échec. Les gains et coûts
du resolver sont des estimations du noyau, pas une mesure contrefactuelle.

Un commit futur exige toujours une autorité authentifiée, un snapshot de
transition restaurable, la preuve liant la proposition exacte au plan Rust,
et un CAS qui vérifie cette preuve avant toute mutation. Ce chemin ne fournit
aucun de ces droits.
