# Campagne d’évolution AIDE² à double causalité

- **Statut** : tranche backend implémentée ; exécution de modèles et promotion hors périmètre.
- **Portée** : protocole scellé, mesures appariées, transfert OOD, revue causale.

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
