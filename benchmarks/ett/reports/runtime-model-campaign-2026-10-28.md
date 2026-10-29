# Campagne ETT runtime modèle — 2026-10-28

## Verdict

Le runner a exécuté une campagne modèle réelle avec Ollama, puis s'est arrêté proprement sur la réserve du plafond de tokens par appel. Le reçu est **partiel** et ne qualifie pas ETT : `scientificClaimAllowed` vaut `false`. Aucun classement comparatif ni effet causal n'est conclu.

## Configuration demandée

- Protocole d'action runtime v3, reçu `genos.ett-runtime-campaign/v4`.
- Modèle commun : `ollama://qwen2.5-coder:7b`.
- Tous les 12 scénarios, leurs trois niveaux et 30 seeds.
- 13 conditions : GenOS `full`, contrôle planifié, cinq conditions ablatées (`curiosity_ablated`, `shev_initiative_ablated`, `agow_arbitration_ablated`, `metacognition_ablated`, `memory_ablated`), LLM seul et cinq politiques concurrentes (`react_classic`, `periodic_llm_loop`, `voyager_adapted`, `ai_scientist_v2_adapted`, `darwin_godel_machine_adapted`).
- Plafond global : 250 000 tokens mesurés.
- Taille de matrice attendue : 14 040 enregistrements.

## Couverture et mesures observées

Le reçu contient 156 enregistrements : un seed (1001) pour chacun des niveaux simple, difficile et ouvert des quatre scénarios prioritaires ETT-01 à ETT-04, sous les 13 conditions. ETT-05 à ETT-12 et les 29 autres seeds ne sont pas exécutés. Le résultat ne représente donc qu'une petite partie de la matrice prévue.

| Mesure | Valeur |
| --- | ---: |
| Enregistrements complétés | 156 / 14 040 |
| Scénarios couverts | ETT-01 à ETT-04 (4 / 12) |
| Niveaux couverts | Simple, difficile, ouvert |
| Seeds couverts | 1 / 30 (seed 1001) |
| Conditions couvertes sur ces cas | 13 / 13 |
| Appels fournisseur mesurés | 528 |
| Tokens mesurés | 239 766 / 250 000 |
| Statut | `partial_campaign_token_budget_reached` |
| Motif d'arrêt | `token_budget_case_reserve_reached` |
| Appel en attente à l'arrêt | Aucun |

Le journal JSONL a été rejoué après l'arrêt : ses 528 réponses totalisent 239 766 tokens, en accord exact avec le reçu. Le runner n'a pas dépassé le budget; il a refusé de démarrer un appel dont la réserve estimée n'entrait plus dans le solde disponible.

## Incidents et reprises

1. Une première tentative a échoué car `D:\` ne pouvait pas être utilisé comme dossier de sortie. Une tentative suivante a atteint Ollama, mais le serveur local renvoyait HTTP 500 : `llama-server.exe` manquait dans l'installation.
2. Le programme d'installation officiel Ollama a confirmé la signature de l'éditeur. La réparation sur C: a échoué faute d'espace disque et a annulé l'installation. La réinstallation vers D: a réussi; le serveur et la disponibilité des modèles ont ensuite été vérifiés.
3. Après 291 appels (129 909 tokens), Windows a temporairement refusé le renommage atomique du reçu (`EPERM`). Le journal d'usage contenait les réponses mesurées; la reprise les a réconciliées avant de continuer. Le runner réessaie maintenant les erreurs transitoires `EPERM`, `EBUSY` et `EACCES` pendant deux secondes au maximum. Les actions exécutées après le dernier enregistrement checkpointé ont pu être rejouées; leur dépense antérieure est restée incluse dans le compteur global.
4. L'option `--resume` prend le chemin du reçu en argument. La reprise a été relancée avec la grammaire correcte et le même plafond total de 250 000 tokens.

## Adaptateurs et portée des comparaisons

Les politiques Voyager, AI Scientist v2 et Darwin Gödel Machine sont des adaptateurs locaux documentés exécutés avec le même modèle; les implémentations originales et leurs évaluations natives ne sont pas incluses. Ces résultats ne doivent pas être présentés comme une reproduction des systèmes originaux. Les ablations ne couvrent qu'un seed des quatre scénarios prioritaires.

Les seuils ETT-L1 à ETT-L5 restent non qualifiés. Le protocole demande notamment plusieurs seeds, des oracles indépendants, une évaluation tenue à l'écart et une analyse statistique appariée. Le reçu partiel ne satisfait pas ces exigences.

## Artefacts et intégrité

Les artefacts bruts sont conservés dans `benchmarks/ett/reports/` dans le workspace; les reçus et journaux machine sont des sorties générées et ne sont pas inclus dans le commit documentaire.

- Reçu : `runtime-v4-full-30seed-launch-02.json`
- Journal : `runtime-v4-full-30seed-launch-02.json.usage.jsonl`
- SHA-256 reçu : `1bbcbfdbb0d4356399b0aef61f2d6dcdf05da8ee1c950b042ce84a53c3a14c83`
- SHA-256 journal : `816a483fd522b4b67af80e75e5333910653ff2beb24ae30547c0180a992db5f5`

## Vérifications ciblées

- `node benchmarks/ett/tests/test_campaign_budget_guard.js` — réussi.
- `node benchmarks/ett/tests/test_runtime_campaign.js` — réussi, y compris le test de reprise après `EPERM` transitoire.
- Porte qualité des changements ETT avant commit — zéro nouvelle violation.
- La réconciliation finale confirme un reçu terminal sans appel en attente et l'égalité des compteurs avec le journal.
