# ADR 0018 — Exécution cognitive via le client MCP

## Statut

Proposé — première étape du mode `caller_mcp`. Suivi par l'[ADR 0036](0036-harness-compatibility-layer.md)
qui généralise la séparation au niveau harness (Harness Compatibility Layer).

## Contexte

GenOS possède les identités, contrats, budgets, leases, capsules, workers,
barrières de preuve et décisions de promotion. Le modèle de langage est fourni
par un runtime externe. Le mode historique choisit Codex ou un modèle local
depuis le backend, même lorsqu'une mission est lancée par un client MCP.

Cette séparation empêche de garantir que le LLM du client appelant est celui de
l'orchestrateur et de ses workers.

## Décision

Introduire un executor explicite `caller_mcp`. Ce mode signifie que le client
MCP connecté fournit la génération cognitive, tandis que GenOS reste l'autorité
sur l'identité, l'orchestration, les budgets, les outils, l'isolation, la
provenance et la promotion.

Les modes `codex` et `local` restent disponibles pour compatibilité. Aucun
fallback implicite depuis `caller_mcp` vers ces modes ne sera autorisé.

Le provider (`codex`, `gemini`, `claude`, etc.) est une information de
provenance ; il ne confère aucun droit supplémentaire et ne remplace pas
l'identité GenOS de l'agent.

## Invariants

- Un worker ne peut pas créer d'orchestrateur.
- Le provider cognitif est propagé de l'orchestrateur aux workers.
- Les appels d'outils restent soumis aux leases et au contrôle du backend.
- Une réponse transportée avec succès n'est pas une preuve de décision valide.
- L'absence de capacité de sampling ou de callback est un blocage explicite.
- Toute génération doit être corrélée à un agent, un contrat, un budget et une
  exécution.

## Conséquences

Le serveur MCP devra négocier une capacité de génération (MCP Sampling ou
adaptateur équivalent) et exposer un canal corrélé au runtime GenOS. Les
missions existantes conservent leur comportement tant que `caller_mcp` n'est
pas demandé.
# Retour de validation opérationnelle (18 septembre 2026)

Le chemin `caller_mcp` réutilise désormais le prompt et la validation des rapports
du runtime commun plutôt que de transformer toute réponse en succès. Les workers
héritent de l'exécuteur sans revue ni génération locale silencieuse. Le relais
opérateur `mcp/callerSession.mjs` permet de tester réellement le protocole Sampling
avec l'hôte LLM et une entrée interactive ouverte.

Le test littéraire a obtenu une synthèse persistée et des influences vérifiées,
mais la couverture d'outils reste incomplète. Le jeton loopback partagé n'est pas
une capacité infalsifiable par agent : ne pas revendiquer une isolation de sécurité
entre processus locaux hostiles. Voir la référence d'exécution cognitive pour
les limites, les commandes et les observations exactes.

