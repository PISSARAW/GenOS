# Échec du smoke test — préchauffage Ollama (2026-10-22)

Commande : `node benchmarks/identity-challenge/runtime-llm.cjs --model qwen2.5:14b --scenario A --arm genos_full --repeats 1 --timeout 120`.

Le processus `ollama` répondait et `/api/tags` confirmait que `qwen2.5:14b` était installé avec le digest attendu `7cdf5a0187d5c58cc5d369b255592f7841d1c4696d45a8c8a9489440385b22f6`. `/api/ps` montrait `nemotron3:33b` chargé, sans `qwen2.5:14b`. Le smoke test n’a créé aucune mission; il a échoué dans `preheat()` après l’attente maximale.

Sortie observée :

```text
Error: Ollama preheat failed: undefined
    at preheat (D:\GenOS\identity-real-llm-worktree\benchmarks\identity-challenge\runtime-llm.cjs:37:34)
    at main (D:\GenOS\identity-real-llm-worktree\benchmarks\identity-challenge\runtime-llm.cjs:173:3)
```

L’erreur prouve le blocage du préchauffage, pas sa cause physique. Le message `undefined` montre que le runner n’expose ni le statut ni le corps d’erreur renvoyé par `spawnSync`; il sera corrigé avant tout nouvel essai.
