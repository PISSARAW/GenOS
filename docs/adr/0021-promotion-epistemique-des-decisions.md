# ADR 0021 — Promotion épistémique des décisions

- **Statut** : Accepté
- **Date** : 2026-09-17
- **Domaine** : Épistémologie, contrats de stratégie, promotion, mémoire
- **Décideurs** : Équipe GenOS
- **Lié à** : [socle épistémique](0019-socle-epistemique-du-savoir.md), [preuve et épistémologie](../01-concepts/epistemologie-et-evidence.md)

## Contexte

Les analyses de savoir, d’inférence et de vérité pouvaient être produites ou
persistées sans modifier le statut d’une décision. Une analyse interprétative,
disputée ou insuffisamment provenancée risquait donc d’être traitée comme une
preuve ordinaire lors de la promotion.

## Décision

Normaliser les résultats fournis au contrat sous `epistemic_context`. Le contrat
expose les identifiants d’analyse, le statut interprétatif, la complétude de la
provenance et les exigences de promotion. Le gate refuse une promotion liée à
une analyse non suffisamment étayée tant qu’une vérification épistémique
explicite n’est pas fournie. La mémoire worker conserve ces métadonnées,
catégorise l’expérience comme interprétative et interdit sa transmission
exosomique automatique.

## Conséquences

### Positives

- La provenance et le statut interprétatif ont un effet observable sur la promotion.
- Les analyses restent auditables dans la mémoire sans devenir des faits vérifiés.
- Les décisions conservent un chemin explicite entre analyse, preuve et gate.

### Négatives

- Les décisions interprétatives exigent une étape de vérification supplémentaire.
- Les analyses non vérifiées ne peuvent pas enrichir automatiquement le patrimoine partagé.

## Alternatives écartées

- Ajouter seulement un champ informatif au rapport sans effet sur le gate.
- Convertir automatiquement une analyse philosophique en preuve.
