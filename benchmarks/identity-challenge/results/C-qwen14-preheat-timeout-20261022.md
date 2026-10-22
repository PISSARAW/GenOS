# Échec de préchauffage du rerun C — 2026-10-22

Worktree : `codex/identity-real-llm-isolated` sur D:\GenOS\identity-real-llm-isolated.
Commande : `node benchmarks/identity-challenge/runtime-llm.cjs --model qwen2.5:14b --scenario C --arm genos_full --repeats 1 --timeout 300`.

Résultat : échec avant lancement de la mission, code de sortie 1. Le préchauffage Ollama de `qwen2.5:14b` a expiré après 180 s (`AbortSignal.timeout(180000)`). L’API `/api/ps` montrait toujours `qwen2.5-coder:32b` chargé et son échéance se renouvelait pendant le préchauffage. Aucune inférence C ni aucun reçu de traitement n’a été produit par cette tentative.

Le modèle 32B appartient à une activité concurrente; il n’a pas été déchargé ni interrompu. Ce résultat est une indisponibilité opérationnelle du modèle préenregistré, pas un résultat comportemental.
