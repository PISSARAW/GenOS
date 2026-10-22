# Campagne SocialWorld avec Qwen

- Campagne: `socialworld-qwen-20261022`
- Branche: `codex/socialworld-qwen-campaign` sur `D:\GenOS\socialworld-qwen-campaign`
- Modèle ciblé: `ollama://qwen2.5:14b`
- Protocole: 28 scénarios; le protocole propose 20 graines et un intégrateur de 24 agents sur 1 000 cycles.
- Résultats: les fichiers `Sxx-*.json` de ce dossier sont les rapports source. Les échecs et réussites sont gardés dans l'historique Git.

## État vérifié

| Test | État | Preuve |
|---|---|---|
| S01 Identité sociale | Non exécuté | — |
| S02 Voisinage | Non exécuté | — |
| S03 Amitié | Non exécuté | — |
| S04 Famille | Non exécuté | — |
| S05 Relations affectives | Non exécuté | — |
| S06 Hiérarchie | Non exécuté | — |
| S07 Relations multiples | Réussi | `S07-result.json`, commit `06fbd41e` |
| S08 Inconnu et usurpation | Non exécuté | — |
| S09 Initiative sociale | Non exécuté | — |
| S10 Entraide | Non exécuté | — |
| S11 Reprise de contact | Non exécuté | — |
| S12 Silence intelligent | Non exécuté | — |
| S13 Réconciliation | Non exécuté | — |
| S14 Curiosité sociale | Non exécuté | — |
| S15 Unicast | Non exécuté | — |
| S16 Multicast sélectif | Non exécuté | — |
| S17 Broadcast / quorum | Non exécuté | — |
| S18 Stigmergie | Non exécuté | — |
| S19 Signaux zero-text | Non exécuté | — |
| S20 Communication structurée | Non exécuté | — |
| S21 Dialectes et langage | Non exécuté | — |
| S22 Communication humaine | Non exécuté | — |
| S23 Mémoire intermissions | Composant corrigé; preuve Qwen bloquée | échecs `S23-attempt-01.json`, `S23-attempt-02.json`, `S23-result.json` |
| S24 Évolution des relations | Non exécuté | — |
| S25 Transmission sociale | Non exécuté | — |
| S26 Pannes et reprise | Non exécuté | — |
| S27 Société mult topologique | Non exécuté | — |
| S28 Autonomie et robustesse (1 000 cycles) | Non exécuté | — |

## S23: diagnostic reproductible

Le premier passage a révélé que `crossAgentRelationalService` triait les relations par `created_at`, colonne absente de la table réelle. Le service trie maintenant par `updated_at` et utilise cette colonne comme repli pour `createdAt` (`8408fb69`). Les quatre suites ciblées de relations, autorité, cognition sociale et épistémologie ont passé après ce correctif.

Le runner de campagne a ensuite atteint Qwen mais le modèle a expiré pendant son préchauffage après 90 s puis 180 s. Une requête directe de huit tokens à l'API locale a également expiré après 60 s. Au constat, `ollama ps` signalait `qwen2.5-coder:32b` en état `Stopping...`; la RTX A4500 utilisait 19 692 MiB sur 20 470 MiB. Ces éléments indiquent un blocage/épuisement des ressources Ollama indépendant du scénario GenOS. Aucun arrêt forcé de ce processus n'a été effectué.

Tant que Qwen ne répond pas à l'API locale, S23 ne constitue pas une réussite de campagne. Le test déterministe de persistance devra aussi être capturé dans un rapport distinct d'un résultat LLM.
