# Préserver l’erreur d’exécution pendant la clôture des protocoles

- **Statut** : Implémenté et vérifié par régression locale.
- **Dernière revue** : 2026-11-04.

## Contexte

La relance du Dernier Sas a enregistré `EXECUTION_AUTHORITY_EXPIRED` dans sa
télémétrie, puis son runner a affiché `MISSION_GQWF_TERMINAL_RUN_REQUIRED`.
`runInProcess` exécutait les clôtures GQWF et ALLOSTASIS dans un `finally` : une
exception de clôture remplaçait donc l’exception d’exécution déjà en cours.
Le refus GQWF était légitime, car le run persisté était encore `running`.
Il ne justifiait ni de cacher la cause initiale, ni de qualifier le run.

## Décision

Une exception d’exécution reste prioritaire et est relancée telle quelle, avec
son identité, son code et sa pile. Cela fonctionne aussi pour une erreur gelée
ou une valeur levée falsy. Les deux clôtures sont tentées indépendamment ; leurs
refus secondaires sont journalisés avec le protocole et le run concernés.
Le diagnostic est borné à 1 000 caractères et ne contient pas l’objet d’erreur
complet. Un incident du journal ne remplace pas l’erreur prioritaire.

Sans erreur d’exécution, la première erreur de clôture reste fatale. Si GQWF et
ALLOSTASIS échouent tous deux, GQWF reste prioritaire et ALLOSTASIS est journalisé.
Si toutes les étapes réussissent, le résultat d’exécution est rendu inchangé.

## Conséquences et vérification

Le contrôle de statut de `gqwf.finishInProcess` est inchangé : un run `running`
ne peut pas être finalisé. Un run réellement `failed` conserve une clôture
`failed`. Aucun statut terminal, reçu de réussite ou certificat n’est fabriqué.
Cette correction ne réconcilie pas un run resté actif après la sortie du process ;
ce problème relève du contrôleur de cycle de vie.

`backend/tests/test_mission_protocol_cleanup_failure.cjs` reproduit d’abord la
perte d’une erreur d’expiration, puis vérifie les priorités et les deux clôtures.
Il appelle le véritable contrôle GQWF de statut sur une base synthétique et
remplace uniquement les effets de finalisation et ALLOSTASIS. Aucun modèle réel
ni verdict artistique n’est impliqué.

## Alternatives

- Autoriser la clôture d’un run `running` : rejeté, car cela contournerait le gate.
- Forcer le statut `failed` depuis ce `finally` : rejeté, car la clôture ne possède
  pas à elle seule les preuves et l’autorité du contrôleur de cycle de vie.
- Ignorer toute erreur de clôture : rejeté ; elle reste fatale sans erreur
  d’exécution antérieure, et observable comme diagnostic secondaire sinon.
