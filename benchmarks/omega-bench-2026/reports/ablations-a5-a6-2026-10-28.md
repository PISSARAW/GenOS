# A5–A6 — contrôle G-CIR avec handler de référence

Ces contrôles utilisent les mêmes entrées publiques E10/E11 et les mêmes répétitions que D. Pour chaque ligne, l'adaptateur construit la même enveloppe, valide avec le même interop, compile les mêmes opérations avec le même compilateur, et appelle le même runtime avec la même politique. Seul le handler `CALL` change: A5/A6 appellent `json_reference.execute` au lieu du service GenOS. Les contrôles ne désactivent pas les contrôles G-CIR.

## Résultats appariés

| Ablation | Portée | Référence/oracle | D/oracle | Réponses identiques à D | Latence médiane réf. / D |
| --- | --- | ---: | ---: | ---: | ---: |
| A5 — service de morphogenèse remplacé | E10, 100 scénarios × 3 | 300/300 | 300/300 | 300/300 | 0,81 / 166,74 ms |
| A6 — allocateur physiologique remplacé | E11, 50 scénarios × 3 | 150/150 | 150/150 | 0/150 | 0,90 / 0,63 ms |

Les deux contrôles et D ont les clés scénario/répétition exactes. Les résultats A5/A6 passent l'évaluateur indépendant sans manque, doublon, statut invalide ni échec critique. Le runner A6 reproduit aussi les 150 réponses E11 actuelles de C; un ancien compte rendu indiquant 54/150 pour C ne correspond pas aux résultats/hashes courants et a été corrigé ici.

Les réponses E11 A6 diffèrent toutes de D, mais les 300 sorties des deux bras sont conformes au contrat d'allocation: minima respectés, budget conservé et priorité respectée. Le corpus autorise donc plusieurs allocations sémantiquement valides. Cette ablation distingue les algorithmes de service; elle ne montre pas un gain d'exactitude sur E11.

## Limites d'interprétation

- A5 utilise un handler de référence qui retourne la topologie cible, l'identifiant de mission et la liste d'obligations demandée. Il ne réalise pas de transition persistée, ne crée pas de snapshot durable et ne vérifie pas les invariants sur un état GenOS. La conformité de réponse 300/300 montre que l'oracle E10 n'exige pas à lui seul la preuve d'un effet morphogénétique durable. A5 teste le retrait du service sous l'enveloppe G-CIR, pas la conservation réelle des effets.
- A6 remplace l'allocateur GenOS par l'allocation de référence. Les deux satisfont le contrat E11 sur ces 50 cas; leurs réponses exactes diffèrent, sans écart de conformité observable.
- Les latences sont descriptives, relevées sur une VM partagée. E10 D inclut la persistance/autorité de transition; E10 A5 retourne seulement la réponse de référence. Elles ne représentent pas un gain produit généralisable.
- Le contrat monétaire « missions réussies par euro » reste non mesuré. Ces résultats n'établissent pas le seuil E11 de gain relatif de 15 %.
- A5/A6 restent des contrôles publics exploratoires, sans holdout ni inférence confirmatoire.

## Reproduction

```powershell
node benchmarks/omega-bench-2026/adapters/ablation-a5-a6-gcir-reference.cjs
python benchmarks/omega-bench-2026/src/evaluate.py --results benchmarks/omega-bench-2026/results/ABLATION-A5.jsonl --condition A5 --experiment E10
python benchmarks/omega-bench-2026/src/evaluate.py --results benchmarks/omega-bench-2026/results/ABLATION-A6.jsonl --condition A6 --experiment E11
```

Les manifestes enregistrent les hashes du runner, de l'adaptateur D, du runtime, du compilateur, de l'interop et du manifeste du corpus. Les JSONL et manifestes demeurent dans `results/`, ignoré par Git.
