# ADR 0483 — Fonder la promotion du rollout sur le candidat

- **Statut** : Accepté et implémenté.
- **Date** : 2026-10-14
- **Domaine** : Rollouts A/B et promotion de release.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0482, atomicité entre mesures et décision de rollout.

## Contexte

Le gate de rollout appliquait le seuil minimal de requêtes au total des variantes.
Dans un test A/B, le trafic du contrôle pouvait donc satisfaire le seuil alors que
le candidat n'avait reçu aucune requête. De plus, la décision sélectionnait le
meilleur variant, mais activait la release dès que le candidat respectait ses SLO,
même lorsque le contrôle était le gagnant.

Ces comportements confondaient « les SLO du candidat sont acceptables » avec
« les preuves justifient de promouvoir le candidat ».

## Décision

Le minimum d'échantillon est calculé sur les seules requêtes du candidat. Tant que
ce minimum n'est pas atteint, le rollout reste en pause avec le nombre de requêtes
du candidat dans la décision.

Après vérification des SLO du candidat, la promotion n'est possible que si le
candidat est le variant sélectionné par la comparaison. Si un autre variant gagne,
le rollout est clôturé en `rolled_back` avec la raison `candidate_underperformed`.
Cette règle s'applique aux rollouts canary et A/B.

## Conséquences

### Positives

- Le seuil statistique ne peut pas être rempli par du trafic étranger au candidat.
- Une release n'est pas déclarée promue lorsque le contrôle gagne.
- La décision persistée conserve le variant sélectionné et les métriques candidat.

### Négatives

- Un rollout dont le candidat reçoit peu de trafic reste en pause, même si le trafic
  total est élevé.
- En cas d'égalité, l'ordre stable des variantes peut sélectionner le contrôle ;
  la promotion échoue alors de manière conservatrice.

## Alternatives

- Compter les requêtes de toutes les variantes pour le minimum : rejeté, car cela
  autorise une décision sans échantillon candidat.
- Promouvoir dès que le candidat respecte les SLO, quelle que soit la comparaison :
  rejeté, car cela présente comme gagnant un candidat que le rollout a mesuré comme
  inférieur au contrôle.

## Vérification

`node backend/tests/test_release_operations.js` vérifie qu'un contrôle avec vingt
requêtes ne compense pas un candidat vide et qu'un candidat plus lent que le
contrôle est rollbacké. Les tests de permissions de promotion et de véracité de la
promotion restent également exécutés.
