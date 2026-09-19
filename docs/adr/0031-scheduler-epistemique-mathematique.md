# ADR 0031 — Scheduler épistémique mathématique

- **Statut** : Accepté
- **Date** : 2026-09-19
- **Domaine** : Orchestration, mathématiques, preuves, budgets
- **Lié à** : [ADR 0029](0029-resultat-formel-messagepack.md)

## Contexte

Un fan-out uniforme traite toutes les branches comme si elles avaient la même
valeur d'information. Il peut dupliquer inutilement un objectif déjà actif,
retarder la diffusion d'un contre-exemple et consommer du budget sur des lignées
dominées. Un résumé textuel final ne suffit pas à reconstruire une preuve.

## Décision

GenOS introduit un scheduler épistémique composé de sept politiques indépendantes :

1. registre des empreintes actives et regroupement des doublons exacts ;
2. redondance volontaire pour les vérifications indépendantes ;
3. affectation selon la nouveauté attendue ;
4. propagation des contre-exemples dans le graphe des descendants ;
5. réallocation auditable du budget entre lignées ;
6. graphe typé de dépendances mathématiques ;
7. vérification Lean incrémentale avant ouverture des descendants.

L'empreinte d'une tâche couvre son énoncé canonique, ses hypothèses, son domaine
de validité et ses dépendances. Une proximité sémantique ne constitue jamais une
preuve d'équivalence et ne suffit donc pas à supprimer une branche.

## Conséquences

### Positives

- Les doublons exacts peuvent partager leur résultat sans doubler le calcul.
- La diversité utile est distinguée de la duplication accidentelle.
- Les décisions de budget et d'invalidation deviennent auditables.

### Négatives

- Le scheduler conserve davantage d'état et de relations.
- Les preuves formelles ajoutent une latence volontaire aux frontières du graphe.
- La politique exige des migrations explicites avant toute persistance durable.

## Alternatives

Conserver un fan-out uniforme a été écarté : il est simple, mais ignore la valeur
d'information, les dépendances et la qualité des preuves. Dédupliquer par similarité
vectorielle a aussi été écarté, car une ressemblance n'établit pas une équivalence.
