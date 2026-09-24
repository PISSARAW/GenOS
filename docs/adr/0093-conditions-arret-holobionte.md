# ADR 0093 — Conditions d'arrêt du Holobionte

- **Statut** : Accepté
- **Date** : 2026-09-24
- **Domaine** : Holobionte, cycle de vie, missions, gouvernance
- **Décideurs** : GenOS
- **Lié à** : ADR 0056, ADR 0057, ADR 0078, ADR 0086

## Contexte

Un arrêt ne doit pas masquer une mission inachevée, une sortie promue qui n'a pas
passé les gates immunitaires ou une défaillance critique encore ouverte. Un Host
persistant doit pouvoir reprendre son activité lors d'une mission ultérieure.

## Décision

Une session liée à une mission ne se ferme qu'après confirmation de son achèvement,
de la validation immunitaire de toutes ses sorties promues et de l'absence de
défaillance critique. Le service retourne les gates manquantes sans modifier son état.

Un Host persistant sans mission active et sans défaillance critique passe à
`QUIESCENT`. La dormance des symbiontes résidents utiles reste une sanction explicite,
avec preuve et conditions de reprise. À la prochaine mission, le même Host revient
à `ACTIVE`; toutes les transitions sont persistées dans le journal de cycle de vie.

## Conséquences

### Positives

- Les sessions de mission ne se ferment pas avant la validation de leurs résultats.
- Le Host persistant conserve son identité et son historique entre les missions.
- La dormance demeure traçable et soumise à des preuves.

### Négatives

- L'appelant doit fournir les états d'achèvement et de validation immunitaire.
- La reprise dépend de la réactivation explicite par le service d'ouverture de mission.

## Alternatives

- Détruire le Host après chaque mission : rejeté, car cela perdrait la continuité des résidents.
- Fermer dès que le moteur termine : rejeté, car cela contournerait les gates de preuve.
