# Phase 0.2 — Controles rejoues (plan de cablage)

Date : 2026-09-28. Checkout : `5dba6545` sur `v3`
(parent reel `83245807`, pas `c43c524d` : un auteur concurrent
a ajoute 3 commits entre la mesure et le commit baseline ;
la fiche Phase 0.1 reste valable, l'attribution du parent est
corrigee ici).

## Commandes et sorties

- `python scripts/ci/check_code_quality.py` :
  **3814 sources, 377 violations (157 nouvelles)**. Gate global rouge.
  Dette preexistante, augmentee par l'arbre de travail non committe.
  `git commit` sur doc seule : gate staged vert (0 fichier source).
- `npm --prefix backend test` (`node tests/test_backend.js`) :
  **55 reussites, 0 echec**. Reproductible sur cet arbre.
- `npm --prefix backend run test:security` :
  **4/4 suites, SYSTEM PROVEN INVULNERABLE**. Vert.
- `npm --prefix backend run test:grpc` :
  **41/41 microservices Ping OK**. `AgentService.StopMission` OK,
  `DispatchWorker` OK, `McpService.ListTools` OK (0 outils enregistres).
  Aucun cas `AgentService.StartMission` dans la suite : l'echeance
  signalee est une absence de couverture, pas un echec execute.
- `cargo test -p genos-orchestrator --test drives boucle_autonome_sans_but_externe` :
  **1 passed**. Le cas precedemment bloquant passe desormais.
- `node scripts/ci/audit_service_reachability.js --json` :
  total **1820**, atteignables **1313**, non atteignables **507**,
  sans import litteral **310** (fichier `reach.txt` en tmp, BOM UTF-8).

## Interdictions

Un controle interrompu ne compte pas comme reussi.
Aucune campagne de performance ni promotion de capacite n'est
autorisee sur une baseline non reproductible (qualite globale rouge,
derive +1 service a expliquer en Phase 1).
