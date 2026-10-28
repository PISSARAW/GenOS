# A4 — audit « replay et journaling » — 2026-10-28

> Mise à jour ultérieure le 2026-10-28 : le constat ci-dessous est un audit
> historique réalisé avant l’intégration du journal natif décrite dans
> [le rapport E05](a4-harness-control-2026-10-28.md). Une tranche A4 runtime-native
> publique E05 a depuis été exécutée; elle ne change pas le protocole.

## Constat au moment de l’audit

A4 ne peut pas être exécutée comme une ablation G-CIR Ω enabled/disabled avec le runtime livré. Le runtime expose l'exécution d'un graphe et des handlers enregistrés; `executeState` initialise `receipts` et `proofDigests` en mémoire seulement, puis `execute` calcule un digest du résultat. Son API ne permet pas d'injecter ou de désactiver un journal, un store durable, ni un lecteur de replay. Un simple contrôle `createRuntime()` confirme les seules méthodes exposées: `execute` et `registerReader/Selector/Tool/Inferer/Verifier/Emitter`.

Le service GenOS `versionedCausalStateService` possède réellement des snapshots immuables, des transitions persistées en base et un replay avec reçu vérifié. Mais il exige une autorité d'exécution liée à un run et n'est pas appelé par le chemin G-CIR de l'expérience E05. Le brancher ici comparerait des systèmes d'état différents (runtime G-CIR en mémoire contre service causal GenOS), pas une seule caractéristique A4 activée/désactivée. Le réutiliser pour faire passer l'ablation serait un proxy non équivalent.

## Vérification sur E05

Sur les 100 scénarios E05 × trois répétitions, la condition C a produit 300/300 réponses conformes à l'oracle. Son chemin A/B/C/D exécute le handler de référence pour E05, sans métrique de replay ou preuve de journalisation. La baseline Temporal existante compte 300/300 `replay_verified: true`; cette preuve qualifie Temporal uniquement et ne fournit pas le contraste A4 G-CIR.

## État après l’audit

Le runtime expose maintenant une injection de journal SQLite et un chemin de reprise
des résultats complétés. Le rapport E05 lié ci-dessus compare le runtime en mémoire
au même runtime avec journal, après interruption, fermeture/réouverture SQLite et
rejeu. L’externalité de l’effet et l’interruption restent simulées; voir les limites
du rapport avant toute extrapolation à une panne réelle ou à un service externe.

## Sources de vérification

- `backend/src/services/cognitiveOmegaRuntimeService.js`: `executeState` (lignes 96–100), exécution en mémoire et digest (102–133), API du runtime (94–95).
- `backend/src/services/versionedCausalStateService.js`: snapshots persistés (`createRoot`, lignes 65–78), replay et reçus durables (`saveReplayReceipt`/`replay`, lignes 195–234), vérification de l'autorité d'exécution (`prepare`/`requireAuthority`).
- Artefacts générés hors Git: `results/C-gcir-optimized.jsonl`, `results/TEMPORAL-baseline.jsonl`; évaluateur public E05 sur C: 300/300 corrects. TEMPORAL: 300/300 replay vérifiés.
