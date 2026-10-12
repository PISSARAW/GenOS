# ADR 0460 — Quorum lié aux membres d'Expert Committee

- **Statut** : Accepté
- **Date** : 2026-10-12
- **Domaine** : A-Team, variant `expert_committee`, consensus

## Contexte

Le calcul de consensus comptait chaque bulletin comportant un identifiant, une
décision et une référence de preuve. Un identifiant extérieur à l'équipe ou deux
bulletins du même membre pouvaient donc atteindre le quorum et produire
`SUCCEEDED`. La matrice d'expertises contenait pourtant la liste effective des
membres du runtime.

## Décision

- Le calcul exige une liste non vide de membres nommés et distincts.
- Un bulletin admissible doit appartenir à cette liste et porter une décision
  ainsi qu'au moins une référence de preuve non vide.
- Deux bulletins admissibles du même membre ou un bulletin extérieur sont
  refusés avant le décompte. Le quorum compte ainsi des membres distincts.
- Le runtime Expert Committee transmet les identifiants de sa matrice
  d'expertises au calcul de consensus.

## Conséquences et limites

Les appels directs au calcul de consensus doivent fournir `memberIds`. Les
bulletins incomplets ne participent pas au quorum. Les références restent des
déclarations de l'intégrateur : ce contrôle n'authentifie ni l'auteur du vote,
ni le contenu de la preuve, ni l'indépendance des délibérations. Une promotion
fondée sur des votes réellement attestés demandera des reçus émis et vérifiés
par une autorité serveur.

## Alternative écartée

Compter les bulletins sur leur seule structure laissait un quorum falsifiable
par duplication ou par ajout d'un participant extérieur.
