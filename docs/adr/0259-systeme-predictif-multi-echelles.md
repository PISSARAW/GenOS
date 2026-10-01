# ADR 0259 — Système prédictif multi-échelles T0–T6

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : Prédiction, AGOW, apprentissage, morphogenèse, lignée
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0038, ADR 0242, ADR 0257

## Contexte

La hiérarchie prédictive existante ne couvrait que quelques catégories d'événements et
faisait remonter des erreurs par compteurs. Elle n'entretenait pas un état métrique
comparable aux échelles de perception, stratégie, procédure, morphologie et lignée.

## Décision

Le service `predictiveTimescale` définit T0 perception, T1 attention/routage, T2 stratégie,
T3 modèle monde/soi/épisode, T4 procédure/compétence, T5 morphologie et T6 lignée. Chaque
niveau conserve ses valeurs prédites et postérieures, erreurs, références d'évidence et
date d'actualisation dans `adaptive_state`.

Les taux d'apprentissage décroissent de 0,80 à 0,03; les seuils d'évidence croissent de 1 à
20. Une erreur au-dessus de la tolérance ne se propage qu'après persistance et présence de
références indépendantes suffisantes. Les erreurs T6 ne sont jamais propagées vers un
niveau supérieur. Un niveau rapide sans état local peut hériter d'un prior du niveau plus
lent le plus proche. Un signal propagé peut produire un candidat AGOW en revue, jamais une
mutation directe.

## Conséquences

- Le modèle rend explicites niveaux, plasticité, evidence gate, erreurs et routage.
- Ces paramètres constituent une politique initiale et ne sont pas des résultats de
  calibration empirique.
- Les événements existants de `predictiveHierarchyService` ne sont pas encore routés
  automatiquement dans ces niveaux; l'intégration des producteurs reste un chantier.

## Alternatives

- Appliquer le même taux et la même exigence d'évidence à tous les niveaux : rejeté, car
  cela rendrait structure et lignée aussi plastiques que la perception.
- Propager toute erreur brute vers le haut : rejeté, car un bruit transitoire contaminerait
  les décisions structurelles.
