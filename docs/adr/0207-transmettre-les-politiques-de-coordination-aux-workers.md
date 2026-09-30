# ADR 0207 — Transmettre les politiques de coordination aux workers

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : Dispatch A-Team, coordination, handoffs
- **Décideurs** : Équipe GenOS
- **Lié à** : ADR 0200

## Contexte

Le dispatch A-Team construisait des champs `consults`, `communicationCadence` et
`contextHandoff`, mais le plan détaché les supprimait avant le lancement des workers.
Les politiques pouvaient ainsi être présentes dans le run sans être transmises à leur
destinataire.

## Décision

Le plan du runner conserve ces champs et les transmet au worker dans un objet
`coordination_policy`. Pour une variante `cross_functional_pod`, le prompt identifie les
domaines à consulter et demande au worker de consigner les consultations et leurs
résultats dans son rapport de preuves. Les dépendances du WorkGraph restent le mécanisme
de séquencement et les handoffs typés restent attachés aux dépendances vérifiées.

Cette modification rend la politique accessible et explicite au worker. Elle ne prétend
pas vérifier qu'une consultation humaine ou inter-agent a eu lieu : un futur gate devra
consommer des références de consultation structurées avant de déclarer cette obligation
satisfaite.

## Conséquences

### Positives

- Les métadonnées de coordination survivent au passage du dispatch au runner détaché.
- Les workers de pod reçoivent les domaines à consulter plutôt qu'une instruction vague.
- L'état de la coordination peut être inspecté dans le payload de dispatch.

### Négatives

- L'exécution et la preuve des consultations demeurent distinctes ; le prompt seul n'est
  pas une preuve.
- Les exécuteurs externes qui ignorent `coordination_policy` ne peuvent pas exploiter ses
  métadonnées, même si l'instruction textuelle reste dans la mission.

## Alternatives

- Considérer la présence des champs dans le run comme une coordination exécutée : rejeté,
  car la persistance d'une politique n'en prouve pas l'application.
- Bloquer la clôture sans références structurées de consultation : reporté, car le
  runtime actuel ne produit pas encore ces références de manière canonique.
