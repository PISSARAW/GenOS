# Campagne SocialWorld avec Qwen

- Campagne: `socialworld-qwen-20261022`
- Branche: `codex/socialworld-qwen-campaign` sur `D:\GenOS\socialworld-qwen-campaign`
- Modèle ciblé: `ollama://qwen2.5:14b`
- Protocole: 28 scénarios; le protocole propose 20 graines et un intégrateur de 24 agents sur 1 000 cycles.
- Résultats: les fichiers `Sxx-*.json` de ce dossier sont les rapports source. Les échecs et réussites sont gardés dans l'historique Git.

## État vérifié

| Test | État | Preuve |
|---|---|---|
| S01 Identité sociale | Réussi avec Qwen 2.5 14B; relations, identités et directions exactes sans ajout | `S01-result.json`; source `8189bcf8` |
| S02 Voisinage | Réussi avec Qwen 2.5 14B, graine 8; déménagement recalcule les voisins depuis les positions | `S02-result.json`, `S02-attempt-*.json`; source `318a3d7d` |
| S03 Amitié | Réussi avec Qwen 2.5 14B; l’ami rappelle l’événement partagé, l’inconnu reste stranger | S03-result.json; source 62e262cb |
| S04 Famille | Réussi avec Qwen 2.5 14B; parents, générations, fratrie, jumeau et enfant orientés exacts | S04-result.json; source 7b27471f |
| S05 Relations affectives | Réussi avec Qwen 2.5 14B; changement partner→friend, divulgation réduite, aucun sentiment ou privilège privé inféré | S05-result.json; source e85c520e |
| S06 Hiérarchie | Réussi avec Qwen 2.5 14B; manager reconnu, contrôle refusé sans délégation explicite | S06-attempt-01.json (timeout), S06-result.json; source ce6e9222 |
| S07 Relations multiples | Réussi | `S07-result.json`, commit `06fbd41e` |
| S08 Inconnu et usurpation | Réussi avec Qwen 2.5 14B, graine 9; signature modifiée rejetée, aucun privilège accordé | S08-attempt-01/02.json, S08-result.json; source a4b5ba14 |
| S09 Initiative sociale | Reussi avec Qwen 2.5 14B apres correctif | `S09-attempt-01.json` (echec), `S09-result.json`; source `6d691034` |
| S10 Entraide | Reussi avec Qwen 2.5 14B | `S10-result.json`; source `346cc396` |
| S11 Reprise de contact | Reussi avec Qwen 2.5 14B; premier essai expire | `S11-attempt-01.json` (timeout), `S11-result.json`; source `c96ae085` |
| S12 Silence intelligent | Reussi avec Qwen 2.5 14B apres correctif | `S12-result.json`; source `6d691034` |
| S13 Reconciliation | Reussi avec Qwen 2.5 14B; premier essai expire | `S13-attempt-01.json` (timeout), `S13-result.json`; source `58643b93` |
| S14 Curiosite sociale | Reussi avec Qwen 2.5 14B | `S14-result.json`; source `ac368cc9` |
| S15 Unicast | Reussi avec Qwen 2.5 14B; C exclu | `S15-attempt-01.json`, `S15-attempt-02.json` (timeouts), `S15-result.json`; source `56a8a509` |
| S16 Multicast selectif | Reussi avec Qwen 2.5 14B; D exclu | `S16-attempt-01.json` (predicat du runner), `S16-result.json`; source `916d25e1` |
| S17 Broadcast / quorum | Reussi avec Qwen 2.5 14B; A exclu, quorum B/C acquitte | `S17-result.json`, `S17-*.json` (echec fixture); source `cace91f1` |
| S18 Stigmergie | Reussi avec Qwen 2.5 14B; pheromone persistee, lue et provenance verifiee | `S18-result.json`, premier echec conserve; source `aa7ac626` |
| S19 Signaux zero-text | Reussi avec Qwen 2.5 14B; ligand declenche cascade sans contenu textuel | `S19-result.json`; source `7b3439f4` |
| S20 Communication structurée | Réussi avec Qwen 2.5 14B; enveloppe vérifiée, falsification rejetée | `S20-result.json`; source `456f32fb` |
| S21 Dialectes et langage | Reussi avec Qwen 2.5 14B; symbole versionne decode, terme inconnu dirige vers fallback | `S21-result.json`; source `315bb1fd` |
| S22 Communication humaine | Reussi avec Qwen 2.5 14B; relais limite au perimetre explicitement approuve | `S22-result.json`; source `04b14d21` |
| S23 Mémoire intermissions | Réussi avec GenOS et Qwen 2.5 14B | `S23-genos-result.json`, `S23-result.json`; source `faf11840` |
| S24 Évolution des relations | Réussi | Qwen 14B: confiance calculée sur cinq évaluations vérifiées et abaissée après trois échecs; `S24-result.json` (`07c526a8`) |
| S25 Transmission sociale | Réussi | Qwen 14B, deux sauts friend→neighbor, chaîne de provenance vérifiée, doublon dédupliqué et rumeur rejetée; `S25-result.json` (graine 9) |
| S26 Pannes et reprise | Réussi | Qwen 14B, réveil non autorisé refusé, état persistant restauré après signal autorisé et message antérieur vérifié conservé; S26-result.json |
| S27 Société multi-topologique | Réussi | Qwen 14B, 19 organisations et 19 sorties topologiques, comportements spécialisés et quorum vérifiés; S27-result.json (graine 8) |
| S28 Autonomie et robustesse (1 000 cycles) | Réussi, 20/20 graines | Qwen 14B, 24 agents × 1 000 cycles, 4 000 étapes topologiques par graine, 9 chocs récupérés à chaque fois; `S28-summary.json` et `S28-seed-*-result.json` |

