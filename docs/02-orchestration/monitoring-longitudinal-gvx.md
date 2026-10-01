# Monitoring longitudinal GVX

`backend/src/services/gvxLongitudinalMonitor.js` réutilise le moniteur somatique sur une
suite de fenêtres portant des `observationId` distincts et plusieurs `contextHash`. Une
fenêtre dont l'assessment rejette la transformation déclenche le rollback existant et
interrompt la suite.

Le résumé mesure la diversité des contextes, le taux de régression, la moyenne et la
variance du signal d'éligibilité, puis retourne `monitoring`, `rollback_recorded` ou
`mature_somatic_eligible`. Cette dernière valeur autorise seulement une revue de maturité;
elle n'effectue ni transfert germinal ni promotion automatique. L'intervalle de confiance
sur les métriques demeure à établir par des campagnes longitudinales.

Voir [ADR 0264](../adr/0264-monitoring-longitudinal-somatique.md).
