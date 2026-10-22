# Échec du préchauffage — modèle concurrent chargé (2026-10-22)

Commande : `node benchmarks/identity-challenge/runtime-llm.cjs --model qwen2.5:14b --scenario C --arm genos_full --repeats 1 --timeout 120`.

Aucun agent n’a été dispatché. Après 180 secondes, `preheat()` a échoué avec `TimeoutError: The operation was aborted due to timeout`. Pendant ce délai, `/api/ps` montrait `qwen2.5-coder:32b` chargé. Le modèle cible `qwen2.5:14b` n’a pas répondu au préchauffage avant l’échéance.

La trace établit une collision de capacité temporelle avec un autre modèle chargé; elle ne permet pas de conclure qu’il faut décharger ce modèle. Aucune génération n’a été interrompue et aucun résultat de mission n’est compté. Le prochain run attendra que le modèle concurrent soit inactif/déchargé ou utilisera un protocole explicitement réenregistré pour un modèle disponible.
