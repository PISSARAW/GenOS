# ADR 0086 — Runtime événementiel Holobionte

- **Statut** : Accepté
- **Date** : 2026-09-24
- **Domaine** : Holobionte, runtime, contrats, contribution, mémoire
- **Décideurs** : GenOS
- **Lié à** : ADR 0056, ADR 0057, ADR 0073, ADR 0074, ADR 0078

## Contexte

Le Host doit réutiliser ses capacités résidentes au fil des missions et réagir aux
événements de mission, de demande de capacité et de heartbeat. Une boucle générique
ne doit ni inventer de contributions ni contourner les étapes d'admission.

## Décision

Le runtime traite une liste bornée d'événements, observe la session, cherche un
résident portant un contrat actif pour la capacité demandée, puis retourne un gap
et un classement si aucun contrat résident ne correspond. Une exécution nécessite
un moteur fourni par l'appelant et une attestation `VERIFIED` avec références.
Le planificateur de ressources, le ledger vérifié, la mémoire épisodique et
l'évaluation de santé réutilisent les services Holobionte existants.

La santé retourne les recommandations de sanction ou de succession sans les
appliquer automatiquement. La découverte, l'essai, l'admission et la décision
dormance restent dans leurs services dédiés; le runtime ne simule pas leur succès.

## Conséquences

### Positives

- Les missions réutilisent les résidents dont le contrat couvre la capacité.
- La réussite dépend d'une attestation et d'un ledger persistés.
- Les actions de gouvernance restent visibles et explicites.

### Négatives

- Un moteur et son format d'attestation doivent être intégrés par l'appelant.
- Les gaps nécessitent une étape séparée de découverte et d'admission.

## Alternatives

- Générer un résultat lorsqu'aucun moteur n'est branché : rejeté, car cela
  falsifierait une contribution et contournerait les gates de preuve.
