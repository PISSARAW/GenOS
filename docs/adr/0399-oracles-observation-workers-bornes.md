# ADR 0399 — Oracles bornés pour les workers d'observation

- **Statut** : accepté
- **Date** : 2026-10-11
- **Domaine** : workers natifs, observations, preuves et promotion
- **Décideurs** : équipe GenOS
- **Lié à** : [qualification des workers](../06-qualite-preuves/qualification-workers.md), [ADR 0398](0398-oracle-subset-sum-procedural-direct.md)

## Contexte

`scout_cell` et `resident_daemon` produisent des artefacts déterministes,
mais ces missions n'avaient pas de domaine d'oracle relié au run. Leur exécution
et la validation de forme ne suffisent pas à établir C2/C3. Le scout doit
vérifier ses correspondances textuelles ; le daemon doit vérifier les anomalies
calculées à partir des échantillons et du seuil scellés.

## Décision

Ajouter les domaines `literal_observation` et `monitor_window` à l'oracle natif.
Le premier accepte `scan_literal` et recalcule les offsets par index et par
balayage caractère par caractère. Le second accepte `monitor_samples` et
recalcule les anomalies par filtrage et par comptage. Chaque stratégie est
exécutée dans son propre processus, son workspace et son reçu ; l'assemblée
AEIS exige deux attestations indépendantes avant la promotion.

Le sujet est chargé depuis le contrat persistant et le dernier rapport appliqué
de la tentative. Le claim lie la méthode et le résultat au sujet scellé. La
normalisation des domaines compare les contraintes dans leur ordre canonique.
Le worker est identifié à partir du processus d'oracle réellement exécuté.

La portée des claims reste étroite : le scout confirme des occurrences
littérales, sans authentifier ni interpréter les sources. Le daemon confirme le
seuil, les anomalies et la structure du rapport, sans établir la justesse ou la
provenance des mesures.

## Conséquences

### Positives

- Les deux missions peuvent démontrer C2/C3 avec des reçus liés au run courant,
  des coûts complets et une décision AEIS persistée.
- Deux stratégies de calcul distinctes protègent contre la réutilisation du
  même résultat de l'exécuteur par l'oracle.
- Les limites sémantiques des observations restent attachées au domaine de
  preuve.

### Négatives

- L'extension ne qualifie pas les missions libres ou les sources non fiables.
- Toute nouvelle méthode d'observation nécessite son propre sujet, ses
  postconditions et ses stratégies indépendantes.

## Alternatives

- Promouvoir à partir de l'artefact et du reçu du worker : rejeté, car ils
  proviennent de la même exécution et ne fournissent pas de contrôle indépendant.
- Réutiliser l'oracle `subset_sum` : rejeté, car ses postconditions ne
  correspondent ni au scan littéral ni au seuil numérique.
