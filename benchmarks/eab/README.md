# EAB — Epistemic Abstention Benchmark

Le runner évalue les questions pièges LoCoMo de catégorie 5. Il apparie les
446 questions gold `undefined` aux prédictions de l'évaluation native LoCoMo,
puis rapporte la détection d'abstention, la couverture, les réponses non
abstenues, le F1 lexical et l'écart entre abstention correcte et F1.

Le dataset LoCoMo n'est pas inclus dans ce dépôt. Fournir son chemin local ainsi
que le JSON produit par `backend/src/evaluation/locomo_eval_engine.js` :

```powershell
node benchmarks/eab/run-eab.cjs `
  --dataset C:/data/locomo10.json `
  --predictions backend/src/evaluation/locomo_real_genos_results.json `
  --out artifacts/eab-report.json
```

Le mode complet refuse un corpus ou des prédictions qui ne couvrent pas les 446
cas. Pour examiner un sous-ensemble, ajouter `--allow-partial true`; le rapport
porte alors `status: partial` et ne peut pas être présenté comme un résultat EAB
complet. Les réponses d'abstention sont reconnues via une liste explicite de
formulations de refus; le rapport conserve chaque décision pour audit.

## Exécution AEIS locale

`run-eab.cjs` mesure les réponses LoCoMo déjà produites; il n'exécute pas le
runtime AEIS. Le runner ci-dessous exécute réellement le pont AEIS vers la
promotion sur quatre cas contrôlés : preuve valide, sortie contredite,
affirmation sans lien avec la commande et workspace hors capsule.

```powershell
node benchmarks/eab/run-aeis-eab.cjs --out artifacts/aeis-eab-report.json
```

La commande échoue si une affirmation fausse est acceptée ou si la preuve
valide est refusée. Le rapport inclut les décisions, le nombre de résultats
de vérification et la latence mesurée par cas. La clé de signature est
éphémère si aucune clé n'est fournie dans l'environnement. Ces quatre cas
constituent une régression locale; ils ne remplacent pas les 446 cas LoCoMo
ni une évaluation de fournisseurs externes.
