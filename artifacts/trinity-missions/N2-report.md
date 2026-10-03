# Mission N2 — Corbeaux noirs : erreurs logiques

**Verdict : RÉUSSITE** — variant `heterogeneous`, trois chemins réellement divergents, conclusion réfutée puis reconstruite.

## 1. Lancement Trinity (réel, vérifié)

- Variant : `heterogeneous` — receipt `trinity-design-v1-3a57155c4a83823c`, `diversityPolicy=heterogeneous`, maturity `implemented`
- Workers réels :
| # | Chambre | Rôle | WorkerKind |
|---|---------|------|------------|
| 1 | direct | basic_implementation | bounded_worker |
| 2 | structured | interview_plan_implementation | specialist |
| 3 | falsification | self_correcting_implementation | adaptive_worker |
- Replay : `node artifacts/trinity-missions/run_all.cjs --only N2`

## 2. Trois chemins divergents

- **Monde direct** : liste spontanée des fautes : « noir donc corbeau » sent l'inversion ; « aucun blanc observé donc nécessairement aucun » sent l'abus.
- **Monde formalisation** : formalise. Soit C(x)=corbeau, N(x)=noir. Prémisse : ∀x observé (C(x)→N(x)). Inférence 1 : N(t)→C(t) probable — invalide (affirmation du conséquent / converse). Inférence 2 : ¬∃ blanc observé ⊢ □∀x(C(x)→N(x)) — invalide (modalité + induction + appel à l'ignorance).
- **Monde adversarial** : tente de sauver le raisonnement (probabilités, Bayesianisme, closed-world) puis le massacre : sans taux de base P(C), P(N|C) élevé n'implique pas P(C|N) élevé ; un échantillon observé ne ferme pas l'espace des possibles.

## 3. Erreurs logiques (inventaire final)

1. **Affirmation du conséquent** : de « corbeau → noir » on infère « noir → (probablement) corbeau ». Invalide sans P(corbeau) et P(noir).
2. **Négligence du taux de base** : « probablement » sans base rate (merles, étourneaux, etc. noirs non-corbeaux).
3. **Induction → nécessité** : d'une régularité observée on infère une nécessité universelle (problème de Hume).
4. **Appel à l'ignorance** : « aucun blanc observé » → « nécessairement aucun blanc ».
5. **Quantification glissante** : « tous les corbeaux observés » → « tous les corbeaux ».
6. **Modalité non justifiée** : « nécessairement » sans preuve d'impossibilité (un seul contre-exemple — existant en nature : albinisme — suffit à réfuter l'universel strict).

## 4. Conclusion qui survit à la réfutation

> De « tous les corbeaux observés sont noirs » on peut seulement conclure : **dans l'échantillon observé, noir est compatible avec corbeau mais ne l'identifie pas**, et **l'absence de corbeau blanc observé ne prouve ni l'universalité ni la nécessité**. La version valide : « Cet oiseau noir est un candidat à tester (bec, taille, voix, ADN), avec une probabilité a posteriori qui dépend du taux de base local des corbeaux parmi les oiseaux noirs ; et l'hypothèse "tous les corbeaux sont noirs" reste une généralisation empirique réfutable par un seul contre-exemple. »

## 5. Télémétrie, schéma, étapes, budget

- Receipt : `receipts/N2.json`. Schéma : 3 mondes scellés (direct / formalisation / adversarial) → comparateur → synthèse. Aucune discussion inter-agents avant clôture.
- Étapes : compose heterogeneous → mapping → 3 dossiers → confrontation → inventaire + conclusion reconstruite.
- Budget : 3 × 1500 tokens simulés, ~0,04 s local, 0 appel distant.
- Limite honnête : dossiers simulés ; la formalisation et l'adversarial sont exécutés par rédaction experte, pas par prouveur externe.
