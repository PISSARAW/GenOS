# ADR 0700 — Cycle transactionnel commun de morphogenèse P1

- **Statut** : Accepté
- **Date** : 2026-10-20
- **Domaine** : Morphogenèse, topologies, restauration, preuves
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0430, ADR 0566, ADR 0610, ADR 0657

## Contexte

P0 a donné aux huit topologies un port runtime commun et une description explicite
des capacités morphogénétiques. Cette description restait toutefois déclarative :
un consommateur pouvait savoir qu'une capacité était annoncée, sans frontière
commune pour l'invoquer ni protocole uniforme reliant snapshot, adaptation,
vérification, finalisation et restauration.

GenOS possède déjà un snapshot durable du plan de contrôle commun. Celui-ci couvre
les workspaces, agents, checkpoints, baux, budgets et l'état collectif. Il ne prouve
pas à lui seul la restauration des états spécialisés d'une topologie : session
régionale, hôte holobionte, CRDT Syncytium, communauté Biocénose ou autre état de
variant. Assimiler ces deux niveaux produirait un faux rollback complet.

## Décision

`TopologyRuntimePort` version 1.1 sépare désormais trois notions :

1. la capacité décrite par `describe()` ;
2. la capacité annoncée par `supports()` (`declared` ou `verified`) ;
3. la capacité invocable par `qualified()` et `morphogenesis()`, qui exige l'état
   `verified` et un handler runtime effectif.

Le coordinateur transactionnel commun exécute un cycle fermé : observation,
quiescence prouvée, snapshot scellé et explicitement restaurable, adaptation,
vérification indépendante avec références de preuve, puis finalisation. Il ne
démarre aucune phase si l'une des six capacités n'est pas qualifiée.

Après armement du snapshot, tout échec déclenche la restauration. Un rollback n'est
accepté que si le reçu confirme `restored` et `verified`, avec le même identifiant et
le même hash que le snapshot. Une divergence, une absence de reçu ou un échec de
restauration produit `recovery_required`. Un snapshot non restaurable bloque avant
l'adaptation et ne provoque pas une restauration fictive.

Les ports des huit topologies restent fermés dans P1 : aucune capacité de
restauration spécialisée n'est promue automatiquement. Chaque topologie et chaque
variant devra fournir un handler complet et une campagne de qualification avant que
le cycle puisse être utilisé en production.

## Conséquences

### Positives

- Un état `declared` ne donne plus accès à une mutation runtime.
- Les phases et leurs reçus suivent le même ordre pour toutes les topologies.
- La preuve de restauration est liée au snapshot exact, pas à un booléen générique.
- Le défaut reste non mutant pour les huit plugins actuels.
- Les adaptateurs futurs peuvent être qualifiés progressivement sans modifier le
  protocole transactionnel commun.

### Négatives et limites

- P1 fournit le protocole et ses gates, pas les restaurateurs spécialisés des huit
  topologies.
- Tant qu'une topologie n'a pas ses six handlers vérifiés, sa transition est refusée
  avant observation.
- La vérification indépendante reste un adaptateur obligatoire ; le coordinateur ne
  choisit ni oracle ni politique de preuve.

## Alternatives écartées

- Déduire la qualification de la présence d'une méthode : rejeté, car du code non
  éprouvé n'est pas une preuve de restauration.
- Considérer le snapshot durable commun comme suffisant pour toutes les topologies :
  rejeté, car il ne capture pas tous les états spécialisés.
- Continuer après un rollback partiel : rejeté ; l'état devient
  `recovery_required` et exige une intervention explicite.
- Finaliser avant vérification : rejeté, car un transport réussi ne constitue pas
  une issue valide.

## Vérifications associées

- `node backend/tests/test_morphogenesis_p0_architecture.js`
- `node backend/tests/test_morphogenesis_p1_transaction.js`
- `python scripts/ci/check_code_quality.py`