## S23: diagnostic reproductible

Le premier passage a révélé que `crossAgentRelationalService` triait les relations par `created_at`, colonne absente de la table réelle. Le service trie maintenant par `updated_at` et utilise cette colonne comme repli pour `createdAt` (`8408fb69`). Les quatre suites ciblées de relations, autorité, cognition sociale et épistémologie ont passé après ce correctif.

Le runner de campagne a ensuite atteint Qwen mais le modèle a expiré pendant son préchauffage après 90 s puis 180 s. Une requête directe de huit tokens à l'API locale a également expiré après 60 s. Au constat, `ollama ps` signalait `qwen2.5-coder:32b` en état `Stopping...`; la RTX A4500 utilisait 19 692 MiB sur 20 470 MiB. Ces éléments indiquent un blocage/épuisement des ressources Ollama indépendant du scénario GenOS. Aucun arrêt forcé de ce processus n'a été effectué.

Le run complet a réussi avec Qwen 2.5 14B au commit source `faf11840`. Qwen a recopié exactement la relation, son orientation et l'historique partagé exposés par GenOS, sans consigne humaine après la configuration. Le runner Ollama Qwen Coder 32B qui bloquait le chargement a été arrêté après autorisation de l'utilisateur.




## S09: initiative sociale

Le premier essai a d�pos� le fait dans la stigmergie sans destinataire. Le correctif �value maintenant l'audience experte et ses relations avant le repli stigmergique, applique l'urgence born�e port�e par l'�v�nement, et inclut les destinataires dans le re�u du checkpoint. Le run post-correctif a livr� en unicast � `agent-b`, ami et expert du domaine qui ne connaissait pas la r�f�rence `fact:storm-route-7`; Qwen a reproduit exactement action, destinataire et r�f�rence. S12 a �t� rejou� sur le m�me commit et confirme le silence lorsque la r�f�rence est absente.

## S11: reprise de contact

Le premier essai a expir� pendant la requ�te Qwen alors que Qwen Coder 32B avait repris presque toute la VRAM. Apr�s arr�t autoris� du mod�le bloqu� et am�lioration du rapport d'erreur, le run complet a r�ussi: l'�v�nement d'�ch�ance `HANDOFF_REQUESTED` a d�clench� un unicast au collaborateur pr�c�dent, avec la r�f�rence de suivi exacte. Qwen a reproduit la d�cision.







