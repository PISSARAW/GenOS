# Traçage LeanDojo-v2 et modèle Dafny

`lean_trace.py` enregistre le résultat et les tactiques de
`prover.search(server=..., goal=..., verbose=False)` de LeanDojo-v2.
Le champ `verified` demeure faux jusqu'à une exécution distincte du binaire
Lean sur le fichier de preuve complet. Les tests locaux vérifient ce contrat
avec un faux prover, sans prétendre disposer d'une preuve Lean.

`lease_budget.dfy` formalise deux propriétés ciblées : une atténuation ne
peut élargir droits ou budget ; une dépense conserve le total et ne fait pas
augmenter le solde. Vérifier avec `dafny verify lease_budget.dfy` depuis ce
dossier. Ce modèle n'est pas une preuve automatique du backend GenOS.

Sources : [LeanDojo-v2](https://github.com/lean-dojo/LeanDojo-v2),
[Dafny](https://github.com/dafny-lang/dafny).
