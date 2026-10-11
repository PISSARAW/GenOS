# ADR 0407 — Frontière de la morphogenèse après mission

- **Statut** : accepté
- **Date** : 2026-10-11
- **Domaine** : orchestrateur public, morphogenèse, autorité
- **Décideurs** : équipe GenOS

## Contexte

`genos-orchestrate` prépare une morphologie avant la mission et appelle le
runtime morphogénétique après le verdict. Le runtime V2 sait évaluer une
proposition et possède un mode `shadow`, mais son commit exige des adaptateurs
pour la décision du noyau Rust, la gouvernance et la transition durable.
L'orchestrateur public ne configure pas ces adaptateurs. Le noyau Rust dispose
de sa propre boucle morphogénétique, sans pont Node de production démontré
pour autoriser et committer ce plan post-mission.

## Décision

L'appel post-mission impose le mode `shadow`. Il refuse toute réponse qui
prétend `APPLIED`, `committed` ou `applied`, avant d'émettre de la télémétrie.
Le reçu public indique `POST_MISSION_COMMIT_UNAVAILABLE` et
`rust_kernel_governance_and_versioned_transition` comme autorité manquante.
Une mission terminée ne constitue pas un mandat de modifier la morphologie.

Le mode `shadow` peut qualifier une proposition lorsque ses services de lecture
sont disponibles ; en leur absence, le comportement reste une proposition.
Ni l'un ni l'autre ne crée de version de graphe, de snapshot de transition ou
de preuve de promotion.

L'[ADR 0412](0412-pont-rust-morphogenese-lecture-seule.md) ajoute une décision
Rust en lecture seule après mission. Elle ne franchit pas cette frontière de
commit.

## Conséquences

- Le parcours public ne peut pas déclencher un commit par une future
  configuration accidentelle du singleton Node.
- L'observabilité distingue la proposition de la transition appliquée et
  expose explicitement la frontière manquante.
- Pour activer le commit, un futur pont devra lier le plan exact à une décision
  Rust vérifiable, à la gouvernance, à un CAS de graphe et aux reçus de preuve.
  Cette ADR n'autorise pas à substituer des booléens locaux à ces contrôles.

## Alternatives

- Injecter des fonctions qui retournent `valid: true`, `allowed: true` et
  `committed: true` : rejeté, car cela simulerait l'autorité et la persistance.
- Laisser le mode `commit` implicite dans l'appel public : rejeté, car il
  permettrait à une configuration ultérieure de franchir cette frontière sans
  contrat de production vérifié.
