# ADR 0242 — Plasticité rapide et lente coordonnée par AGOW

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : AGOW, plasticité, Signal Plane, procédures
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0006, ADR 0007, ADR 0241

## Contexte

GenOS possède déjà `synapticPlasticityService` pour les poids des canaux de signal et
`proceduralPlasticityService` pour LTP/LTD des synapses procédurales. AGOW a besoin
d'une trace d'éligibilité contextuelle pour relier une trajectoire à un outcome sans
transformer un événement isolé en consolidation durable.

## Décision

Ajouter un coordinateur et un état `agow_pathway_plasticity` persistant par agent.
Chaque voie sépare poids rapide, poids lent, trace d'éligibilité, support, échecs,
erreur de prédiction, contexte et références de preuve. Les surprises et améliorations
de viabilité augmentent la trace rapide; seuls les outcomes marqués `verified`, porteurs
de références et réussis comptent comme support.

Le mode `observe` ne modifie pas les poids persistés; `shadow` et les modes ultérieurs
peuvent mettre à jour le poids rapide. Le poids lent ne change qu'après trois soutiens
validés et une demande explicite en modes `bounded` ou `live`. Sa mise à jour réutilise
`proceduralPlasticityService.applyLTP`. Une admission d'event ou un hash de receiver ne
vaut pas validation indépendante d'un outcome.

## Conséquences

### Positives

- Un événement surprenant peut rendre une voie éligible sans la consolider.
- Les traces sont séparées par agent et signature de contexte.
- L'apprentissage lent demande des preuves, du support répété et un mode autorisé.

### Négatives

- `verified` reste une assertion du producteur; l'indépendance de la validation doit
  venir de l'intégrateur et du protocole expérimental.
- La trace ne s'exécute pas seule; les producteurs d'outcomes doivent appeler le
  coordinateur avec l'identité de trajectoire et les références pertinentes.

## Alternatives

- Modifier immédiatement `signal_channel_weights` : rejeté pour conserver son contrat
  historique et son périmètre global.
- Consolider sur la seule surprise : rejeté, car elle ne prouve ni réutilisation ni succès.
