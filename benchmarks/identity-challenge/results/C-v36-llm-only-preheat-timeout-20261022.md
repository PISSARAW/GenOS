# Défi C v3.6 — timeout de préchauffage avant le bras llm_only

Commande du lot : `node benchmarks/identity-challenge/runtime-llm.cjs --model qwen2.5:14b --scenario C --arm llm_only --repeats 1 --timeout 300`.

Résultat : code de sortie 1 avant dispatch; le préchauffage Ollama `qwen2.5:14b` a expiré après 180 s. `/api/ps` montrait le modèle concurrent `qwen2.5-coder:32b` chargé et son échéance se renouvelait. Aucun reçu ni aucune inférence n'a été produit pour ce bras par cette tentative. Aucun modèle n'a été déchargé ou interrompu.

Ce timeout opérationnel est distinct du run `self_model_masked`, qui avait été dispatché et dont la réponse mal formée est archivée dans `C-v35-masked-malformed-output-20261022.md`.
