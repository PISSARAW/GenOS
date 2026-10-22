# Addendum préconfirmatoire v3.5 — conserver les sorties rejetées

Date : 2026-10-22, avant la relance des contrôles C.

Les contrôles C v3.4 ont terminé leur inférence mais leur réponse a été rejetée par la validation JSON, et le runner ne conservait pas le texte généré. Le chemin d'échec ajoute désormais un extrait du texte brut aux diagnostics `AGENT_FAILED` et le runner le réutilise dans le rapport. L'oracle C refuse également tout statut worker `error`; le bras complet exige `completed`, et les bras de contrôle peuvent réussir uniquement par la réponse d'abstention valide préenregistrée.

Les critères substantiels de l'oracle, les traitements, le modèle et les tâches ne changent pas. Les anciennes réponses non conservées restent des échecs non mesurables; elles ne sont pas réétiquetées.
