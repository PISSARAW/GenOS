# A4 — contrôle journal/replay au niveau du banc — 2026-10-28

## Portée

Ce contrôle expérimental ne prétend pas mesurer une fonction native de G-CIR Ω. Il compare deux bras appariés qui appellent le même adaptateur C et le même runtime G-CIR sur E05. Le bras contrôle exécute chaque entrée une fois sans persistance. Le bras journal exécute l'entrée, ajoute un enregistrement entrée/sortie JSONL, demande `fsync` sur le fichier, relit l'enregistrement exact, vérifie ses empreintes, puis réexécute l'entrée relue via le même adaptateur. Toute différence de sortie arrête le run.

## Résultats

| Bras | Exécutions | Oracle correctes | Sorties égales entre bras | Latence médiane |
| --- | ---: | ---: | ---: | ---: |
| A4_CONTROL — C sans journal | 300 | 300/300 | — | 1,72 ms |
| A4_JOURNAL_REPLAY — C + journal/relecture/réexécution | 300 | 300/300 | 300/300 | 7,47 ms |

Le journal contient 300 enregistrements, 161 253 octets au total (537,5 octets par enregistrement en moyenne). La médiane de l'appel `fsync`/append est de 0,90 ms; relecture, validation d'empreintes et réexécution ont une médiane de 4,66 ms. La latence du bras journal inclut l'exécution initiale, l'écriture durable selon l'API système, la relecture et une deuxième exécution. Elle ne mesure pas un coût de journalisation seul. `fsync` est demandé au système d'exploitation; cette expérience ne garantit pas la persistance sur panne électrique ou matériel.

Les deux bras donnent les mêmes réponses et satisfont l'oracle indépendant sur les 100 scénarios × trois répétitions. Ce résultat caractérise seulement un contrôle harness-level pour le workload déterministe E05; il ne valide pas la durabilité, le replay ou l'idempotence de handlers ayant des effets externes.

## Reproduction

Depuis la racine du dépôt:

```powershell
node benchmarks/omega-bench-2026/adapters/a4-e05-journal-control.cjs
python benchmarks/omega-bench-2026/src/evaluate.py --results benchmarks/omega-bench-2026/results/A4-E05-control.jsonl --condition A4_CONTROL --experiment E05
python benchmarks/omega-bench-2026/src/evaluate.py --results benchmarks/omega-bench-2026/results/A4-E05-journal-replay.jsonl --condition A4_JOURNAL_REPLAY --experiment E05
```

Les résultats et le journal vivent dans `benchmarks/omega-bench-2026/results/`, ignoré par Git. Les manifestes enregistrent la version de l'adaptateur et la portée `public_harness_level_journal_replay_control_not_gcir_native`. Ce contrôle complémente l'audit A4, sans le remplacer: A4 runtime-native reste non mesurée.
