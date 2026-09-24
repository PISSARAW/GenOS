# ADR 0094 — Ontologie et sélection morphogénétiques

## Statut

Accepté — 2026-09-24.

## Domaine

Orchestration, morphogenèse, planification et graphe morphologique.

## Décision

Les huit identifiants déclarés dans le registre canonique sont les seules
topologies admissibles au niveau `topologyResolverService`. Les organisations,
notamment `specialist_expert_committee` et `red_blue_coevolution`, restent des
attributs distincts. Stratégies, variants, opérateurs de composition, relations,
phénotypes worker et substrats ne sont pas des alias de topologie.

Quand le contexte fournit un profil morphologique, le planificateur compile
chaque topologie canonique comme candidat complet : contrat de capacités,
conservation et création d’agents, coûts et graphe. Il classe ensuite ces plans
ensemble et conserve dans la décision le candidat effectivement compilé. Une
topologie explicitement demandée reste prioritaire en l’absence de profil ou de
demande explicite d’exploration. Le graphe retenu conserve séparément son
organisation.

La politique de morphologie minimale n’accepte que des candidats et preuves
explicitement fournis. Elle peut sélectionner une topologie simple lorsque les
niveaux plus simples sont représentés par des preuves d’indisponibilité; elle ne
fabrique pas de disponibilité pour une primitive, une procédure ou un worker.

Les runtimes Node et Rust restent séparés. Cet ADR ne change pas l’autorité
d’adjudication du kernel Rust ni les gates acceptés dans l’ADR 0076.

## Conséquences

### Positives

- Les organisations ne sont plus présentées comme des topologies candidates.
- Les capacités et les workers sont compilés pour chaque candidat avant le
  choix final, évitant les plans hybrides.
- Le choix peut comparer tout l’espace des huit topologies à partir d’un profil.
- La sélection minimale dépend de disponibilités et d’éléments probants fournis.

### Négatives

- La génération de profil compile plusieurs candidats et coûte plus cher que la
  sélection d’une seule topologie.
- Les scores restent des priors; leur qualité devra être mesurée avant toute
  promotion en politique apprise.
- La sélection minimale des niveaux précédant une topologie dépend encore des
  producteurs en amont.

## Alternatives

- Continuer à comparer uniquement la topologie courante, la proposition et
  Trinity : rejeté, cet échantillon ne couvre pas l’espace canonique.
- Traiter les organisations comme des topologies : rejeté, cela confond la
  structure de travail avec son mode opérationnel.
- Supposer qu’un candidat absent est disponible : rejeté, une absence de
  preuve ne justifie pas une promotion morphologique.
