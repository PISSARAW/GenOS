# 0126 — Lier les politiques de métapopulation au runtime régional

- **Statut** : accepté
- **Date** : 2026-09-25
- **Domaine** : orchestration, métapopulation
- **Lié à** : [ADR 0110](0110-catalogue-central-des-variants-morphologiques.md), [ADR 0124](0124-selection-automatique-des-variants.md)

## Contexte

Le catalogue des variants de métapopulation expose des politiques, mais le cerveau régional
ne recevait pas toujours la politique persistée dans la session. Le choix de migration pouvait
donc retomber sur `novelty`, et les fréquences `periodic` et `rare` n'affectaient pas le cycle.
Les transferts fédérés devaient également repasser par les contrôles de souveraineté déjà
disponibles.

## Décision

- Le cerveau régional expose le variant et sa politique à l'observation du cycle.
- La boucle de migration utilise la politique du variant comme défaut, tout en respectant une
  politique explicitement demandée par la requête.
- `periodic` déclenche aux générations multiples de cinq et `rare` aux multiples de dix,
  sous réserve des gates de coût, synchronisation et budget du déclencheur adaptatif.
- Le variant `heterogeneous_islands` classe les candidats en favorisant la diversité des
  fournisseurs, algorithmes et lignées.
- Le variant `federated` exige une preuve de vérification et applique l'autorisation de
  transfert selon la classification, les régions et l'accord de fédération.

Ces règles compilent des politiques existantes dans le runtime. Elles ne rendent pas
automatiques les boucles de recolonisation, les migrations inter-missions, ni les
fonctionnalités de preuve qui ne sont pas fournies par leurs adaptateurs.

## Conséquences

Les choix de variante persistés ont maintenant des effets sur les cycles régionaux et les
propagules proposés. Les champs de preuve et de classification restent fournis par les
adaptateurs; un transfert fédéré incomplet est écarté sans contourner les contrats existants.
