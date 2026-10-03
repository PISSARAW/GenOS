# Mathématiques formelles — pilote version 1

Trois énoncés Lean 4 figés, sans import ni Docker. Le candidat retourne
uniquement un corps de preuve. L'oracle construit l'en-tête du théorème depuis
`public/items.json` et utilise le vrai vérificateur Lean. Il rejette les
placeholders, les axiomes déclarés et les erreurs de compilation. Le pilote
reste `comparisonEligible: false` : une exécution de chaque bras ne constitue
pas les trois répétitions appariées du protocole commun.

Depuis la racine du dépôt, définir `GENOS_LEAN_EXECUTABLE` vers Lean 4.34.0 :

```powershell
$env:GENOS_LEAN_EXECUTABLE='C:\Users\Shadow\.elan\toolchains\leanprover--lean4---v4.34.0\bin\lean.exe'
node benchmarks/suites/formal_math/v1/oracle/smoke.cjs
node benchmarks/suites/formal_math/v1/run-alone.cjs qwen2.5:14b nat-add-zero-01
node benchmarks/suites/formal_math/v1/run-genos-pilot.cjs qwen2.5:14b nat-add-zero-01
```

Les reçus bruts sont conservés dans `results/`, ignoré par Git. Le verdict
interne GenOS ne remplace jamais le reçu de l'oracle Lean. Pour une comparaison
confirmatoire, figer le modèle servi et son digest dans les deux bras, égaliser
le budget d'inférence, randomiser l'ordre et répéter chaque paire au moins
trois fois.

Pilote du 3 octobre 2026, `nat-add-zero-01`, `qwen2.5:14b` : le bras `alone`
propose `intro n; refl`, refusé par Lean. GenOS termine sa mission et collecte
un dossier worker, mais propose `:= by\nrefl` comme corps de preuve, également
refusé. Score validé par Lean : 0/1 pour chaque bras sur cet item. Ces essais
ne sont pas appariés au sens du protocole commun et ne mesurent pas un gain.
