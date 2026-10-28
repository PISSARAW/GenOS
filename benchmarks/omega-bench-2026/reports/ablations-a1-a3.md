# Ablations A1–A3 — exécution publique exploratoire

Ces résultats couvrent des portées ciblées du corpus public v0.4.0, trois répétitions, sans holdout et sans préenregistrement. Les sorties et manifestes JSONL sont générés sous `results/` et ignorés par Git.

## A1 — repli des additions adjacentes

Sur E04 (100 scénarios, 300 exécutions par bras), les deux bras traversent la validation d'enveloppe, le compilateur et le runtime G-CIR. Le bras actif applique le repli `add, add → add` avant exécution; le bras contrôle conserve les opérations. Les deux bras ont 300/300 réponses conformes à l'oracle, sans échec critique. Le graphe de travail passe de deux opérations d'addition à une dans chaque cas. La latence médiane observée est de 1,668 ms sans repli et 1,605 ms avec repli (écart descriptif d'environ 11 %). L'hôte est partagé; ce petit écart n'est pas une preuve d'effet et aucune analyse confirmatoire n'est faite.

Ce contrôle isole le repli adjacent sur le workload E04; il ne mesure pas l'ensemble des optimisations du compilateur.

## A2 — validation à la compilation en plus du runtime

Le bras ON compile le graphe puis le remet au runtime. Le bras OFF appelle directement `runtime.execute` sur le même graphe. Les contrôles obligatoires du runtime restent actifs dans les deux bras. E03 contient 500 candidats valides, 250 avec kind `EXECUTE` et 250 où `state` manque.

Les deux bras ont 2 250/3 000 résultats conformes (75 %). Le bras ON rejette les 750 kinds invalides au compilateur avant tout appel de handler; le bras OFF les rejette au runtime, également avant tout appel. Les deux bras exécutent le handler pour les 2 250 autres lignes; le runtime matérialise `state` absent comme `open`, ce qui accepte 750 entrées que l'oracle de schéma considère invalides. La validation de compilation ne change donc pas la conformité ici, mais déplace le point de rejet et ajoute un précontrôle.

Latence médiane totale exploratoire: 0,04245 ms avec compilation contre 0,0166 ms sans compilation; le runtime seul reste autour de 0,02 ms dans les deux bras. Le contraste mesure le coût de la compilation ajoutée au garde d'exécution, pas la valeur du garde runtime ni une amélioration de qualité. Cette expérience n'autorise pas à désactiver la validation runtime.

## A3 — typage strict contre forme JSON permissive

Sur E03 (1 000 cas, 3 répétitions), le bras typé utilise le validateur G-CIR avec le schéma, les types de champs et l'énumération des kinds. Le contrôle vérifie seulement que l'enveloppe est un objet JSON avec les conteneurs requis, sans valider les champs et les kinds des opérations. Le bras typé correspond à l'oracle sur 3 000/3 000 exécutions. Le contrôle permissif n'est exact que sur 1 500/3 000 (50 %), car il accepte les candidats mal formés. Latences médianes exploratoires: 1,503 ms (typé) contre 0,0003 ms (forme seulement); la différence reflète en partie le travail de validation supprimé et ne doit pas être lue comme un compromis produit acceptable.

## Commande

```powershell
node benchmarks/omega-bench-2026/adapters/ablation-a1-a3.cjs
node benchmarks/omega-bench-2026/adapters/ablation-a2-static-boundary.cjs
python benchmarks/omega-bench-2026/src/evaluate.py --results benchmarks/omega-bench-2026/results/ABLATION-A2-on.jsonl --condition A2-on --experiment E03
python benchmarks/omega-bench-2026/src/evaluate.py --results benchmarks/omega-bench-2026/results/ABLATION-A2-off.jsonl --condition A2-off --experiment E03
python benchmarks/omega-bench-2026/src/evaluate.py --results benchmarks/omega-bench-2026/results/A1-off.jsonl --condition A1-off --experiment E04
python benchmarks/omega-bench-2026/src/evaluate.py --results benchmarks/omega-bench-2026/results/A1-on.jsonl --condition A1-on --experiment E04
python benchmarks/omega-bench-2026/src/evaluate.py --results benchmarks/omega-bench-2026/results/A3-off.jsonl --condition A3-off --experiment E03
python benchmarks/omega-bench-2026/src/evaluate.py --results benchmarks/omega-bench-2026/results/A3-on.jsonl --condition A3-on --experiment E03
```
