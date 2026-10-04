# ADR 0297 — Budget et rétroaction homéostatique AEIS

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : AEIS, runtime, ré-arbitration, budget
- **Lié à** : ADR 0294, ADR 0295

## Contexte

Le taux de vérification courant était pris pour un gain de preuve sans mesure précédente.
La pression restait identique quand la preuve progressait. Les clones exécutaient deux
commandes même sans oracle, et le recrutement choisissait une niche fixe sans consulter
l'affinité mémorisée ni le budget. La boucle de contrôle de promotion ne recevait pas les
résultats AEIS.

## Décision

Chaque claim dispose d'un budget borné de vérificateurs. Le cycle clonal n'est lancé
qu'avec un oracle résolu. Le recrutement utilise les reçus réellement exécutés pour
mesurer la diversité et privilégie une niche apprise si elle est disponible. La
ré-arbitration compare le taux de vérification avant et après recrutement ; la pression
réagit au delta et une seconde vérification reste possible si le quorum indépendant
manque sous forte pression et si le budget le permet.

Après l'assemblée de promotion, le score des reçus indépendants entre dans la boucle de
`controlRegulationService`. La pression et le score sont conservés dans les métriques du
run ; un veto de ré-arbitration bloque la finalisation.

## Conséquences

- Positives : effort borné, pression liée à un gain observé, choix de niche sensible à
  la mémoire et feedback visible sur le chemin réel de `approveRun()`.
- Négatives : les claims sans oracle ne bénéficient plus de l'expansion clonale ; un
  budget épuisé laisse une vérification inconclusive et la promotion échoue fermée.

## Alternatives

Augmenter toujours le nombre de vérificateurs aurait masqué l'absence de preuve tout en
consommant le budget. Employer le taux courant comme delta aurait ignoré la trajectoire.
