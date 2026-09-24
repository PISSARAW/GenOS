# ADR 0081 — Intégration de Trinity au Holobionte

- **Statut** : Accepté
- **Date** : 2026-09-24
- **Domaine** : Holobionte, Trinity, sélection, admission
- **Décideurs** : GenOS
- **Lié à** : ADR 0073, ADR 0076, ADR 0078

## Contexte

Plusieurs symbiontes candidats peuvent sembler répondre au même besoin. Leur
comparaison exige des dossiers indépendants et des preuves, tandis que leur
admission reste une décision du Host.

## Décision

L'adaptateur soumet trois rapports de mondes à la comparaison Trinity existante,
avec son analyse Pareto et ses gates de preuve. Seul un gagnant unique accepté par
Trinity peut devenir un candidat de kind compatible et porteur de la capacité
requise. Le candidat conserve les références issues du dossier gagnant. Un échec ou
une égalité retourne `NEEDS_REVIEW` et ne modifie pas le Host. L'essai et l'admission
Holobionte restent requis après sélection.

## Conséquences

### Positives

- Les concurrents sont comparés par le service Trinity existant.
- Le Host n'accepte pas un résultat ambigu ou sans dossier gagnant prouvé.
- La sélection ne confère ni contrat ni statut résident.

### Négatives

- L'appelant doit fournir trois rapports associés correctement aux candidats.
- Le score comparatif dépend du domaine et des seuils choisis.

## Alternatives

- Admettre le candidat au score le plus élevé sans gate comparatif : rejeté, car un
  score relatif n'établit pas à lui seul qu'un résultat est promouvable.
