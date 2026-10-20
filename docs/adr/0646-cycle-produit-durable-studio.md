# ADR 0646 — Séparer aperçu, acceptation et effet du produit Studio

- **Statut** : Accepté pour la boucle locale Studio
- **Date** : 2026-10-19
- **Domaine** : Studio, produit, UX, preuve, apprentissage, sûreté
- **Décideurs** : équipe GenOS
- **Lié à** : [ADR 0365](0365-studio-boucle-production-locale.md)

## Contexte

Une application générée et exécutable peut rester inutile, illisible ou nocive.
La réussite d'un aperçu ne prouve ni l'acceptation du produit ni son effet auprès
d'utilisateurs réels. Une boucle d'amélioration qui confond ces étapes peut
apprendre d'un score interne, déployer une régression ou prétendre à tort qu'un
retour constitue une validation.

## Décision

Studio ajoute une lignée de contrats produit par workflow. Chaque révision lie
un but, des hypothèses utilisateur falsifiables, des critères de qualité visuels
et fonctionnels, un plan de rollback et une politique d'apprentissage. Les
révisions utilisent une précondition CAS et conservent leur parent et leur hash.

Une release peut recevoir des évaluations d'aperçu. La décision reste
`NO_CHANGE` jusqu'à ce que deux évaluateurs distincts couvrent au moins les
modalités visuelle et fonctionnelle et tous les critères. Un rejet recommande
un rollback ; une couverture soutenue produit seulement
`READY_FOR_ACCEPTANCE`. Un owner/admin doit accepter explicitement le hash exact
du jury. Toute nouvelle preuve invalide cette acceptation pour une prochaine
publication. Aucun de ces chemins ne déploie la release.

Après une acceptation et un run production terminé lié à la même release, des
observateurs distincts peuvent enregistrer une mesure bornée. Le verdict est
dérivé de la baseline, de la direction et de l'effet minimal déclarés, au lieu
d'être choisi par l'appelant. Deux runs et deux observateurs, dont un contexte
holdout, rendent la source éligible à une expérience de transfert. Ils ne
valident pas la cible du transfert. Une régression crée une recommandation de
rollback ; le rollback lui-même reste une action humaine séparée.

Les initiatives post-livraison sont idempotentes et consultatives :
`NO_CHANGE`, `PROPOSE_TRANSFER_EXPERIMENT` ou `ROLLBACK_RECOMMENDED`. Elles
portent toujours `deploymentTriggered: false` et `rollbackTriggered: false`.

## Conséquences

### Positives

- le contrat UX survit à la génération et reste relié à une version ;
- aperçu, acceptation humaine et effet réel ne peuvent plus être assimilés ;
- l'absence ou l'ambiguïté des preuves produit une abstention explicite ;
- l'apprentissage transférable garde une expérience cible obligatoire ;
- les altérations de contrat, d'acceptation ou d'observation rendent la gate
  invalide au lieu de produire un succès.

### Négatives

- le parcours demande plusieurs acteurs et observations ;
- les seuils déclarés ne constituent pas une analyse statistique ;
- le stockage local ne prouve ni identité externe ni indépendance sociologique ;
- la recommandation de rollback n'annule aucun effet externe passé.

## Alternatives

- **Promouvoir après un aperçu réussi** : rejeté, car l'exécution ne mesure pas
  la qualité produit ni l'effet utilisateur.
- **Un score unique généré par le créateur** : rejeté, faute d'indépendance et
  de pluralité visuelle/fonctionnelle.
- **Réentraîner ou redéployer automatiquement** : rejeté ; les observations
  créent une hypothèse et une initiative, jamais une autorité de mutation.
- **Refuser toute initiative** : rejeté ; `NO_CHANGE` et les propositions
  bornées conservent une capacité d'apprentissage sans effet automatique.

