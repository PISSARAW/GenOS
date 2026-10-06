# Audit approfondi des variants Trinity

- **Date** : 2026-10-06
- **Statut** : audit terminé ; aucune promotion démontrée
- **Portée** : 48 missions originales, 88 tentatives, 324 mondes créés
- **Méthode** : lecture des exécutions historiques ; aucune nouvelle mission lancée

## Résultats et limites

Les 71 PASS historiques attestent les propriétés contrôlées par les vérificateurs
locaux. Ils ne certifient pas toute la mission, toute l'explication, le contrat
accepté par le runtime ou le mécanisme distinctif du variant. Aucun monde n'a été
promu. Les essais et états observés après la clôture historique sont séparés.

La relecture identifie notamment une justification Pareto fausse malgré un front
correct, une proposition exploratoire contraire aux interdictions originales,
des profils littéraires assignés à une architecture de messagerie et des calculs
oraculaires locaux qui ne sont pas des processus indépendants.

Les pensées privées des modèles et les coûts fournisseur non mesurés restent
inconnus. Le raisonnement analysé correspond aux actions, sorties, hypothèses et
justifications observables. Les prescriptions ne sont pas des correctifs déjà
implémentés ou validés.

| Variant | Missions | Tentatives | Mondes | PASS locaux historiques | Promotions |
|---|---:|---:|---:|---:|---:|
| controlled | 4 | 4 | 12 | 12 | 0 |
| heterogeneous | 4 | 5 | 0 | 0 | 0 |
| factorial | 4 | 7 | 96 | 0 | 0 |
| pareto | 4 | 7 | 21 | 13 | 0 |
| adversarial | 4 | 9 | 27 | 3 | 0 |
| counterfactual | 4 | 5 | 15 | 0 | 0 |
| temporal | 4 | 4 | 12 | 11 | 0 |
| oracular | 4 | 4 | 12 | 3 | 0 |
| jury | 4 | 18 | 54 | 9 | 0 |
| recursive | 4 | 4 | 12 | 9 | 0 |
| adaptive | 4 | 5 | 15 | 3 | 0 |
| exploratory | 4 | 16 | 48 | 8 | 0 |

## Rapports et corrections

- [Causes communes et composants](composants-et-causes.md) : identité, budget,
  clôture, relations, SHEV, AGOW, G-CIR Omega, AEIS, NSE, NCE et chemins
  Play/phénotype/culture/POET, GVX, QD et Signal planes.
- [Améliorations détaillées par variant](ameliorations-par-variant.md) : priorités
  et critères d'acceptation, avec les références des observations.
- [Controlled, Heterogeneous, Factorial et Pareto](controlled-factorial/rapport.md) :
  16 missions, 23 tentatives, 129 mondes.
- [Adversarial, Counterfactual, Temporal et Oracular](adversarial-temporal/rapport.md) :
  16 missions, 22 tentatives, 66 mondes.
- [Jury, Exploratory, Recursive et Adaptive](jury-recursive/rapport.md) :
  16 missions, 43 tentatives, 129 mondes.

Les rapports conservent les premiers blocages, les cascades, les assignations,
les actions exécutées, la qualité des réponses, les relations, les preuves et
les limites par worker. L'isolement initial ne prouve pas une discussion critique
ultérieure ; les handoffs du parent ne sont pas assimilés à des débats.

## Provenance et conservation des preuves

Le document fourni, `Missions de test des variants Trinity.docx`, a pour SHA-256 :
`a68540e55f4e0435a221b4585225c5bbece8ff6b9902994911d72878cd766d44`.

Le dossier local complet est conservé dans
`D:\GenOS-Trinity-qualification-20261006-01a1109a\audit-approfondi-20261006`.
Il contient les audits JSON par mission/worker, l'index navigable, les inventaires,
les vérifications et les locators historiques des sources.

La validation de livraison confirme les 48 missions et 324 mondes dans l'index,
l'unicité des identités et l'identité des six copies de rapports/preuves
spécialisés. Le manifest scelle 23 fichiers, 39 715 632 octets ; son SHA-256 est
`c7bcf8ab4c786173aba0e7b9fc12ea4dc53ff2ecf024ab55c40b9c69a7fde6b4`.
Ce contrôle certifie la couverture et l'intégrité de livraison, pas la vérité
des réponses des workers.

Les copies documentaires normalisent les espaces de fin de ligne ; les rapports
originaux scellés sur D restent inchangés. Les références vers des
audits structurés ou captures restent des locators locaux historiques ; le
`source-path-map.json` du dossier D permet de retrouver les copies déplacées.
Les bases, journaux bruts, index générés et capsules restent hors de ce commit.

Le runtime et le checkout ont changé pendant la campagne. Une empreinte observée
pendant l'audit n'est pas présentée comme une empreinte au dispatch. Les dates SQL
sans timezone ne sont pas converties implicitement.

Cet audit inclut les échecs. Il est conservé localement ; la publication antérieure
dans GenOSWork reste limitée aux réussites et à leurs vérificateurs.
