# ADR 0741 — Preuves runtime de métacognition sociale V2-06

- **Statut** : Accepté
- **Date** : 2026-10-24
- **Domaine** : Runtime social, mémoire, expérimentation, preuves
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0736, ADR 0737

## Contexte

V2-06 compare six bras appariés, dont deux interventions sur les souvenirs sociaux.
Un rapport de modèle ne suffit pas à établir le résultat : les mémoires sources,
états persistés, décisions, appels de modèle et reçus d'intervention doivent être
reliés et vérifiables. Le dispatcher générique V3, lui, ne reçoit pas encore une
capture runtime qualifiée pour ces bras.

## Décision

Le runner autonome R2 produit les artefacts par graine et le validateur recalcule
les preuves et l'oracle à partir du manifeste, du cas et des fichiers référencés.
Un rapport incomplet ou dont le verdict ne correspond pas au recalcul est rejeté.
Le registre générique conserve `EXECUTABLE_ARMS=[]` pour V2-06 et retourne une
issue inconclusive tant que son contrat de capture n'est pas implémenté.

## Conséquences

### Positives

- Les rapports autonomes sont vérifiables contre le contrat expérimental versionné.
- Le transport du runner et la sortie du modèle ne sont pas confondus avec une preuve.
- Le dispatcher générique ne promeut aucun bras sans capture runtime correspondante.

### Négatives

- Le succès de l'expérience reste conditionné au résultat recalculé sur les graines;
  un runner opérationnel ne signifie pas que l'hypothèse passe.
- Le runner autonome et le dispatcher générique ont des contrats différents à maintenir.

## Alternatives

- Marquer les six bras exécutables dans le registre générique : rejeté, car il n'y a
  pas de capture compatible avec son contrat.
- Accepter le statut fourni par le runner ou le modèle : rejeté, car le verdict doit
  être recalculé à partir des preuves persistées.
