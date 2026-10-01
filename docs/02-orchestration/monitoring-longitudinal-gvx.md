# Monitoring longitudinal GVX

`backend/src/services/gvxLongitudinalMonitor.js` réutilise le moniteur somatique sur une
suite de fenêtres portant des `observationId` distincts et plusieurs `contextHash`. Une
fenêtre dont l'assessment rejette la transformation déclenche le rollback existant et
interrompt la suite.

Le résumé mesure la diversité des contextes, le taux de régression, la moyenne et la
variance du signal d'éligibilité et calcule un intervalle t de Student à 95 % pour chaque
métrique ayant au moins deux deltas. Avec moins de deux fenêtres mesurées, les bornes sont
nulles et le statut reste `insufficient_samples`. Le résumé retourne ensuite `monitoring`,
`rollback_recorded` ou `mature_somatic_eligible`. Cette dernière valeur autorise seulement
une revue de maturité; elle n'effectue ni transfert germinal ni promotion automatique. Les
petits échantillons restent peu précis; les campagnes doivent valider les métriques et les
fenêtres pertinentes.

Voir [ADR 0264](../adr/0264-monitoring-longitudinal-somatique.md).
