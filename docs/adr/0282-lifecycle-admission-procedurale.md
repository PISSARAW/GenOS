# ADR 0282 — Lier le variant procédural au cycle d'admission

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : Holobionte, contrats, essais, admission
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0277, ADR 0281

## Contexte

Le variant procédural produisait une proposition de recrutement mais ne pouvait pas
enchaîner les services de contrat, d'essai et d'admission déjà présents dans le
Holobionte.

## Décision

Les workflows persistants du variant procédural peuvent appeler la création du
SymbiosisContract, le démarrage de l'essai et l'évaluation de celui-ci. Chaque étape
réutilise la révision de session retournée par l'étape précédente; les opérations de
contrat et d'admission existantes conservent leurs validations, événements et reçus.
Ces opérations directes sont réservées au workflow procédural.

## Conséquences

### Positives

- Le plan de recrutement peut être suivi du contrat jusqu'à la décision d'admission.
- Les portes de portée, budget, preuves, revue immunitaire et contribution demeurent
  celles des services métier existants.

### Limites

- Le workflow n'est toujours pas transactionnel; chaque transition est durable.
- L'appelant doit fournir un contrat complet compatible avec la constitution de
  l'hôte; le plan ne fabrique pas les obligations manquantes.

## Alternatives

- Copier la logique des services dans le runtime des variants : rejeté, car cela
  créerait deux autorités concurrentes pour le même cycle de vie.
