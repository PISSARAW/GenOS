# ADR 0296 — Cinq capacités transversales de morphogenèse

- **Statut** : Proposé, avec première implémentation opt-in
- **Date** : 2026-10-04
- **Domaine** : Morphogenèse, preuves, mémoire, risque statistique
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : [Morphogenèse](../02-orchestration/topologies/morphogenese.md)

## Contexte

Rhizome détecte des lacunes de capacité, Trinity organise des expériences et
la morphogenèse valide les transitions. Ces mécanismes ne couvrent pas encore
explicitement la redondance des expériences vérifiées, les tentatives répétées,
la couverture temporelle, la préservation des contre-exemples et le risque
statistique accumulé entre branches. Les huit topologies existantes restent des
organisations spécialisées. Une nouvelle topologie ne résoudrait pas ces
problèmes transversaux.

## Décision

Introduire cinq services opt-in sous `backend/src/services/morphogenesis/capabilities/` :

1. Le méristème classe des contrats expérimentaux selon leur utilité, leur coût
   et leur similarité comportementale avec les épreuves **vérifiées**. Une
   réplication indépendante est explicitement exemptée de l'inhibition.
2. La spirale conserve une signature de tentative et exige une différence de
   famille, de périmètre ou de preuve pour proposer l'essai suivant. Le droit
   d'agir reste celui de la transition morphologique existante.
3. La chronotaxie calcule des phases reproductibles pour des schedules de type
   `interval` ; les observations réalisées sont comptées séparément des réveils.
4. Le cambium lie procédure, conditions, témoins et contre-exemples. La
   suppression du dernier témoin exige une dégradation explicite de la claim.
5. Le registre de risque répartit des unités entières par lignée. Réserver un
   test diminue le solde ; le terminer consomme l'allocation même si le test
   échoue. Une fusion change la propriété des droits existants, sans en créer.

Une migration SQLite versionnée stocke reçus, tentatives, observations, claims,
témoins et allocations. Les chemins existants ne changent que lorsqu'un contrat
de la nouvelle capacité leur est fourni. Les promotions Trinity munies d'un
contrat statistique exigent un test préenregistré et un reçu signé.

## Frontières de preuve

Un reçu signé atteste son origine backend et permet de recalculer la statistique
du test Bernoulli séquentiel. Il ne démontre ni la représentativité des données,
ni l'indépendance de l'évaluation, ni la validité de toute hypothèse externe.
La garantie de risque global exige ces hypothèses pour chaque test et un
périmètre fixé avant la campagne. Les décisions morphologiques restent soumises
aux gates de sécurité, de preuve et d'autorité existants.

## Alternatives examinées

- Ajouter une neuvième topologie : rejeté, car les capacités s'appliquent à
  plusieurs topologies et ne définissent pas à elles seules une organisation.
- Utiliser la similarité de prompts pour le méristème : insuffisant pour
  détecter des prédictions et des erreurs communes.
- Employer seulement du jitter pour la chronotaxie : ne mesure pas la
  couverture des phases effectivement observées.
- Rembourser les tests après rollback : invalide la comptabilité du risque
  lorsqu'une sélection a déjà consulté le résultat.
- Fixer partout le nombre d'or : rejeté ; son usage reste une variante
  expérimentale sans statut de garantie.

## Conséquences

Le premier niveau est exploitable via les services Node et les intégrations
opt-in. Il n'active pas automatiquement les cinq capacités pour toute mission.
Les protocoles comparatifs et les vérificateurs d'artefacts doivent être
qualifiés avant de présenter un résultat comme une garantie empirique. Les
fiches de chaque capacité décrivent leur branchement, leur maturité et leurs
épreuves de validation.
