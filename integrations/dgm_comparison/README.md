# Comparaison expérimentale DGM / GVX

`comparator.py` lit des archives de candidats avec lignées et résultats sur
tâches tenues à l'écart. La comparaison exige les mêmes identifiants de
mission, budgets et empreintes d'évaluateur pour DGM et GVX. Elle refuse les
candidats qui modifient évaluateurs, permissions ou règles de promotion.

`python integrations/dgm_comparison/test_comparator.py`

## Évolution contrôlée du scaffold

`scaffold_lineage.py` ajoute un registre JSONL append-only pour les modifications
du scaffold. Chaque candidat nomme son parent, son auteur, le digest du patch,
le snapshot source et une capsule propre. Les chemins d'évaluation, de permissions,
de promotion et de gates sont protégés. Le chaînage des événements par SHA-256 rend
une réécriture détectable à la réouverture. Un échec est conservé avec sa phase,
son code et ses références de preuve ; il n'est pas supprimé lors de la sélection.

`scaffold_evaluation.py` consomme des rapports produits ailleurs. Il impose quatre
identités distinctes — auteur, évaluateur, runner parent et runner candidat — ainsi
que des capsules parent/candidat disjointes. Le benchmark visible et le holdout ont
des identifiants de cas distincts. Chaque paire partage seed et digest de contrat.

L'évaluateur vérifie deux effets dans chacune des deux partitions :

1. le score agent du scaffold candidat progresse face au parent ;
2. le score de responsabilité projet progresse dans la même paire causale.

Tous les couples doivent progresser et les moyennes doivent atteindre les seuils
annoncés. Même dans ce cas, le dossier retourne
`status=AWAITING_PROMOTION_REVIEW` et `promotion_decision=null`. La décision de
promotion appartient à un gate séparé, jamais à l'évaluateur.

Tests ciblés :

```powershell
python integrations/dgm_comparison/test_comparator.py
python integrations/dgm_comparison/test_scaffold_lineage.py
python integrations/dgm_comparison/test_scaffold_evaluation.py
```

Ce harnais ne lance pas le code auto-modifiant de DGM ; il accepte des résultats
produits dans des sandboxes indépendantes. Les tests locaux utilisent des
résultats synthétiques et n'établissent aucune supériorité empirique. Il vérifie
la cohérence des reçus déclarés mais ne prouve ni l'exécution réelle de la capsule,
ni l'indépendance organisationnelle de l'évaluateur, ni la validité métier du score
de responsabilité.

Source : [DGM](https://github.com/jennyzzt/dgm).
