# ADR 0680 — Admission endogène SHEV attestée et bornée

- **Statut** : Accepté
- **Date** : 2026-10-19
- **Domaine** : SHEV, Ontogenèse, initiative endogène
- **Décideurs** : mainteneurs GenOS
- **Lié à** : ADR 0295, ADR 0297, ADR 0333

## Contexte

SHEV pouvait transformer une dégradation observée en tâche Ontogenèse lorsque le
mandat autorisait `autoDiagnose`. La référence de preuve, le hash du constat et la
déduplication par identifiant protégeaient la reprise, mais n'authentifiaient pas le
producteur du constat. Des observations distinctes pouvaient aussi déclencher des
tâches rapprochées sans arbitrage durable de cooldown ni quota propre au circuit
endogène.

Un planificateur périodique ne résout pas ce problème : il décide *quand regarder*,
pas si une observation courante, autorisée et suffisamment rare justifie une action.

## Décision

Le mandat peut activer une politique `endogenousPolicy` opt-in. Elle inscrit une
identité d'observateur Ed25519, un cooldown, une fenêtre budgétaire et un nombre
maximal d'actions. Dans ce mode, `recordObservation` vérifie la signature du contenu
normalisé avant persistance. L'attestation est append-only.

Avant toute mise en file, le compilateur persiste un arbitrage append-only :
`ACT` ou `NO_CHANGE`. `NO_CHANGE` est obligatoire si la permission automatique
manque, si la preuve est insuffisante ou périmée, si l'attestation ne correspond
pas, si le cooldown est actif ou si le quota glissant est épuisé. L'identité de
l'observation rend l'arbitrage rejouable après crash. Une décision `NO_CHANGE`
produit une initiative terminale `rejected`, sans tâche ni réveil.

L'événement de réveil demeure dédupliqué par le mécanisme Ontogenèse existant. Le
quota autorise une tâche, pas une promotion : l'exécution garde les budgets du
projet et les effets restent soumis à une observation postérieure, un vérificateur
externe et la surveillance persistante SHEV.

## Conséquences

### Positives

- l'initiative automatique est liée à un producteur inscrit dans le mandat ;
- l'abstention devient inspectable au lieu d'être déduite d'une absence de tâche ;
- les rafales sont limitées sans perdre la trace des constats refusés ;
- un redémarrage rejoue la décision déjà persistée plutôt que de consommer deux fois
  le budget ;
- un succès de tâche reste distinct d'un effet projet vérifié dans le temps.

### Négatives

- la rotation de la clé d'observateur exige une révision authentifiée du mandat ;
- le quota compte des admissions, pas le coût réel en jetons ou dollars, qui reste
  contrôlé par Ontogenèse ;
- l'authenticité de la signature ne démontre ni la justesse du capteur ni
  l'indépendance du vérificateur.

## Alternatives

- **N'utiliser qu'un calendrier** : rejeté, car le calendrier ne lie pas l'action à
  une observation probante.
- **Dédupliquer seulement par texte ou dimension** : rejeté, car cela efface des
  constats distincts et ne donne pas de reçu d'abstention.
- **Faire confiance au champ `source`** : rejeté, car une chaîne déclarative n'est
  pas une identité cryptographique.
- **Autoriser l'agent à augmenter son quota** : rejeté ; le budget appartient au
  mandat versionné et à son autorité.

## Vérification

- `node backend/tests/test_shev_endogenous_initiative.js`
- `npm --prefix backend run test:shev`
- `python scripts/ci/check_code_quality.py`
