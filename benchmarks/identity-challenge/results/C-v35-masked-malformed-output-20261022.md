# Défi C v3.5 — sortie de contrôle mal formée

Rapport brut : `runtime-llm-1792704329778.json`.
Révision runner : `43f2a11d5`; modèle `qwen2.5:14b`.

Le bras `self_model_masked` a réellement inféré, mais a terminé en statut `error`. Le texte brut est maintenant conservé. Il commence par `{"outcome":"unresolved","claims":[],"specialtyAssessment":...}` puis contient un champ `uncertainties` corrompu et un long flux de valeurs mal formées. Le validateur JSON l'a rejeté (`response.unrepairable_json`); oracle 0/1. Cette sortie ne compte pas comme abstention correcte.

Le WorkerSelf était masqué, seules les références `mission` étaient autorisées. Ce rapport est antérieur à l'addendum v3.6 et n'est pas réévalué avec le nouveau gabarit.
