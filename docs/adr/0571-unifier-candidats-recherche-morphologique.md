# ADR 0571 — Unifier les candidats de recherche morphologique

- **Statut :** Accepté
- **Date :** 2026-10-17
- **Lié à :** ADR 0051, ADR 0133, ADR 0554, ADR 0569

## Contexte

Le générateur développemental produisait des candidats portant une
`expression`, tandis que l'évaluateur cherchait une propriété `morphology`.
Les candidats recevaient donc un score nul et la recherche non-spiral pouvait
s'arrêter dès la première génération. La sélection Pareto lisait en outre les
objectifs au mauvais niveau du score et la diversité comparait les caractères
du JSON plutôt que la structure de la morphologie.

## Décision

1. `expression` devient la représentation canonique d'un candidat ;
   `morphology` reste accepté uniquement en lecture pour compatibilité.
2. Un candidat porte une identité stable, ses parents, sa génération, ses
   mutations, un descripteur structurel, ses budgets et ses références de
   preuve.
3. La recherche utilise un RNG dérivé d'une graine déclarée. Les identifiants
   créés par ses mutations sont dérivés de la recherche, de la génération et
   de l'index du candidat.
4. La dominance lit les objectifs dans `score.breakdown` et la diversité est
   calculée sur le nombre de nœuds, la profondeur, les types de nœuds et les
   topologies, pas sur la sérialisation JSON.
5. Seules les mutations disposant de paramètres exécutables pour l'expression
   courante participent à ce chemin de recherche. Les autres restent
   disponibles pour leurs chemins spécialisés, mais ne sont pas simulées comme
   si elles avaient produit une transformation.

## Conséquences

- Une même graine et un même contexte reproduisent la même lignée.
- Les résultats d'exécution restent des observations, pas une autorisation de
  promotion.
- Cette étape ne met pas encore en œuvre l'archive qualité-diversité, le
  successive halving ni le benchmark concurrent confirmatoire.
- Toute extension de l'espace de mutations doit fournir des paramètres
  complets, une transformation distincte et un test de replay.

## Vérification

`backend/tests/test_morphology_search_p0.js` vérifie le contrat canonique,
l'évaluation effective, la dominance multiobjectif, une mutation structurelle
et la reproduction exacte d'une recherche sur plusieurs générations.
