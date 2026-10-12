# ADR 0448 — Observer le coût modèle dans le reçu worker

- **Statut** : Accepté pour la liaison comptable ; apprentissage bout en bout différé.
- **Date** : 2026-10-12.
- **Lié à** : [ADR 0444](0444-execution-attestee-du-controleur-de-mission.md), [ADR 0445](0445-pont-preuve-mission-vers-apprentissage-routeur.md).

## Contexte

Le contrôleur actif appelle le routeur avec l'identité du run et de l'action.
Le routeur écrit une tentative modèle et son usage dans un journal. Le reçu
worker additionne seulement les mesures des événements du run. Ces deux
comptabilités n'étaient pas reliées. Une fixture associait une tentative 0/0 à
un reçu natif 0/0 après clôture ; cette égalité ne prouvait aucun appel modèle.

## Décision

Après un retour de modèle, le contrôleur relit la tentative persistée. Il
émet `MODEL_USAGE_OBSERVED` sur le run actif seulement si l'identité du run,
de l'action, du worker et du tenant concorde, si la tentative est terminée, et
si les comptes de tokens viennent du fournisseur. L'événement porte l'ID de
tentative, les tokens et le coût calculé avec le tarif enregistré. Le système
d'événements worker intègre cette mesure dans les métriques, le reçu et son
empreinte avant la clôture. Une observation refusée fait échouer l'action du
contrôleur ; un reçu déjà scellé ne peut pas être complété après coup.

Le pont vers le bandit exige désormais exactement une observation
`MODEL_USAGE_OBSERVED` correspondant à la tentative unique, en plus de
l'égalité des totaux, du journal d'action actif et de la preuve AEIS native.
Une ligne de journal ajoutée après clôture ne suffit plus à entraîner le
routeur.

## Limite de qualification

Les méthodes worker natives produisent actuellement la preuve d'oracle native
mais reçoivent un budget modèle de zéro token dans
`workerRuntimeLimitsService` et `missionPlanning`. Les workers avec un budget
modèle positif ne produisent pas cette preuve native dans le même run. Le
scénario complet modèle non nul → oracle natif → apprentissage bandit reste
donc inaccessible sans un nouveau protocole qui lie causalement le résultat
du modèle à une vérification indépendante. Cette décision ne relève pas le
plafond des workers natifs et ne signe pas de preuve de succès de substitution.

## Vérification

`test_mission_action_model_observation.js` vérifie l'identité et le refus des
usages estimés. `test_mission_model_worker_receipt.js` vérifie que huit tokens
et leur coût entrent dans le reçu scellé d'un worker de fixture, tandis que
le pont refuse l'apprentissage sans oracle natif. Le test natif du pont exige
maintenant l'observation réelle et refuse la fixture 0/0 ajoutée après
clôture. Ces tests n'établissent pas une économie de tokens ni une exécution
fournisseur externe.
