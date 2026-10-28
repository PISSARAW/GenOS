# A4 — audit « replay et journaling » — 2026-10-28

## Résultat

A4 ne peut pas être exécutée comme une ablation G-CIR Ω enabled/disabled avec le runtime livré. Le runtime expose l'exécution d'un graphe et des handlers enregistrés; `executeState` initialise `receipts` et `proofDigests` en mémoire seulement, puis `execute` calcule un digest du résultat. Son API ne permet pas d'injecter ou de désactiver un journal, un store durable, ni un lecteur de replay. Un simple contrôle `createRuntime()` confirme les seules méthodes exposées: `execute` et `registerReader/Selector/Tool/Inferer/Verifier/Emitter`.

Le service GenOS `versionedCausalStateService` possède réellement des snapshots immuables, des transitions persistées en base et un replay avec reçu vérifié. Mais il exige une autorité d'exécution liée à un run et n'est pas appelé par le chemin G-CIR de l'expérience E05. Le brancher ici comparerait des systèmes d'état différents (runtime G-CIR en mémoire contre service causal GenOS), pas une seule caractéristique A4 activée/désactivée. Le réutiliser pour faire passer l'ablation serait un proxy non équivalent.

## Vérification sur E05

Sur les 100 scénarios E05 × trois répétitions, la condition C a produit 300/300 réponses conformes à l'oracle. Son chemin A/B/C/D exécute le handler de référence pour E05, sans métrique de replay ou preuve de journalisation. La baseline Temporal existante compte 300/300 `replay_verified: true`; cette preuve qualifie Temporal uniquement et ne fournit pas le contraste A4 G-CIR.

## Décision de campagne

Ne pas inscrire A4 comme exécutée et ne pas utiliser les résultats Temporal comme résultat d'ablation. A4 reste non mesurée jusqu'à ce que le runtime expose un journal/replay commutable, ou jusqu'à l'approbation d'un changement explicite du protocole qui redéfinit A4 comme comparaison entre systèmes. Aucun résultat artificiel n'a été généré.

## Sources de vérification

- `backend/src/services/cognitiveOmegaRuntimeService.js`: `executeState` (lignes 96–100), exécution en mémoire et digest (102–133), API du runtime (94–95).
- `backend/src/services/versionedCausalStateService.js`: snapshots persistés (`createRoot`, lignes 65–78), replay et reçus durables (`saveReplayReceipt`/`replay`, lignes 195–234), vérification de l'autorité d'exécution (`prepare`/`requireAuthority`).
- Artefacts générés hors Git: `results/C-gcir-optimized.jsonl`, `results/TEMPORAL-baseline.jsonl`; évaluateur public E05 sur C: 300/300 corrects. TEMPORAL: 300/300 replay vérifiés.
