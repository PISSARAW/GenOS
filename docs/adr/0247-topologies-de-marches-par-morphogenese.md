# ADR 0247 — Topologies de marché proposées par Morphogenesis

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : Morphogenesis, AGOW, compétition distribuée
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0246

## Contexte

AGOW peut partitionner une compétition selon une topologie, mais une topologie codée
en dur limiterait l'adaptation. Morphogenesis est responsable des structures runtime;
AGOW reste responsable de l'évaluation et de la sélection des candidats.

## Décision

`morphogenesisMarketAdapter` transforme une proposition structurelle contenant une
morphologie et un partitionnement module-vers-région. Toute proposition contenant des
identifiants de candidats gagnants ou sélectionnés est refusée. La proposition est
persistée en statut `shadow`; elle ne devient active qu'avec un reçu d'approbation
explicite. Le cycle AGOW consulte la topologie activée seulement si aucune topologie
opérateur n'est fournie et si la politique marché autorise déjà l'exécution.

La topologie choisit les frontières et les routes de marché. L'arbitre régional et
l'arbitre global choisissent tous les candidats gagnants. Les reçus conservent version
et proposant.

## Conséquences

### Positives

- Les structures peuvent suivre les topologies Morphogenesis existantes.
- La séparation structure/sélection est vérifiée à l'entrée du service.
- Les propositions restent sans effet jusqu'à activation explicite.

### Négatives

- L'approbation est un identifiant d'audit fourni par l'intégrateur, pas une
  authentification cryptographique intégrée au service.
- La génération de la proposition et la qualité de la partition restent à mesurer.

## Alternatives

- Laisser Morphogenesis désigner les gagnants du marché : rejeté, car cela fusionnerait
  la configuration de structure avec l'autorité de sélection AGOW.
