# ADR 0006 — Active Global Organism Workspace (AGOW)

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : Runtime cognitif, orchestration
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : [épistémologie et preuves](../01-concepts/epistemologie-et-evidence.md)

## Contexte

GenOS possède plusieurs composants liés au workspace : le service Node
`globalWorkspaceService`, l'attachement au runtime de mission, et un prototype Rust
dans l'orchestrateur. Les signaux, l'ignition, la perception, l'attention et les
modèles du monde existent également, mais ne forment pas encore un circuit runtime
unique et récurrent. Une livraison réussie ou une déclaration textuelle ne constitue
pas une preuve d'effet causal.

## Décision

AGOW est le circuit cognitif central exécuté côté Node. Un agent possède un état
logique unique, représenté par des frames successifs. Les organes produisent des
candidats référencés via le Signal Plane; le pool valide, déduplique et expire ces
candidats; l'arbitrage respecte les contraintes dures avant la compétition; puis un
frame borné devient disponible aux récepteurs spécialisés. Les effets sont enregistrés
séparément de la livraison. Les requêtes actives doivent revenir comme candidats dans
un cycle ultérieur.

`globalWorkspaceService` devient progressivement une façade de compatibilité. Le
runtime de mission ne crée pas une seconde autorité. `crates/genos-orchestrator` reste
un prototype de conformance tant qu'une migration explicite n'a pas transféré
l'autorité. AGOW réutilise Signal Plane, ignition et `idleTickService`; il n'introduit
pas de scheduler autonome.

Le mode de déploiement initial est `off` par défaut. Les modes `shadow`, `advisory`,
`bounded`, `morphogenesis-shadow`, `live` et `experimental` ne peuvent être activés
qu'avec les garanties et les preuves adaptées. Aucun score fourni par un producteur
ne peut remplacer les mesures et preuves validées par AGOW. Morphogenesis reçoit des
besoins cognitifs et conserve sa propre gouvernance, ses budgets et ses transitions.

## Conséquences

- Les contrats partagés et les reçus rendent les transitions inspectables.
- Le workspace reste borné, tandis que le pool préconscient peut contenir plusieurs
  candidats.
- Les broadcasts attestent séparément la disponibilité, la consommation et les
  changements d'état.
- Les affirmations d'implémentation ne font pas passer un indicateur à un niveau
  expérimental sans réplication et ablation observables.
- Les migrations se font par étapes, avec commits indépendants et compatibilité
  transitoire.
- Le pool, les frames, les reçus, les politiques et les crédits sont persistés dans
  `adaptive_state` et isolés par agent.
- Les récepteurs intégrés sont enregistrés au premier broadcast. Le runner
  expérimental émet des résultats descriptifs sans décision de promotion.

## Déploiement

Les étapes runtime branchent le cycle, le broadcast, les requêtes déclenchées sur
lacune informationnelle et les organes disponibles. Le runner expérimental exige un
snapshot, un manifeste et des corpus holdout fournis par l'appelant; il ne crée pas de
corpus indépendant et n'établit pas à lui seul une réplication. Le mode `live` reste
conditionné à des reçus causaux et des campagnes réellement exécutées.
