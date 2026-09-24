# ADR 0093 — Conseiller de Morphogenèse pour Syncytium

## Statut

Accepté — lot 29 du plan Syncytium.

## Date

2026-09-24

## Domaine

Syncytium, mesure du couplage et recommandation de topologie.

## Lié à

Phase 47 de la feuille de route Syncytium.

## Contexte

La morphogenèse doit pouvoir proposer une topologie mieux adaptée lorsque le partage d'état devient faiblement ou fortement couplé, que l'autonomie régionale augmente, ou que la nature des décisions change.

## Décision

1. Calculer `CouplingScore` comme le produit de densité d'écritures partagées, densité de dépendances, fréquence d'updates et coût de staleness, chaque signal étant normalisé dans [0, 1].
2. Empêcher le signal de faible couplage de recommander A-Team lorsqu'il existe encore des invariants partagés.
3. Recommander Direct pour une seule région active, Trinity pour un conflit sémantique expérimentalement décidable, Biocenose pour un désaccord central, Metapopulation pour une autonomie régionale et A-Team pour un couplage faible.
4. Garder les seuils et motifs de recommandation visibles dans le résultat.
5. Présenter la transition comme un conseil; le runtime de Morphogenesis garde l'autorisation et l'exécution du changement.

## Conséquences

### Positives

- Les recommandations sont fondées sur des signaux bornés, vérifiables et testables.
- L'analyse d'une session expose le score, les composants, la version observée et la cohérence.
- Le système peut proposer A-Team, Metapopulation, Biocenose, Trinity ou Direct selon le motif dominant.

### Négatives

- Les seuils sont des heuristiques configurées, pas des paramètres appris des performances.
- La qualité du score dépend de mesures fournies par l'appelant; ce lot ne prétend pas collecter automatiquement les métriques de staleness et de dépendance.

## Alternatives

- Changer automatiquement de topologie dès le franchissement d'un seuil : écarté, car cela contournerait les gates d'autorité et de validation Morphogenesis.
- Considérer uniquement le nombre d'agents : écarté, car il ne mesure ni les dépendances ni le coût des vues périmées.
