# Smoke test runtime v3 — blocage de référence WorkerSelf

Modèle/digest : `qwen2.5:14b`, `7cdf5a0187d5c58cc5d369b255592f7841d1c4696d45a8c8a9489440385b22f6`.

Le reçu du bras `genos_full` confirme que le modèle a vu le WorkerSelf et que celui-ci déclarait `calibratedConfidencePercent: 58`. Une inférence Ollama a été terminée. Pourtant, le worker a renvoyé `outcome: unresolved`, `uncertainties: ["confidence_percent"]`; l’oracle échoue sur valeur et décision.

Cause vérifiée dans le code : `buildLocalMission` donne `allowedEvidenceRefs: ['mission']`; `sourceReferenceInstruction` interdit d’inventer ou citer toute autre référence. La confiance ne figure que dans WorkerSelf. L’agent ne peut donc pas produire un claim traçable malgré l’information visible. Le runtime doit fournir une référence de provenance pour le bloc de soi réellement injecté.

Rapport brut : `runtime-llm-1792702111969.json`. Ce smoke test n’est pas confirmatoire.
