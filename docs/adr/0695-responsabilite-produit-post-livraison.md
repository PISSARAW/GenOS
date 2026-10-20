# ADR 0695 — Responsabilité produit post-livraison

- **Statut** : Accepté et implémenté (portée backend SHEV)
- **Date** : 2026-10-19
- **Domaine** : SHEV, produit, livraison, observation, apprentissage
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0295, ADR 0297, ADR 0333

## Contexte

Une génération de produit de bout en bout peut s'arrêter quand un aperçu ou un
build est livré. Cette borne confond trois faits différents : un aperçu a été
vérifié, un opérateur externe a déployé un build et un effet utilisateur a été
observé. Elle ne maintient pas non plus la responsabilité lorsque la qualité
dérive après la livraison.

SHEV sait déjà conserver un mandat, transformer une dégradation en initiative
Ontogenèse et séparer l'effet projet du progrès de l'agent. Il manquait un objet
qui relie ces garanties à la trajectoire d'un produit livré.

## Décision

Introduire un manifeste produit immuable et signé. Il lie un build à une
dimension du mandat SHEV, une trajectoire, des critères de qualité, des risques,
une cible d'apprentissage, des preuves d'aperçu et un plan de retour vérifié.

Les reçus postérieurs conservent trois stades distincts :

1. `preview` atteste uniquement l'aperçu ;
2. `deployed` atteste un déploiement réalisé par un système externe ;
3. `user_effect` atteste une mesure post-déploiement.

Le service n'appelle aucun adaptateur de déploiement. Un stade ne peut avancer
que si le précédent possède un reçu `confirmed`. Une mesure saine enregistre un
état et répond `NO_CHANGE`. Une régression enregistre une dégradation SHEV puis
laisse `compilePending` produire l'initiative selon le mandat courant. Une
mesure inconclusive reste en attente.

Une qualification produit exige en plus le dernier effet utilisateur confirmé,
un effet projet SHEV `confirmed` et un progrès d'agent `confirmed` pour la cible
du manifeste. Les deux derniers reçus doivent provenir de vérificateurs
distincts. L'absence d'une preuve donne `INCONCLUSIVE` et `NO_CHANGE`; elle n'est
jamais convertie en succès. Même `QUALIFIED` n'est ni une promotion ni une
autorisation de déployer.

## Conséquences

### Positives

- la livraison devient le début d'une responsabilité persistante ;
- aperçu, déploiement et effet utilisateur ne peuvent plus être confondus ;
- les dérives observées réutilisent les budgets, gates et reprises Ontogenèse ;
- le projet et l'apprentissage conservent deux preuves séparées ;
- les manifestes, reçus de stade et qualifications sont append-only.

### Négatives

- l'application doit fournir des vérificateurs réellement indépendants et des
  références de preuve lisibles ; le backend ne peut pas certifier seul leur
  indépendance organisationnelle ;
- le service ne déploie pas et ne restaure pas lui-même un produit ;
- les essais locaux vérifient les transitions et refus, pas un bénéfice causal
  face à une plateforme de création de produit.

## Alternatives

- **Déduire le déploiement d'un aperçu réussi** : rejeté, car un artefact visible
  ne prouve pas un changement de production.
- **Promouvoir sur la seule métrique utilisateur** : rejeté, car elle ne prouve
  ni la contribution du changement ni un apprentissage transférable.
- **Déployer ou rollbacker automatiquement depuis SHEV** : rejeté ; l'autorité,
  les baux et la réconciliation appartiennent à l'adaptateur opérateur.

## Validation reproductible

```bash
node backend/tests/test_shev_product_stewardship.js
npm --prefix backend run test:shev
python scripts/ci/check_code_quality.py
```

Le premier test couvre le manifeste signé, l'immuabilité, l'ordre des stades,
`NO_CHANGE`, la création d'initiative sur dérive et la double preuve. Les suites
plus larges restent nécessaires avant intégration.
