# Campagne d’évolution AIDE² à double causalité

- **Statut** : tranche backend implémentée ; exécution de modèles et promotion hors périmètre.
- **Portée** : protocole scellé, mesures appariées, transfert OOD, revue causale.
- **Dernière revue** : 2026-10-20
- **Décision** : [ADR 0681](../adr/0681-campagne-evolution-aide2-double-causalite.md)

Cette tranche transforme l’auto-amélioration récursive en une procédure falsifiable.
Elle ne lance pas de modèle et ne promeut aucun agent : elle valide des mesures déjà
produites, puis prépare seulement une demande de promotion externe.

## Chaîne de décision

1. `campaignContract.createCampaignPlan` scelle au moins trois générations, quatre
   acteurs distincts et trois corpus disjoints : évolution, holdout et hors distribution.
2. `generationEvaluationService.evaluateCampaign` vérifie le lignage, mesure chaque
   génération par paires et réserve la sélection au corpus d’évolution.
3. Le gain holdout prouve la compétence seulement si la borne basse de l’intervalle à
   95 % dépasse le seuil préenregistré. Le transfert OOD possède sa propre preuve.
4. Un écart excessif entre score d’évolution et holdout, ou entre récompense rapportée
   et résultat mesuré, classe la génération comme reward hacking.
5. `causalPromotionReviewService.buildCausalReview` exige en plus trois fenêtres projet,
   au moins deux contextes et la même responsabilité que celle ayant motivé la campagne.
6. Un vérificateur indépendant signe les quatre obligations. Un autorisateur distinct
   approuve ensuite la revue liée à son digest.

Même après ces deux décisions externes, la sortie reste
`eligible_for_external_promotion_request` avec `promotionAllowed: false` et
`promotionExecuted: false`. Le gate de promotion normal reste seul compétent.

## Propriétés de sûreté

- les cas et les hashes des trois corpus sont disjoints ;
- le producteur, l’évaluateur, le vérificateur et l’autorisateur sont distincts ;
- le receipt du vérificateur est authentifié par le keyring AEIS et un digest de
  vérificateur enregistré ;
- le receipt couvre explicitement compétence, OOD, absence de reward hacking et effet
  longitudinal projet ;
- une campagne incomplète, un lignage brisé ou une portée projet différente échoue
  fermée.

## Modèle des acteurs

| Rôle | Produit | Ne peut pas décider |
| --- | --- | --- |
| producteur | génération candidate | sa qualification |
| évaluateur | mesures appariées et intervalles | l'autorisation finale |
| vérificateur | reçu couvrant quatre obligations | l'application |
| autorisateur | décision liée au digest | le contenu des mesures |

Les quatre identités sont scellées dans le plan. Une indépendance technique par
identifiant ne garantit toutefois pas une indépendance organisationnelle réelle.

## Statistique et falsification

Pour chaque cas, le service calcule l'écart candidat-parent. La moyenne des écarts et
son intervalle à 95 % servent à qualifier le gain ; la sélection ne repose pas sur la
seule moyenne. Le protocole rejette notamment : fuite entre corpus, intervalle holdout
recouvrant le seuil, transfert OOD insuffisant, récompense déclarée incohérente et
preuve projet hors responsabilité.

Cette statistique convient aux fixtures bornées du dépôt. Elle ne corrige ni les tests
multiples, ni l'autocorrélation temporelle, ni une sélection adaptative répétée. Une
campagne réelle doit préenregistrer ces corrections.

## États et frontière de promotion

```text
campaign/v1
  -> generation-evaluation/v1: qualified_measurement | rejected_measurement
  -> causal-review/v1: awaiting_independent_verification | causal_evidence_rejected
  -> promotion-review/v1: eligible_for_external_promotion_request | promotion_review_rejected
```

Aucun de ces états n'exécute une promotion. Le gate externe doit revalider le digest,
la révision candidate, l'autorité et le rollback.

## Observabilité minimale

- hashes et tailles des trois corpus ;
- lignée et résultat par génération ;
- écarts appariés et intervalles ;
- alarmes de reward hacking ;
- fenêtres, contextes et responsabilité des effets projet ;
- identités, digests et décisions des quatre rôles ;
- raison explicite d'une abstention.

## Exécution des tests

```bash
npm --prefix backend run test:aide2
```

La suite utilise des données synthétiques déterministes. Elle prouve les invariants du
protocole, pas une amélioration empirique de GenOS ni une supériorité générale sur AIDE².

## Limites

- Les observations sont fournies au service ; cette tranche ne matérialise pas les
  workspaces ni les exécuteurs de modèles.
- L’intervalle t est adapté aux petits échantillons bornés mais ne corrige pas les tests
  multiples ni les dépendances temporelles.
- L’autorisation est liée au digest de revue, sans effectuer la promotion.
- Un benchmark métier tiers et une réplication indépendante restent nécessaires avant
  toute revendication comparative.

Voir aussi [Évolution contrefactuelle gouvernée](evolution-contrefactuelle-gouvernee.md),
[Évolution gouvernée des logiques agentiques](../01-concepts/evolution-gouvernee-agent.md)
et la [matrice de qualification](../06-qualite-preuves/matrice-qualification-stewardship-v3-2026-10-20.md).
