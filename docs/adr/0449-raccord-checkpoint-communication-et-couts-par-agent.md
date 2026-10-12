# ADR 0449 — Raccord du checkpoint de communication et coûts par agent

- **Statut** : Accepté pour le canal `SIGNAL` des checkpoints ; économies globales à mesurer.
- **Date** : 2026-10-12.
- **Domaine** : Communication d'équipe, grounding et comptabilité des tokens.
- **Lié à** : [ADR 0432](0432-execution-explicite-des-cycles-de-communication.md).

## Contexte

Le pilote `liveCycleExecution` publiait et distinguait accusés de transport,
grounding et reçus fournisseur, mais le checkpoint effectivement invoqué par
`genos-orchestrate.cjs` publiait ses signaux par un autre chemin. Sa sortie ne
rapportait que la publication, sans vérifier le grounding ni ventiler les coûts.

## Décision

Le canal `SIGNAL` de `communicationCheckpointService` appelle maintenant
`executeLiveCycle`. L'intention conserve les références sémantiques et
l'artefact du checkpoint. Le transport natif reste le transport par défaut ;
un adaptateur explicite peut être passé dans `communication` pour une
intégration contrôlée. Les autres canaux conservent leur exécution existante.

Les reçus fournisseur d'un cycle peuvent identifier l'agent participant et
la phase `generation` ou `control`. Le service refuse un agent extérieur aux
participants, une phase inconnue, un identifiant de réponse dupliqué ou un
identifiant de cycle différent. Le reçu expose les tokens rapportés par agent
et par phase. Le total rapporté constitue une borne inférieure tant qu'aucun
inventaire exhaustif des appels du cycle n'est certifié. Une absence de reçu
reste inconnue, jamais convertie en zéro mesuré. Le silence garde un coût de
modèle nul pour le cycle qui ne déclenche aucun appel.

La validation des accusés de livraison précède l'enregistrement des tokens
dans les métriques ; un accusé incohérent ne pollue donc pas les compteurs.

## Limites

L'adaptateur peut rapporter un niveau de grounding, mais cette déclaration
n'est pas une observation indépendante. Les accusés natifs et tardifs ainsi
que le coût total d'une mission exigent des vérifications supplémentaires.
Le test ne démontre aucun gain net de tokens face à une baseline appariée.

## Vérification

`node backend/tests/test_communication_checkpoint_live_team.js` traverse
le vrai service de checkpoint, vérifie la publication dirigée vers un worker,
l'absence de grounding sans accusé, le grounding vérifié, la ventilation
génération/contrôle et le silence à la fin de mission. Le test existant
`test_communication_live_cycle.js` vérifie le pilote et ses refus.
