# ADR 0472 — Séparer l’exécution worker de la promotion

- **Statut** : Accepté et implémenté
- **Date** : 2026-10-14
- **Domaine** : Supervision des missions Trinity et promotion des preuves.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0470, budgets d’inférence locale pour Trinity.

## Contexte

Un worker peut terminer son inférence et persister un rapport substantiel, puis
être marqué `error` parce que la promotion conditionnelle refuse le rapport en
l’absence d’un reçu de vérification indépendante. La supervision Trinity
interprétait cet état final comme une exécution absente et abandonnait la
comparaison, même si le rapport `AGENT_COMPLETED` était conservé.

## Décision

La supervision peut inclure un tel worker dans la comparaison uniquement si le
dernier run est bloqué par `require_independent_verification` et si son dernier
événement terminal est `AGENT_COMPLETED` pour ce même run avec un rapport de
succès substantiel. La classification interne `completed_unpromoted` distingue
la fin de l’exécution du refus de promotion. Les erreurs de modèle, de budget,
d’artefact et les autres refus restent des échecs d’exécution.

Le runtime local transmet aussi au fournisseur un schéma JSON dérivé du contrat
worker. Le schéma contraint les formes d’artefact et les valeurs énumérées,
tandis que la validation GenOS existante demeure l’autorité finale.

Pour les workers spécialistes Trinity, la niche implicite vient du domaine
déclaré, jamais du libellé du monde ou de sa chambre.

Une entrée de monde encore `queued` est relancée si son agent existe mais reste
`idle` sans PID runtime. La présence de la ligne agent seule ne prouve pas que
le worker a été lancé.

## Conséquences

### Positives

- Les rapports terminés peuvent être comparés sans contourner le gate de
  vérification indépendante.
- Les workers locaux reçoivent les contraintes structurelles et les énumérations
  attendues par leur contrat.
- Un libellé de variante comme `planned_world` ne devient plus une niche
  d’expertise involontaire.
- Un dispatch rejoué peut démarrer les workers dont l’identité est persistée
  mais dont le runtime n’a jamais été lancé.

### Négatives

- Une comparaison peut se terminer avec une décision d’escalade ou de maintien
  non promu lorsque les rapports n’ont pas de preuves suffisantes.
- Certains fournisseurs locaux peuvent ignorer les schémas; la validation
  applicative et les gates restent donc obligatoires.

## Alternatives

- Déclarer les workers `completed` après toute sortie modèle : rejeté, car cela
  confond l’inférence avec une exécution acceptée.
- Désactiver l’exigence de vérification indépendante : rejeté, car cela
  affaiblirait la politique de promotion.
- Conserver l’escalade immédiate : rejeté, car cela écarte des rapports
  persistés et utiles à l’analyse sans changer le statut de leur promotion.
