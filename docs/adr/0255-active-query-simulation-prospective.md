# ADR 0255 — Active Query de simulation prospective

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : AGOW, Active Query, contrefactuels
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0241, ADR 0249

## Contexte

Active Query sait demander une preuve, une cause, un rappel ou une calibration, mais ne
peut pas demander la conséquence probable d'une action. Le runner shadow AGOW doit rester
l'unique autorité d'exécution contrefactuelle.

## Décision

Ajouter la capacité `prospective_simulation` et son handler query `counterfactual`. Il
retrouve les candidats du frame, demande explicitement un cycle shadow au runner et
retourne des reçus de branches comme références de preuve. Le candidat agrégé conserve
`counterfactual_simulated`, `simulationId` et le frame réel parent. Aucun environnement
ou outcome n'est synthétisé quand l'exécuteur n'est pas disponible.

## Conséquences

### Positives

- Active Query peut distinguer un manque de faits d'un manque de conséquences simulées.
- Le résultat garde la provenance simulée et revient comme candidat auditable.

### Négatives

- Le runner dépend toujours d'un exécuteur environnemental enregistré.
- Une requête ne constitue pas un environnement métier restauré ni une preuve calibrée.

## Alternatives

- Interroger directement un modèle du monde sans isolation : rejeté, car les résultats
  ne porteraient pas l'identité de simulation et pourraient contaminer le réel.
