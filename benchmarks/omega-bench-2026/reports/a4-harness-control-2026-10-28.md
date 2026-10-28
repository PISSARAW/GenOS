# A4 — journal/replay natif G-CIR — 2026-10-28

## Portée et méthode

Cette tranche mesure le journal SQLite injecté dans le runtime G-CIR Ω (ADR 0749), sur les 100 scénarios E05 × trois répétitions. Les deux bras utilisent la même opération `CALL`, le même handler E05 et le même oracle. Le contrôle exécute `createRuntime()` en mémoire. Le bras natif utilise `createRuntime({ journal: db })`, avec SQLite en WAL et `synchronous=FULL`.

Pour chaque cas natif, le handler simule un effet externe idempotent. Il inscrit son résultat sous la clé reçue du runtime (`gcir:<runId>:apply`), puis provoque une interruption après ce commit. Le runner ferme la connexion SQLite, la rouvre et reprend le même run/opération; le handler reçoit la même clé et retrouve son effet existant. Après la reprise, le runner ferme et rouvre à nouveau SQLite, puis rejoue le résultat complété depuis le journal. Chaque sortie du bras natif est comparée exactement à celle du contrôle.

L’interruption est simulée par une exception et des connexions fermées/réouvertes; il ne s’agit pas d’un arrêt brutal de processus ou d’une panne électrique. Le registre d’effets idempotents est un faux système externe en mémoire gardé par le runner : cette expérience vérifie le raccord de la clé et la coordination durable du runtime, pas la durabilité d’un fournisseur externe.

## Résultats publics E05

| Bras | Exécutions | Oracle correctes | Sorties appariées égales | Effets observables par cas | Appels du handler par cas | Latence médiane |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A4_CONTROL — G-CIR en mémoire | 300 | 300/300 | — | 1 | 1 | 0,08 ms |
| A4_JOURNAL_NATIVE — G-CIR + SQLite | 300 | 300/300 | 300/300 | 1 | 2 (appel interrompu, reprise dédupliquée) | 22,13 ms |

Les 300 récupérations réutilisent la même clé par run/opération; aucun cas ne répète l’effet simulé. Le rejeu du résultat terminé après la seconde réouverture SQLite ne rappelle pas le handler. Le rapport de l’évaluateur public indique 300/300 réponses exactes à l’oracle dans chaque bras, sans scénario manquant ni échec critique.

Les latences sont descriptives. Celle du bras natif inclut l’initialisation/écriture du journal, une interruption injectée, deux réouvertures SQLite, la reprise idempotente et le rejeu terminal; ce n’est pas le surcoût isolé d’une transaction SQLite. Aucun appel de modèle externe n’est effectué. Le résultat est public et exploratoire, sans revendication de significativité confirmatoire.

## Reproduction

Depuis la racine du dépôt :

```powershell
node benchmarks/omega-bench-2026/adapters/a4-e05-journal-control.cjs
python benchmarks/omega-bench-2026/src/evaluate.py --results benchmarks/omega-bench-2026/results/A4-E05-control.jsonl --condition A4_CONTROL --experiment E05
python benchmarks/omega-bench-2026/src/evaluate.py --results benchmarks/omega-bench-2026/results/A4-E05-journal-native.jsonl --condition A4_JOURNAL_NATIVE --experiment E05
```

Les sorties, manifestes et bases SQLite sont enregistrés dans `benchmarks/omega-bench-2026/results/`, ignoré par Git. Le manifeste du bras natif conserve le hash de la base SQLite, du runtime, du journal, de l’adaptateur et du manifeste de données. Cette expérience ne modifie pas le protocole ni les entrées/oracles du corpus.
