# ADR 0646 — Stewardship du dépôt lié à l'effet projet

- **Statut** : Accepté
- **Date** : 2026-10-19
- **Domaine** : Ontogenèse, responsabilité durable, preuve, intégration
- **Décideurs** : maintenance GenOS
- **Lié à** : ADR 0235, ADR 0334, ADR 0434

## Contexte

Un agent de développement puissant peut explorer un dépôt, générer du code et
exécuter des tests. Ces capacités ne suffisent pas à lui confier la responsabilité
durable du projet. Un test vert peut ne couvrir que le transport ou le comportement
local du candidat ; il ne démontre ni la préservation des invariants du dépôt, ni un
effet utile après intégration. Une reprise qui oublie l'intention ou les échecs
précédents peut aussi répéter une modification déjà dominée.

GenOS dispose déjà des worktrees isolés, des preuves Ontogenèse, de la mémoire et du
journal append-only. Il manquait un contrat étroit qui les relie en une responsabilité
de dépôt opposable et qui représente explicitement l'absence de changement.

## Décision

Le service `repositoryStewardshipService.js` persiste dans le ledger Ontogenèse un
contrat composé d'une intention, de contraintes et d'invariants. Chaque version porte
l'empreinte de son contenu et celle de la version précédente. Une révision utilise un
numéro attendu ; retirer une contrainte ou un invariant exige une justification
explicite. Le contrat est également référencé dans la mémoire de contraintes.

Une candidature est admissible seulement si elle :

- référence la version courante du contrat ;
- annonce un SHA de base et un workspace isolé ;
- identifie son exécuteur ;
- formule avant modification une hypothèse, un critère de falsification et un plan de
  preuve.

L'adoption exige ensuite trois observations distinctes :

1. une preuve exécutable émise par un vérificateur différent de l'exécuteur ;
2. une intégration dont l'empreinte de contenu correspond à celle qui a été testée ;
3. une mesure indépendante, postérieure au SHA intégré, qui améliore la métrique
   déclarée par rapport à sa baseline.

Si une observation manque, si l'évaluateur est l'exécuteur, si le contrat est devenu
obsolète ou si l'effet n'est pas amélioré, la décision est `NO_CHANGE`. Une réussite
du worker ou un exit code nul ne produit donc jamais seul `ADOPT`.

Les propositions et évaluations sont idempotentes par identifiant. Chaque évaluation
alimente une mémoire causale `decision` ou `failure` avec le contrat, le candidat, le
SHA d'intégration et les références de preuve. La reprise relit le ledger ; une
incohérence de version conduit à `NO_CHANGE` et `reconcile_contract`, sans relancer ou
promouvoir automatiquement le candidat.

## Conséquences

### Positives

- L'intention du dépôt survit aux missions et aux redémarrages sous une forme
  versionnée et vérifiable.
- L'hypothèse et sa falsification précèdent le changement au lieu d'être reconstruites
  après succès.
- Le code généré, les tests et l'effet projet restent trois faits distincts.
- `NO_CHANGE` empêche le churn quand la preuve ou le gain manque.
- La mémoire permet d'expliquer une adoption ou un refus sans inventer de causalité.

### Négatives

- La mesure post-intégration ajoute une étape et peut retarder la décision.
- Le service ne choisit pas lui-même la métrique ni son sens ; le contrat de mission
  doit les fournir.
- Le ledger générique ne remplace pas un verrou d'intégration et ne publie aucun code.

## Alternatives

- Considérer les tests du candidat comme preuve suffisante : rejeté, car ils peuvent
  être produits par le même exécuteur et ne mesurent pas l'effet dans l'état intégré.
- Mémoriser seulement le dernier verdict : rejeté, car la chaîne d'intention,
  d'hypothèse et de preuve serait perdue lors d'une reprise.
- Forcer un changement lorsqu'aucun candidat ne gagne : rejeté ; `NO_CHANGE` est le
  contrôle négatif et le résultat prudent.

## Vérification

`backend/tests/test_ontogenesis_repository_stewardship.js` vérifie la chaîne de
contrats, le contrôle de version, l'isolement, l'hypothèse falsifiable, l'idempotence,
la preuve indépendante, l'effet post-intégration, `ADOPT`, `NO_CHANGE`, la mémoire
causale et la reprise sur contrat obsolète.

Cette suite démontre ces invariants sur SQLite et la politique pure. Elle ne démontre
pas un déploiement distant, l'exactitude d'un modèle, la valeur générale d'une
métrique ni une publication automatique. Les gates d'intégration existants restent
les seuls à pouvoir créer un commit dans leur périmètre autorisé.
