# ADR 0573 — Porte appariée P2 avant commit adaptatif

- **Statut :** Accepté
- **Date :** 2026-10-18
- **Domaine :** Morphogenèse, évaluation comparative et promotion
- **Décideurs :** équipe GenOS
- **Lié à :** ADR 0566, ADR 0571, ADR 0572

## Contexte

P0 a unifié les candidats de recherche et P1 a ajouté une archive
qualité-diversité ainsi qu'un halving borné. Ces mécanismes produisent des
candidats, mais ne démontrent ni leur avantage causal ni leur supériorité face
aux références locales et externes. Les campagnes existantes couvrent une
partie du shadow, des issues appariées et du holdout, sans porte unique
obligeant tous les rivaux avant un éventuel commit adaptatif.

## Décision

1. P2 définit six bras obligatoires : agent unique, GenOS fixe, GenOS adaptatif,
   LangGraph statique, AutoGen GraphFlow ou Swarm, et MASS ou EvoMAS.
2. Chaque bloc compare les six bras sur la même tâche, graine, modèle, budget,
   oracle, politique d'outils et environnement. Une tentative simulée ou un
   adaptateur externe non identifié invalide le bloc.
3. Le corpus shadow et le holdout ont des identifiants, familles et empreintes
   distincts. Le holdout est scellé avant la préinscription et inaccessible au
   sélecteur.
4. Le plan statistique est hashé avant les observations. Les différences
   appariées de score et de coût utilisent un bootstrap déterministe et une
   correction de Bonferroni sur les cinq comparaisons.
5. L'adaptatif n'est éligible que si la borne basse de score dépasse l'effet
   minimal et si la borne haute du surcoût reste sous le plafond pour chacun
   des cinq rivaux. Un rival, reçu, bloc ou holdout manquant ferme la porte.
6. La sortie reste une preuve d'éligibilité. Elle n'accorde ni autorité
   d'exécution, ni commit, ni promotion et ne contourne pas le rollback.

## Conséquences

### Positives

- Un résultat shadow positif ne peut plus compenser un holdout négatif.
- Les comparaisons inter-frameworks doivent correspondre à des exécutions
  réelles appariées et versionnées.
- Les seuils, répétitions et corrections sont liés au manifeste préenregistré.

### Négatives

- P2 reste bloqué tant que les trois familles d'adaptateurs externes et les
  corpus scellés ne sont pas fournis.
- Le bootstrap décrit uniquement le corpus observé ; il ne prouve pas une
  supériorité universelle.

## Alternatives

- Promouvoir sur le meilleur score shadow : rejeté pour fuite et
  surinterprétation.
- Comparer seulement aux baselines GenOS : rejeté, car cela ne répond pas à la
  comparaison demandée avec les frameworks concurrents.
- Autoriser un commit dès que la porte statistique passe : rejeté ; l'autorité,
  la compensation et les preuves de promotion restent indépendantes.

## Vérification

`backend/tests/test_morphology_search_p2.js` vérifie le replay exact, les six
bras, les exécutions externes réelles, l'absence de fuite, l'intégrité du plan,
le rejet d'un holdout négatif et l'absence d'autorité de commit.
