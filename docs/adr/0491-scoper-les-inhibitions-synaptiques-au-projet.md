# ADR 0491 — Scoper les inhibitions synaptiques au projet

- **Statut** : Accepté et implémenté.
- **Date** : 2026-10-15
- **Domaine** : Recherche mémoire, inhibition GABA et isolation des projets.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0490, scope authentifié du pruning synaptique ; ADR 0389, scopes des consommateurs mémoire.

## Contexte

La recherche mémoire restreignait les synapses inhibitrices à l'organisation
quand un projet était fourni, mais la requête ne comparait pas
`memory_synapses.project_id`. Un lien GABA d'un autre projet de la même
organisation pouvait donc modifier l'état `inhibitorySignal` d'un résultat
visible dans le projet courant.

## Décision

Le calcul de l'inhibition utilise la même portée que la recherche : organisation
et projet quand ils sont fournis; organisation seule si aucun projet n'est
demandé; lignes globales `organization_id IS NULL AND project_id IS NULL`
seulement avec `includeGlobal`. Un appel sans tenant reste limité aux lignes
globales. La requête conserve les liens globaux explicites comme exception
distincte d'un projet étranger.

## Conséquences

### Positives

- Une synapse d'un autre projet n'altère plus le signal d'inhibition d'une
  mémoire du projet courant.
- Le comportement `includeGlobal` correspond à celui de la recherche des
  souvenirs et exige que les deux colonnes de tenant soient nulles.
- Le test couvre une mémoire trouvée dans le projet courant avec une arête GABA
  injectée dans un projet voisin.

### Négatives

- Une recherche à portée organisation sans projet conserve la vue agrégée des
  projets de cette organisation, conformément à la portée des décisions.

## Alternatives

- Filtrer par organisation seulement : rejeté, car cela mélange les projets.
- Exclure tous les liens globaux lorsqu'un projet est choisi : rejeté, car
  `includeGlobal` autorise explicitement ces liens partagés.
