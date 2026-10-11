# ADR 0423 — Fermer le mode commit injectable de Morphogenèse V2

- **Statut** : accepté
- **Date** : 2026-10-11
- **Domaine** : morphogenèse, autorité, transition de production

## Contexte

Le parcours public après mission fonctionne en mode `shadow`, mais
`runMorphogenesisRuntime` acceptait encore le mode `commit` par défaut. Un
appelant pouvait injecter trois fonctions renvoyant `kernel.valid: true`,
`governance.allowed: true` et `transition.committed: true`. Le runtime
annonçait alors `APPLIED` sans vérifier l'identité du décideur Rust, la
proposition exacte, un snapshot restaurable ou une écriture CAS durable. Le
test de complétion utilisait précisément ces valeurs fabriquées comme succès.

## Décision

Le mode `commit`, y compris le mode implicite, retourne désormais
`REJECTED`, `committed: false` et
`MORPHOGENESIS_PRODUCTION_AUTHORITY_UNAVAILABLE` avant d'appeler le moindre
adaptateur. Le mode `shadow` conserve son parcours d'observation, de typage,
de contraintes, de Pareto et de contre-factuel ; son résultat reste
`SHADOWED` sans transition. `MorphogenesisRuntime.executeMorphology` relaie
le refus et émet une proposition, jamais un événement de complétion.

Les fonctions injectées constituent des points d'extension, pas une preuve
d'autorité. `configureRuntimeServices` peut encore vérifier leur présence,
mais cette validation ne réactive pas le commit. Les anciens consommateurs
du mode implicite doivent demander explicitement `shadow` pour évaluer une
proposition ; une transition de production exigera une nouvelle interface
qui vérifie un principal authentifié, une décision Rust liée à la proposition,
un snapshot de transition restaurable et un commit CAS avec reçu durable.

## Limites

Cette décision ferme un faux succès. Elle n'apporte ni authentification du
principal, ni snapshot collectif, ni application réelle. Les autres moteurs
de transition du dépôt possèdent leurs propres contrats et ne sont pas
qualifiés par cette décision.
