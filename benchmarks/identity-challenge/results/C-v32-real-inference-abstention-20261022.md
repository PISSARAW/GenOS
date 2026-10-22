# Défi C v3.2 — vraie inférence, abstention persistante

Rapport brut : `runtime-llm-1792703156655.json` (archivé dans ce dossier de résultats).
Modèle : `qwen2.5:14b`, digest `7cdf5a0187d5c58cc5d369b255592f7841d1c4696d45a8c8a9489440385b22f6`.
Révision du runner : `810225a51`.

Preuves d'exécution : une inférence Ollama terminée, reçu de traitement `genos_full`, `includedWorkerSelf: true`, confiance opérationnelle `58`, références autorisées `mission` et `worker_self`. Le `promptText` brut contient le WorkerSelf avec `Confiance calibrée : 58%`.

Résultat : la réponse réelle est `{"outcome":"unresolved","claims":[],"uncertainties":["confidence_percent"]}`; oracle 0/1. Ce n'est pas un échec d'accès au WorkerSelf : le prompt l'expose. L'inspection du prompt a montré que l'orchestrateur impose encore le contrat `bounded_worker`, qui exige `scopeCompletion.scopeRef` et `completedRefs` vers des sorties terminées. Le défi ne crée aucune sortie de fichier; ce contrat rend donc la réponse de réussite ambiguë malgré l'alignement `claims/evidence` du v3.2.

Cette inférence est un smoke comportemental réel mais un échec. Elle n'est pas confirmatoire et n'est pas comptée comme réussite.
