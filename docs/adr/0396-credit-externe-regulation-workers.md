# ADR 0396 — Crédit externe mesuré pour la régulation des workers

- **Statut** : En cours
- **Date** : 2026-10-11
- **Domaine** : Régulation, ressources, orchestration, preuves
- **Décideurs** : Équipe GenOS
- **Lié à** : [ADR 0395](0395-regulation-supervisee-workers-natifs.md), [plan de réalisation](../02-orchestration/plan-implementation-regulation-ressources-orchestrate.md)

## Contexte

L'ADR 0395 restaure un snapshot régulatoire simulé à partir d'un checkpoint vérifié. Cette opération ne recharge aucune ressource détenue hors du runtime. Le protocole de qualification exige en outre que `genos_orchestrate` produise le plan et les contrats des workers sans insertion manuelle par la sonde.

## Décision

1. La première ressource externe qualifiée est un crédit d'exécution entier, détenu par un fournisseur dans un processus et une base distincts. Le registre conserve réserve, soldes par tenant/mission/agent et crédits dépensés. À tout instant, réserve + soldes + dépensé égale la quantité initiale.
2. Le fournisseur signe observations et reçus avec Ed25519. GenOS épingle la clé publique, vérifie identité, unité, version et fraîcheur, puis relit le solde après transfert. Le reçu et la lecture sont deux actes distincts.
3. Les transferts sont bornés par un contrat de mission et un bail du superviseur. L'identifiant d'opération est idempotent et survit au redémarrage. Une issue ambiguë se résout par consultation de cet identifiant ; un transfert de remplacement n'est jamais inféré d'un timeout.
4. Le `recovery_worker` possède une méthode `replenish_external_quota` distincte de `restore_checkpoint`. Son résultat est admissible seulement si contrat, run, reçu signé, observation fraîche et identité du worker cible concordent.
5. L'énergie liée au crédit est dérivée du solde externe divisé par la capacité du compte. Les autres variables conservent leurs capteurs. Un état interne prétendument sain ne peut contourner une mesure externe insuffisante.
6. La voie `checkpoint_restore` existante demeure typée et séparée. Les missions sans contrat de crédit externe utilisent encore la politique de l'ADR 0395. Une mission à crédit externe échoue fermée si le fournisseur, la preuve ou la mesure manque.
7. Pour une mission à objectifs natifs, le plan réserve l'identifiant opaque de chaque worker avant sa création. Le dispatch compare la liste exécutée au digest du plan, puis vérifie identifiant, type, méthode et budget. Cette identité scellée pourra lier le compte externe et le bail de récupération au worker cible ; le helper automatique reste à implémenter.
8. Une méthode native ne peut terminer sous une exigence de vérification indépendante qu'avec un oracle sémantique lié au run, au worker, au contrat et à son rapport frais. Les stratégies de vérification s'exécutent dans deux processus distincts avec un budget persistant. `scan_literal`, `monitor_samples` et `subset_sum` ont maintenant chacun un domaine d'oracle concret ; un domaine ou une méthode inconnus restent bloqués. Les reçus scout et monitor sont hachés avec une sérialisation canonique afin que l'ordre JSON des clés ne change pas leur identité.

## Conséquences

### Positives

- Une hausse d'énergie peut être reliée à un débit de réserve observé, avec contrôle de conservation et provenance du run.
- L'idempotence, la signature et la relecture empêchent qu'un rejeu ou une simple télémétrie produise une recharge déclarée.

### Coûts et limites

- Le premier fournisseur est contrôlé localement ; sa qualification ne prouve pas encore le comportement d'un service tiers.
- L'orchestration doit réserver du budget pour le helper de récupération, éviter la récursion et réconcilier les effets du fournisseur après crash.
- Les clés privées et bases du fournisseur sont des artefacts d'essai hors Git, sur D:.
- Chaque nouvelle famille de méthodes exige son propre contrat d'évidence, des postconditions indépendantes, une liaison à la provenance scellée et des cas positifs/négatifs avant d'être ajoutée au registre de confiance. L'oracle commun ne signifie pas que toutes les méthodes natives sont déjà couvertes.

## Alternatives écartées

- **Relever directement `energy`** : aucun solde externe n'augmente.
- **Assimiler `restore_checkpoint` à une recharge** : le fichier restauré n'est pas une allocation fournisseur.
- **Accepter le seul reçu de transfert** : une relecture indépendante est nécessaire pour détecter un état fournisseur divergent.
