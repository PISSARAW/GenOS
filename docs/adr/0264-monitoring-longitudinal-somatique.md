# ADR 0264 — Monitoring longitudinal de transformations somatiques

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : GVX, application somatique, régression, maturité
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0249, ADR 0253, ADR 0256

## Contexte

L'adaptation somatique possédait une application autorisée, une observation et un rollback
sur régression, mais aucune agrégation de fenêtres longitudinales indépendantes pour
différencier un gain stable d'un résultat ponctuel.

## Décision

`gvxLongitudinalMonitor.monitor` exige plusieurs fenêtres avec identifiants distincts et
au moins deux contextes. Il délègue chaque fenêtre au moniteur somatique existant, qui
continue de déclencher le rollback immédiat en cas de statut `reject`. La synthèse compte
les régressions, calcule la proportion d'outcomes recommandant l'essai somatique, la
variance de ce signal et la diversité des contextes. Elle inscrit les observations et le
résumé dans le ledger GVX. La maturation reste une éligibilité à examiner, pas une
promotion ou un passage automatique en germline.

## Conséquences

- Les améliorations doivent rester recommandées sur plusieurs contextes pour satisfaire
  le seuil configurable de stabilité.
- Le signal agrégé binaire ne remplace pas encore un intervalle de confiance sur les
  métriques sous-jacentes.
- Une campagne de réplication indépendante reste nécessaire avant une promotion.

## Alternatives

- Maturer après une fenêtre unique : rejeté, car cela confondrait un gain ponctuel et une
  amélioration stable.
- Reporter le rollback jusqu'à la fin des fenêtres : rejeté, car une régression grave doit
  rester un motif d'arrêt immédiat.
