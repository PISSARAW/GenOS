# EPIC 4: Network Mesh & Swarm Consensus

Ce document détaille l'architecture réseau et la topologie d'essaim (Swarm) implémentées dans le cadre de l'**EPIC 4** de GenOS v2.0. Ces mécanismes permettent d'abandonner les systèmes asynchrones centralisés au profit d'une intelligence collective bio-inspirée.

## 1. Topologie Réseau et Grille Spatiale (Spatial Mesh)

La communication O(N²) classique via Pub/Sub est remplacée par la **Stigmergie Phéromonale**. 
Au lieu de s'envoyer des messages directs, les agents déposent et captent des traces (scalaires) sur une grille partagée, la `SpatialMesh`.

* **Mémoire Partagée** : Implémentée dans `crates/genos-protocol/src/mesh.rs` via `Arc<RwLock>`, elle garantit une scalabilité thread-safe.
* **Gradients et Évaporation** : La grille stocke des gradients de phéromones (ex: *Recrutement*, *Alarme*) par nœud (ID d'AST ou de fichier). Ces gradients sont sujets à diffusion (Loi de Fick via le dictionnaire d'adjacence `edges`) et à évaporation.
* **Topologie (Edges)** : L'adjacence réseau est gérée par les méthodes `add_edge` et `get_neighbors`, permettant de calculer la propagation des signaux chimiques de proche en proche (Anastomose).

## 2. Consensus de Brier (Brier Quorum)

La prise de décision distribuée s'appuie sur un système de vote pondéré : le **Consensus de Brier**.
Plutôt que d'utiliser une majorité simple, l'essaim privilégie les nœuds ayant historiquement fait preuve de fiabilité.

* **Distributed Huddle** : Le rassemblement des agents (`crates/genos-runtime/src/huddle.rs`) autour d'un sujet (topic).
* **Brier Score** : Le poids de chaque agent (`compute_agent_weight`) est inversement proportionnel à son erreur de calibration historique. Les agents précis ont plus de pouvoir décisionnel.
* **Agrégation des Votes** : L'implémentation `StandardBrierConsensus` multiplie la confiance déclarée par l'agent par son poids historique, et additionne les scores des hypothèses concourantes.

## 3. Croyances Typées et Prouvables (Verified Beliefs)

Pour protéger l'essaim contre les défaillances et les agents corrompus, chaque transfert d'information est vérifiable.

* **ExecutionReceipt** : Preuve cryptographique (`task_hash`, `signature`, `timestamp`) attestant de la provenance d'un calcul (`crates/genos-protocol/src/belief.rs`).
* **VerifiedBelief** : Structure encapsulant l'hypothèse (payload) et le reçu d'exécution, assurant la traçabilité des décisions prises par le swarm.
