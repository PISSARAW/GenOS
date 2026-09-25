# ADR 0122 — Évaluation comparative inter-topologies et preuve de recolonisation

## Statut

Accepté.

## Date

2026-09-25.

## Domaine

Évaluation comparative, topologies et reprise de Métapopulation.

## Décideurs

Équipe GenOS.

## Lié à

[ADR 0121 — Contrat de mission comparative](0121-contrat-mission-comparative-et-frontieres.md).

## Contexte

Les bancs d'essai comparatifs peuvent servir plusieurs topologies, tandis que
les règles de migration et de diversité restent propres à Métapopulation. Le
niveau 6 doit aussi distinguer une reprise déclarée d'une reprise qui respecte
les nouvelles contraintes et conserve plusieurs lignées.

## Décision

1. Exposer l'évaluateur comparatif déterministe via un adaptateur qui exige un
   mode de topologie enregistré et ne modifie pas l'évaluation locale.
2. Ne signaler la politique de migration avec validation par le receveur que
   pour Métapopulation; les autres modes ne l'héritent pas implicitement.
3. Vérifier le résultat du niveau 6 contre ses entrées : stratégie initiale
   invalidée par la contrainte, au moins deux lignées fondatrices distinctes,
   solution viable non identique au voisin soumis et populations survivantes
   encore viables.
4. Garder cette évaluation séparée des essais persistants de recolonisation,
   qui demeurent une responsabilité du runtime Métapopulation.

## Conséquences

Les résultats comparatifs sont évaluables via un point d'entrée commun et les
tests couvrent les modes et les échecs de reprise par clonage ou arrêt des
survivants. L'adaptateur ne branche pas automatiquement chaque dispatcher de
topologie sur les missions comparatives.

## Alternatives

- Propager automatiquement les règles de migration à chaque topologie : rejeté,
  car elles n'ont pas le même modèle de populations.
- Déclarer une reprise valide à partir de la seule fitness : rejeté, car cela
  ignorerait l'effondrement, les lignées, le clonage et les survivants.
