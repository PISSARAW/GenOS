# Monitoring longitudinal GVX

`backend/src/services/gvxLongitudinalMonitor.js` réutilise le moniteur somatique sur une
suite de fenêtres portant des `observationId` distincts et plusieurs `contextHash`. Une
fenêtre dont l'assessment rejette la transformation déclenche le rollback existant et
interrompt la suite.

Le résumé mesure la diversité des contextes, le taux de régression, la moyenne et la
variance du signal d'éligibilité et calcule un intervalle à 95 % pour chaque métrique ayant
au moins deux deltas. Il utilise les quantiles t tabulés jusqu’à 10 degrés de liberté ;
au-delà, il conserve le quantile à 10 degrés de liberté, plus conservateur. Avec moins de deux fenêtres mesurées, les bornes
sont nulles et le statut reste `insufficient_samples`. Le résumé retourne ensuite `monitoring`,
`rollback_recorded`, `rollback_failed` ou `mature_somatic_eligible`. Cette dernière valeur autorise seulement
une revue de maturité; elle n'effectue ni transfert germinal ni promotion automatique. Les
petits échantillons restent peu précis; les campagnes doivent valider les métriques et les
fenêtres pertinentes. L'intervalle n'établit pas l'indépendance des fenêtres, la calibration
des mesures ni la validité causale du changement.

## Suivi sur le chemin standard

Le profil AGOW impose au moins trois conditions à contextes distincts. Chaque fenêtre compare de nouveau parent et candidat et lie ses preuves à l’application et à son `observationId`. Avant et après les mesures, le service externe vérifie l’opération appliquée et la politique courante dans la base runtime en lecture seule. `gvx-longitudinal-assessment-v1` recoupe les assessments signés avant toute émission de crédit.

Une régression déclenche la restauration autorisée du parent exact et interrompt le crédit. Un rollback en échec conserve le statut `rollback_failed` et reste reprenable ; une restauration réussie donne `rollback_recorded`. Une interruption réutilise les observations déjà enregistrées sans les attribuer à une autre fenêtre ou application.

Les trois fenêtres d’une application produisent au plus un reçu de développement. La consolidation AGOW requiert séparément trois reçus réussis distincts pour une voie et un contexte. Des contextes distincts ne prouvent pas l’indépendance statistique des tâches.

Voir [ADR 0264](../adr/0264-monitoring-longitudinal-somatique.md), [profil standard](profil-execution-gvx.md) et [validation fonctionnelle](../06-qualite-preuves/validation-cycle-standard-gvx.md).
