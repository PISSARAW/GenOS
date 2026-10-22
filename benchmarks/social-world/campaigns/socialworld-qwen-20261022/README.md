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
| S09 Initiative sociale | R�ussi avec Qwen 2.5 14B apr�s correctif | `S09-attempt-01.json` (�chec), `S09-result.json`; source `6d691034` |
| S10 Entraide | R�ussi avec Qwen 2.5 14B | `S10-result.json`; source `346cc396` |
| S11 Reprise de contact | R�ussi avec Qwen 2.5 14B; premier essai expir� | `S11-attempt-01.json` (timeout), `S11-result.json`; source `c96ae085` |
| S12 Silence intelligent | R�ussi avec Qwen 2.5 14B apr�s correctif | `S12-result.json`; source `6d691034` |
| S13 R�conciliation | R�ussi avec Qwen 2.5 14B; premier essai expir� | `S13-attempt-01.json` (timeout), `S13-result.json`; source `58643b93` |
| S14 Curiosité sociale | Non exécuté | — |
| S15 Unicast | Non exécuté | — |
| S16 Multicast sélectif | Non exécuté | — |
| S17 Broadcast / quorum | Non exécuté | — |
| S18 Stigmergie | Non exécuté | — |
| S19 Signaux zero-text | Non exécuté | — |
| S20 Communication structurée | Non exécuté | — |
| S21 Dialectes et langage | Non exécuté | — |
| S22 Communication humaine | Non exécuté | — |
| S23 Mémoire intermissions | Réussi avec GenOS et Qwen 2.5 14B | `S23-genos-result.json`, `S23-result.json`; source `faf11840` |
| S24 Évolution des relations | Non exécuté | — |
| S25 Transmission sociale | Non exécuté | — |
| S26 Pannes et reprise | Non exécuté | — |
| S27 Société mult topologique | Non exécuté | — |
| S28 Autonomie et robustesse (1 000 cycles) | Non exécuté | — |

## S23: diagnostic reproductible

Le premier passage a révélé que `crossAgentRelationalService` triait les relations par `created_at`, colonne absente de la table réelle. Le service trie maintenant par `updated_at` et utilise cette colonne comme repli pour `createdAt` (`8408fb69`). Les quatre suites ciblées de relations, autorité, cognition sociale et épistémologie ont passé après ce correctif.

Le runner de campagne a ensuite atteint Qwen mais le modèle a expiré pendant son préchauffage après 90 s puis 180 s. Une requête directe de huit tokens à l'API locale a également expiré après 60 s. Au constat, `ollama ps` signalait `qwen2.5-coder:32b` en état `Stopping...`; la RTX A4500 utilisait 19 692 MiB sur 20 470 MiB. Ces éléments indiquent un blocage/épuisement des ressources Ollama indépendant du scénario GenOS. Aucun arrêt forcé de ce processus n'a été effectué.

Le run complet a réussi avec Qwen 2.5 14B au commit source `faf11840`. Qwen a recopié exactement la relation, son orientation et l'historique partagé exposés par GenOS, sans consigne humaine après la configuration. Le runner Ollama Qwen Coder 32B qui bloquait le chargement a été arrêté après autorisation de l'utilisateur.




## S09: initiative sociale

Le premier essai a d�pos� le fait dans la stigmergie sans destinataire. Le correctif �value maintenant l'audience experte et ses relations avant le repli stigmergique, applique l'urgence born�e port�e par l'�v�nement, et inclut les destinataires dans le re�u du checkpoint. Le run post-correctif a livr� en unicast � `agent-b`, ami et expert du domaine qui ne connaissait pas la r�f�rence `fact:storm-route-7`; Qwen a reproduit exactement action, destinataire et r�f�rence. S12 a �t� rejou� sur le m�me commit et confirme le silence lorsque la r�f�rence est absente.

## S11: reprise de contact

Le premier essai a expir� pendant la requ�te Qwen alors que Qwen Coder 32B avait repris presque toute la VRAM. Apr�s arr�t autoris� du mod�le bloqu� et am�lioration du rapport d'erreur, le run complet a r�ussi: l'�v�nement d'�ch�ance `HANDOFF_REQUESTED` a d�clench� un unicast au collaborateur pr�c�dent, avec la r�f�rence de suivi exacte. Qwen a reproduit la d�cision.
