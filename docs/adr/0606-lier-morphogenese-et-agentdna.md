# ADR 0606 — Lier la morphogenèse et AgentDNA

- **Statut** : Accepté
- **Date** : 2026-10-18
- **Domaine** : morphogenèse, AgentDNA, incarnation, preuve, restauration
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0001, ADR 0002, ADR 0239, ADR 0603

## Contexte

La morphogenèse sait produire des actions `reuse`, `clone`, `cross`, `mutate`,
`graft` et `speciate`, tandis que le runtime AgentDNA sait sélectionner,
exprimer, dériver, stocker et promouvoir des génomes. Ces deux chemins ne
partagent toutefois pas encore une autorité commune : le plan peut décrire une
transformation sans lier ses parents à leur fingerprint, et l'incarnation peut
retomber silencieusement sur la sélection historique.

Un succès de transport ou d'opération génomique ne constitue pas une preuve de
fitness. Une transformation doit donc produire un candidat isolé, traçable et
non sélectionnable jusqu'à une décision de promotion fondée sur des preuves.

## Décision

1. `AgentGenome` demeure le manifeste portable d'identité et de politique ;
   `AgentDNA` demeure le contenu héréditaire binaire exécutable.
2. La morphogenèse charge un portefeuille autoritatif limité aux génomes
   `active`, dans la portée du tenant, dont le contenu et la confiance ont été
   vérifiés.
3. Toute action génomique lie ses parents par `genomeRef` et `contentHash` et
   déclare ses obligations de preuve et sa compensation.
4. Toute opération dérivée produit un génome `DRAFT` enregistré comme
   `candidate`. Elle ne modifie jamais son parent et ne rend jamais son résultat
   sélectionnable par elle-même.
5. Les statuts de promotion (`candidate`, `evaluated`, `active`, `rejected`) et
   les statuts du contenu (`DRAFT`, `SEALED`) restent orthogonaux.
6. Un contenu `SEALED` peut servir de parent immuable ; toute dérivation obtient
   une nouvelle identité et redevient `DRAFT`. Le parent scellé reste inchangé.
7. Une incarnation issue de la morphogenèse conserve le plan, la transition, la
   sélection, le fingerprint du génome et le hash du phénotype exprimé.
8. Les échecs de portée, de signature, de fingerprint ou de version sont
   bloquants lorsqu'un génome est explicitement demandé. Aucun fallback
   silencieux n'est autorisé dans ce cas.
9. Le graphe et le snapshot de transition doivent conserver les bindings
   génomiques nécessaires à l'audit et à la restauration.
10. L'évaluation d'un candidat exige une issue appariée persistée et vérifiée :
    la branche candidate doit être liée au fingerprint du candidat, la branche
    contrôle au fingerprint du parent, et le gain observé doit être positif.
    L'évaluation n'entraîne aucune promotion automatique ; un opérateur reste
    requis pour rendre le génome actif.
11. Une dérivation s'exécute dans une transition de préparation sans action
    runtime (`spawn`, `retire`, `rebind`). Tant que le candidat n'est pas
    évalué puis promu, l'activation de la morphologie est refusée. Une nouvelle
    planification peut ensuite sélectionner le génome devenu `active`.

## Conséquences positives

- La sélection, la dérivation et l'incarnation partagent la même identité.
- Les candidats restent séparés des génomes actifs jusqu'à la promotion.
- Les décisions morphogénétiques deviennent rejouables et auditables.
- Le rollback peut distinguer les effets runtime des candidats à abandonner.

## Coûts et limites

- Le chargement et la vérification du portefeuille ajoutent un coût avant le
  plan de mission.
- Les anciennes missions sans AgentDNA continuent à fonctionner, mais elles ne
  revendiquent aucune liaison génomique.
- La qualification comparative des candidats reste nécessaire : la validité
  structurelle et la signature ne démontrent pas une amélioration.

## Vérification

- portefeuille borné par tenant, statut et politique de signature ;
- action liée aux fingerprints exacts de ses parents ;
- rejet d'un parent modifié entre planification et exécution ;
- candidat exclu de la sélection automatique avant promotion ;
- incarnation liée au même fingerprint que la décision ;
- rejeu idempotent et rollback sans suppression des preuves.
- issue appariée liée aux fingerprints candidat/parent avant évaluation ;
- promotion impossible sans évaluation éligible et identité opérateur.
