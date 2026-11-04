# ADR — Phases de mutation et primitives exécutables

- **Statut :** correctif Node implémenté, validation native à conserver séparément.
- **Date :** 2026-11-04.

## Contexte

Le trait de classement `mutation` est partagé par des stratégies qui modifient
des scénarios, transmettent des connaissances, croisent des candidats ou mutent
un génome. Activer systématiquement `controlled_mutation` à partir de ce trait
imposait `genos_resilience_hypermutation` à `mutated_incident_universes`, dont les
primitives sont `production_snapshot`, `mutated_universes` et `signature_match`.
Le refus `REQUIRED_PHASES_UNAVAILABLE` était reproductible sur une demande
d'expérimentation contenant du contexte d'incident.

## Décision

Activer la phase de mutation du génome à partir des primitives `mutate` ou
`hypermutation` de la stratégie primaire canonique. Conserver explicitement le
mode de l'algorithme génétique et conserver les contrôles de couverture du
portefeuille, les leases, les preuves et les contrôles de promotion.

La mutation de scénarios ne prétend pas fournir l'hypermutation du génome.
Une vraie stratégie de mutation dont le portefeuille ne couvre pas la phase
obligatoire reste bloquée avant tout démarrage du runtime.

## Conséquences

Les stratégies d'incident et de transmission n'héritent plus d'une phase
incompatible par simple trait de classification. Recuit simulé, hypermutation
et algorithme génétique conservent leur phase obligatoire. Le test de régression
vérifie ces deux cas et un refus avec capacité absente.

Les résultats du premier pilote de température restent un banc réduit. Ils
ne sont pas requalifiés rétroactivement en exécution autonome complète.

Pour reproduire son budget sur le chemin natif, une mission peut déclarer
`executionPolicy.inferenceLimits: {attempts: 1, outputTokens: 1536}`. Ces
limites sont validées, inscrites par empreinte dans l'enveloppe d'autorité,
et contrôlées avant l'acceptation des preuves. Les retirer ou les modifier
après scellement invalide le contexte. Une tentative échouée reste un échec.
Les plafonds spécialisés plus bas restent prioritaires et les budgets
totaux ne sont pas augmentés. Sans cette option, le comportement est inchangé.

## Alternatives

- Désactiver l'orchestration autonome ou ignorer les phases omises : rejeté,
  car cela contournerait le refus.
- Ajouter un alias entre mutation de scénarios et hypermutation du génome :
  rejeté, car cela déclarerait une capacité absente.
- Augmenter le budget : ne résout pas l'incompatibilité sémantique.
