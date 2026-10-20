# ADR 0710 — Harnais transactionnel de restauration morphogénétique

- **Statut** : Accepté, qualification des topologies en attente
- **Date** : 2026-10-20
- **Domaine** : orchestration, morphogenèse, restauration, preuves
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0700, ADR 0702, ADR 0704

## Contexte

Les portes P1, P2 et P3 bornaient déjà l'admission d'une transition morphogénétique,
mais la restauration reposait encore sur une affirmation du port qui venait d'effectuer
l'opération. Le snapshot n'était pas lié à son état sérialisé, un second appel de
restauration n'en éprouvait pas l'idempotence et l'état restauré n'était pas relu par un
acteur indépendant. Une erreur sur ce chemin pouvait aussi empêcher la finalisation.

Une réussite de transport ou un reçu de restauration auto-déclaré ne suffit pas à
prouver le retour à l'état antérieur. Le harnais doit rendre ces lacunes visibles sans
qualifier implicitement les huit topologies du catalogue.

## Décision

Le cycle commun exécute `observe → quiesce → snapshot → adapt → verify → finalize`. Le
snapshot porte l'identité de son producteur, un état sérialisable et l'empreinte de cet
état. Le producteur et le vérificateur sont obligatoirement distincts.

Après toute erreur survenue une fois le snapshot armé, le cycle exécute deux fois
`restore`, compare les liaisons au même snapshot, puis demande au vérificateur indépendant
de relire l'état restauré. `finalize` est ensuite appelé, y compris si la restauration ou
sa vérification échoue. Une erreur après la quiescence mais avant l'armement du snapshot
déclenche aussi la finalisation, sans tenter une restauration sans base fiable.

Le harnais de qualification reçoit tous les ports par injection et passe par la porte P3
signée et révocable. Chaque exécution écrit le dossier commun
`genos.qualification-evidence-bundle/v1`, avec commande, reçu ou erreur et verdict
terminal. Le reçu comme le dossier restent `promotionEligible: false`.

## Conséquences

### Positives

- Un snapshot altéré ou incomplet est refusé avant adaptation.
- Une restauration non idempotente ou non liée au snapshot reste en
  `recovery_required`.
- Le verdict de restauration ne dépend plus du seul port producteur.
- Les expirations, révocations et dérives de bindings P3 laissent une preuve terminale.
- La finalisation devient observable sur les chemins heureux et dégradés.

### Négatives et limites

- La double restauration augmente le coût du chemin de compensation.
- L'indépendance est attestée par deux identités injectées ; l'isolation de processus et
  l'autorité de ces identités restent à qualifier par le déploiement.
- Le harnais valide le protocole sur une topologie synthétique. Il ne qualifie ni ne
  promeut Biocénose, Trinity, A-Team, Rhizome, Biome, Holobionte, Métapopulation ou
  Syncytium.
- L'annulation coopérative d'un port bloqué n'est pas introduite par cette tranche ; un
  timeout remonté par le port produit un verdict inconclusif et déclenche la compensation.

## Alternatives

### Faire confiance au champ `verified` du reçu de restauration

Rejeté : le producteur de l'effet deviendrait son propre oracle.

### Restaurer une seule fois

Rejeté : la stabilité au rejeu resterait une hypothèse non éprouvée.

### Qualifier directement les huit topologies

Rejeté : les ports synthétiques prouvent le protocole transversal, pas les invariants ni
les stores canoniques propres à chaque topologie.
