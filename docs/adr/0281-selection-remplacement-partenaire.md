# ADR 0281 — Séparer sélection et remplacement du partenaire

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : Holobionte, compétition, succession
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0277, ADR 0280

## Contexte

La sélection compétitive évaluait les essais puis appelait également le callback
d'approbation du remplacement. Deux transitions distinctes partageaient ainsi une
opération et pouvaient être confondues par l'appelant.

## Décision

La sélection ne fait que désigner un champion vérifié. Une opération distincte
autorise le remplacement seulement si l'essai est encore vérifié, la restauration et
la sauvegarde de retour arrière sont validées, et l'approbation explicite est
accordée. Aucune de ces portes ne peut être déduite du rang du candidat.

## Conséquences

### Positives

- Le choix est sans effet de remplacement.
- L'autorisation expose chaque motif de blocage.

### Limites

- L'appelant doit conserver le dossier d'essais sélectionné pour la seconde étape.
- Les effets de remplacement restent à exécuter par un service aval autorisé.

## Alternatives

- Garder une seule opération avec un callback facultatif : rejeté, car cela mélange
  décision de sélection et transition de succession.
