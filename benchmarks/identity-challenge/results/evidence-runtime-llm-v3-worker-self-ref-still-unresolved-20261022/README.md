# Échec persistant C après autorisation de worker_self

Le reçu v3.1 confirme `allowedEvidenceRefs: ["mission", "worker_self"]`, `includedWorkerSelf: true`, et la valeur `calibratedConfidencePercent: 58`. Le modèle a terminé une vraie inférence, mais a encore répondu `outcome: unresolved`, `uncertainties: ["confidence_percent"]`. Oracle : échec.

Le premier correctif de provenance n’a donc pas suffi. La sortie prouve que GenOS a présenté le bras complet, mais le comportement LLM ne démontre toujours pas l’usage de la confiance; l’input exact envoyé au routeur doit être inspecté avant un autre patch.

Rapport brut : `runtime-llm-1792702358854.json`.
