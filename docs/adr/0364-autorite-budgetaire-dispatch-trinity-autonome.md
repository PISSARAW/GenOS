# ADR 0364 — Autorité budgétaire des dispatches Trinity autonomes

- **Statut** : Accepté et implémenté.
- **Date** : 2026-10-14.
- **Domaine** : Dispatch Trinity et réservations de budget modèle.

## Contexte

Le dispatch Trinity autonome crée son orchestrateur sans passer par le cycle
`missionPlanning.createMissionExecutionRun`. Or `missionModelBudgetScope.bindParent`
ne persiste une autorité que si un run parent existe et si les plafonds `tokens`
et `costUsd` sont fournis. Les workers étaient donc acceptés, puis bloqués au
premier appel modèle par `MISSION_MODEL_BUDGET_SCOPE_INVALID`. Le gate vérifie
intentionnellement le scope en base pour empêcher l'usurpation ; transmettre un
objet de scope non persisté contournerait cette garantie.

## Décision

Avant toute préparation ou tout lancement de worker, le dispatch Trinity exige
des plafonds `tokens` et `costUsd` strictement positifs. Il crée un run d'exécution
parent avec le contrat enregistré, puis appelle `bindParent` pour dériver et
persister le scope `execution-run:<runId>`. Un budget absent ou invalide échoue
immédiatement avec `TRINITY_BUDGET_REQUIRED`.

L'identifiant d'expérience Trinity est fixé avant le dispatch. Le run parent
conserve uniquement un éventuel `context.missionId` déjà fourni ; l'identifiant
d'expérience n'est pas assimilé à une mission GVX. Le scope persisté est transmis
dans le payload du worker, puis dans la mission normalisée du runtime. Chaque
worker garde son plafond d'exécution local ; les réservations mesurées continuent
de s'agréger sous le plafond partagé du parent. Le gate `assertPersisted` reste
l'autorité de validation à l'exécution.

## Conséquences

- Les appels modèle des workers d'un dispatch autonome peuvent réserver leur
  budget contre une autorité parent persistée.
- Une requête sans plafond monétaire ou token est refusée avant la création des
  workers, plutôt que de les laisser bloquer après leur démarrage.
- Le run parent peut exister même si un contrôle ultérieur du dispatch refuse la
  mission ; il fournit alors une trace planifiée, sans autoriser de dépense.
- Cette décision ne certifie ni la réussite de la mission ni la qualité de ses
  sorties ; les gates de preuve et de promotion restent inchangés.

## Vérification attendue

Les tests vérifient la persistance et la relecture du scope, son rattachement au
run parent, sa propagation dans le contrat de dispatch et le refus fail-closed
lorsque les plafonds sont absents.
