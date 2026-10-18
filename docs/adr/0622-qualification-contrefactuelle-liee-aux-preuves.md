# ADR 0622 — Qualification contrefactuelle liée aux preuves

- **Statut** : Accepté
- **Date** : 2026-10-18
- **Domaine** : runtime, causalité, falsification, provenance, promotion
- **Décideurs** : mainteneurs GenOS
- **Lié à** : ADR 0611, ADR 0618b, ADR 0621, audit des concepts 01–07

## Contexte

Les phases précédentes ont livré séparément une enveloppe d'autorité scellée,
un état causal versionné, des replays vérifiés, un dossier de preuve et une
frontière de capsule. Leur présence ne prouvait pas encore qu'une mission
pouvait les enchaîner sans contourner une frontière de confiance.

Le dossier de preuve sait distinguer plusieurs identifiants de vérificateurs,
mais cette distinction textuelle ne suffit pas à établir leur indépendance. Le
runtime dispose déjà de reçus HMAC liés à un registre de vérificateurs. Une
qualification intégrée doit les valider, les lier au même diff causal et
conserver la séparation entre qualification et autorisation de promotion.

## Décision

La qualification d'une mission contrefactuelle suit un protocole en deux temps.

### Préparation du défi

`counterfactualQualificationService.prepare` part d'un snapshot source couvert
par l'autorité scellée de la mission. Il matérialise deux branches isolées :

- le candidat, avec son intervention et son état observé ;
- le contrefactuel, avec la perturbation causale déclarée.

Chaque branche est rejouée. Leur diff est calculé, puis un dossier de promotion
est ouvert sur le replay candidat. Le défi retourné lie les snapshots, les deux
reçus de replay, le diff, la revendication et l'autorité. Il porte toujours
`promotionEligible: false`.

### Qualification indépendante

`counterfactualQualificationService.complete` refuse avant écriture :

- un défi altéré ou un diff qui ne correspond plus aux snapshots ;
- un replay absent, refusé, hors mission ou hors autorité ;
- un reçu non signé par la clé épistémique active ;
- un digest de vérificateur absent du registre de confiance ;
- un reçu non lié au diff et à la revendication du défi ;
- moins de deux acteurs indépendants ou deux reçus du même acteur.

Les reçus admis deviennent des éléments du dossier. Un statut `refuted`
constitue un contre-exemple vérifié et mène au rejet ; un statut
`inconclusive` empêche le quorum positif ; seuls les reçus `verified` distincts
et la falsification survivante rendent le dossier éligible.

Le résultat final référence le reçu immuable du dossier. Il expose la
disposition `promote`, `reject`, `quarantine` ou `escalate`, mais conserve
`authorizesPromotion: false`. Le gate de promotion existant reste le seul
consommateur autorisé à terminer la promotion.

## Conséquences

### Positives

- La mission positive et son contre-exemple partagent un même état source et
  une provenance causale vérifiable.
- L'indépendance déclarative est renforcée par une signature, un registre de
  confiance et des identités d'acteurs distinctes.
- Une réussite de transport ou de replay ne peut pas être présentée comme la
  vérité de la revendication.
- Le rejet produit une décision persistée et observable par le gate existant.

### Négatives et limites

- Les vérificateurs partagent encore l'infrastructure de clés HMAC du contrôle
  plane ; ce protocole ne prouve pas une indépendance organisationnelle ou
  matérielle.
- Les états candidat et contrefactuel sont fournis par les exécuteurs. Les
  reçus établissent leur vérification, pas l'exhaustivité de l'espace des
  perturbations.
- Une préparation abandonnée laisse un dossier ouvert et des branches
  conservées pour audit ; le nettoyage est une décision opérateur distincte.
- Le résultat de qualification n'est pas une autorisation de déploiement.

## Preuves exécutables

`backend/tests/test_counterfactual_mission_qualification.js` vérifie :

- la préparation depuis une autorité scellée et un snapshot versionné ;
- le replay des branches candidat et contrefactuelle ;
- deux reçus indépendants, signés et liés au diff ;
- une disposition positive qui ne promeut pas directement ;
- un contre-exemple signé qui produit un rejet observable ;
- le refus d'un défi altéré, de vérificateurs corrélés et d'un reçu falsifié.

## Alternatives écartées

- **Ajouter directement des identifiants au dossier** : ne prouve ni la
  signature, ni la confiance, ni la liaison au diff causal.
- **Qualifier et promouvoir dans la même opération** : confond l'évidence avec
  l'autorité de décision.
- **Laisser le service produire lui-même ses reçus indépendants** : transforme
  une auto-attestation en preuve.
- **Supprimer les branches rejetées** : détruit le contre-exemple et sa
  provenance.
