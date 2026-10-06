# Comparaison expérimentale DGM / GVX

`comparator.py` lit des archives de candidats avec lignées et résultats sur
tâches tenues à l'écart. La comparaison exige les mêmes identifiants de
mission, budgets et empreintes d'évaluateur pour DGM et GVX. Elle refuse les
candidats qui modifient évaluateurs, permissions ou règles de promotion.

`python integrations/dgm_comparison/test_comparator.py`

Ce harnais ne lance pas le code auto-modifiant de DGM ; il accepte des résultats
produits dans des sandboxes indépendantes. Les tests locaux utilisent des
résultats synthétiques et n'établissent aucune supériorité empirique.

Source : [DGM](https://github.com/jennyzzt/dgm).
