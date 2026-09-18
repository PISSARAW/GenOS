# ADR 0021 — Ontologie opérationnelle

## Statut

Acceptée — première implémentation en cours.

## Contexte

Le registre philosophique contient des concepts ontologiques qui ne doivent pas
être présentés comme des capacités runtime. GenOS dispose déjà d'un noyau pour
les êtres, les propriétés, les relations et l'identité, mais pas d'une
représentation opérationnelle de l'altérité, de la continuité/discontinuité et
des mondes possibles.

## Décision

Ces concepts sont implémentés comme des structures analysables et traçables :

- une analyse ne constitue pas une vérité métaphysique ;
- les hypothèses, observations et limites sont conservées avec la provenance ;
- aucun résultat ontologique ne confère automatiquement une permission ou ne
  déclenche une promotion ;
- les mondes possibles restent hypothétiques tant qu'une preuve externe ne les
  qualifie pas autrement ;
- les mesures continues sont conservées même lorsqu'une classification discrète
  est produite ;
- toute donnée persistée est isolée par organisation et projet.

## Portée

La première tranche couvre `ontology.person-other`,
`ontology.continuous-discrete` et `ontology.possible-worlds`. Les écoles et
concepts métaphysiques adjacents seront ajoutés après validation de ces
primitives.

## Conséquences

Les services ontologiques restent séparés du runtime d'exécution. Les appels
peuvent être exposés par le router et MCP, mais leurs résultats portent un
statut épistémique explicite et ne contournent ni sandbox, ni lease, ni gate de
promotion.
