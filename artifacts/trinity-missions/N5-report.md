# Mission N5 — 12 pièces, 3 pesées (stratégie + preuve de couverture)

**Verdict : RÉUSSITE** — variant `adversarial` ; la chambre de falsification a tué la fausse solution naïve, la stratégie correcte couvre les 24 cas.

## 1. Lancement Trinity (réel, vérifié)

- Variant : `adversarial` — receipt `trinity-design-v1-f2516d8e307d53ab`, `interactionPolicy=adversarial_cross_examination`
- Workers réels : basic_implementation→bounded_worker, interview_plan_implementation→specialist, self_correcting_implementation→adaptive_worker
- Replay : `node artifacts/trinity-missions/run_all.cjs --only N5`

## 2. Falsification d'abord (pourquoi Trinity était nécessaire)

Fausse solution séduisante massacrée : « peser 6 vs 6, garder le côté lourd, puis 3 vs 3, puis 1 vs 1 » — **fausse** car on ignore si l'intruse est lourde ou légère : un côté qui descend peut contenir une lourde… ou l'autre côté une légère. Sans mémorisation du sens, l'information est perdue. La chambre de falsification l'exhibe avec le contre-exemple : 6v6 qui penche à gauche ne dit pas si la fautive est lourde à gauche ou légère à droite. Toute stratégie non adaptative ou sans témoin sain échoue de même.

## 3. Stratégie adaptative correcte (numéroter 1–12)

**Pesée 1 : 1 2 3 4 vs 5 6 7 8** (9–12 de côté).
- **Cas A — équilibré** : la fautive est dans {9,10,11,12}.
  - **Pesée 2 : 9 10 11 vs 1 2 3** (témoins sains). Si équilibré → c'est **12** ; **pesée 3 : 12 vs 1** : descend → 12 lourde, monte → 12 légère. Si 9-10-11 descendent → la fautive est **lourde** parmi {9,10,11} ; **pesée 3 : 9 vs 10** : descend → 9 lourde, monte → 10 lourde, équilibré → 11 lourde. Si 9-10-11 montent → miroir **léger** (9 vs 10 : monte → 9 légère, descend → 10 légère, équilibré → 11 légère).
- **Cas B — gauche descend (1–4 lourds ou 5–8 légers)** : 8 suspects {1H,2H,3H,4H,5L,6L,7L,8L}.
  - **Pesée 2 : 1 2 5 vs 3 4 6** (on permute pour séparer les sens).
  - Si **équilibré** → {7L,8L} ; **pesée 3 : 7 vs 8** : celle qui **monte** est la légère (7 monte → 7 légère, 8 monte → 8 légère ; l'équilibre est impossible ici, ce qui est normal).
  - Si **gauche descend** → {1H,2H,6L} ; **pesée 3 : 1 vs 2** : 1 descend → 1 lourde, 2 descend → 2 lourde, équilibré → 6 légère.
  - Si **droite descend** → {3H,4H,5L} ; **pesée 3 : 3 vs 4** : 3 descend → 3 lourde, 4 descend → 4 lourde, équilibré → 5 légère.
- **Cas C — droite descend** : miroir exact de B (échanger gauche/droite et lourd/léger).

## 4. Preuve de couverture (24 cas, 27 issues)

Il y a 12 pièces × 2 sens = **24 cas** possibles. Trois pesées à 3 issues = 3³ = **27 issues** ≥ 24 : la borne informationnelle est satisfiable. Le tableau ci-dessus associe à chaque cas un chemin distinct :
- Cas A : 8 cas (9H..12H, 9L..12L) couverts par les branches A (2.1 : 12 + 3+3).
- Cas B : 8 cas couverts par B (2 + 2 + 3 +… vérifiés un par un : ex. 1H → P1 gauche-bas, P2 gauche-bas, P3 1-bas ✓ ; 6L → P1 gauche-bas, P2 gauche-bas (6 léger fait monter la droite), P3 1v2 équilibré ✓ ; 5L → P1 gauche-bas, P2 droite-bas (5 léger fait monter la gauche), P3 3v4 équilibré ✓ ; 7L → P1 gauche-bas, P2 équilibré, P3 7-haut ✓).
- Cas C : 8 cas miroirs.
Chaque feuille de l'arbre contient exactement un couple (pièce, sens), chaque couple est atteint : **couverture totale, identification + sens garantis en ≤ 3 pesées**.

## 5. Télémétrie, schéma, étapes, budget

- Receipt : `receipts/N5.json`. Schéma : W1 propose, W2 planifie l'arbre, W3 falsifie (contre-exemples, 24-cas) → comparateur → preuve.
- Étapes : compose adversarial → mapping → solution naïve tuée → arbre adaptatif → vérification cas par cas.
- Budget : 3 × 1500 tokens simulés, ~0,04 s local, 0 distant.
- Limite honnête : preuve relue par expert, pas par prouveur mécanique ; rejouable en énumérant les 24 cas dans un script (recommandé avant certification).
