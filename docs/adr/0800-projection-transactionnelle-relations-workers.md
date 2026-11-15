# ADR 0800 — Projection transactionnelle des relations entre workers

- **Statut** : Accepté
- **Date** : 2026-11-15
- **Domaine** : workers, lignée, relations sociales, autorité, évolution
- **Décideurs** : mainteneurs GenOS
- **Lié à** : [ADR 0001](0001-agent-dna-binary-format.md), [ADR 0783](0783-expression-genomes-mutants-execution.md)

## Contexte

La naissance d'un worker écrivait sa filiation dans `lineage_nodes` et
`lineage_edges`, tandis que la parenté sociale lisait `agent_relations` et que le
récit familial dépendait encore de `family_history`. Une reproduction pouvait donc
réussir sans créer de famille observable. Les mutations dites mono-locus
recombinaient auparavant le génome avec un archétype, ce qui pouvait modifier des
loci non demandés. Les relations d'amitié et de subordination existaient dans le
catalogue sans être reliées de façon causale aux preuves et aux contrats runtime.

## Décision

Toute persistance de lignée projette atomiquement le même fait vers :

- le DAG génétique `lineage_nodes` / `lineage_edges` ;
- les relations `parent` et `sibling` de `agent_relations` ;
- un événement familial idempotent par parent ;
- les relations organisationnelles `manager` et `subordinate` lorsque
  `parent_agent_id` désigne effectivement le responsable administratif.

La relation génétique et le responsable administratif restent distincts. Une
étiquette `manager` ou `subordinate` ne crée aucune permission. L'exécution demeure
soumise à `parent_agent_id`, aux contrats de worker, à Cedar et aux reçus de
délégation existants.

Une mutation explicite part du génome persistant du parent et applique uniquement
les descripteurs demandés. La reproduction peut choisir un partenaire déclaré par
une relation `partner` ou `bonded_partner` et refuse par défaut les relations de
parenté proche. Le contournement de cette limite doit être explicite.

Une relation `friend` neuve ne reçoit aucun historique synthétique. Une relation de
collaboration ne devient `friend` qu'après au moins trois résultats indépendamment
vérifiés et un posterior de confiance suffisant. Les identifiants des évaluations
restent attachés aux métadonnées de la relation.

## Conséquences

### Positives

- Une naissance est immédiatement visible par les consommateurs génétiques,
  familiaux, sociaux et organisationnels.
- Les écritures partielles sont annulées par la transaction de lignée.
- Les mutations mono-locus deviennent attribuables au locus demandé.
- L'amitié acquiert une cause vérifiable et la subordination reflète une autorité
  déjà admise sans en fabriquer une nouvelle.

### Négatives

- Une naissance crée plusieurs projections persistantes et augmente le coût de la
  transaction.
- Les anciennes lignées ne sont pas rétroprojetées automatiquement ; une migration
  historique séparée sera nécessaire si elles doivent alimenter les nouveaux
  consommateurs.
- Le refus des parents proches peut modifier des scénarios historiques qui
  utilisaient une paire explicitement apparentée.

## Alternatives

- Lire directement `lineage_edges` depuis tous les consommateurs : écarté, car les
  relations sociales et organisationnelles portent des propriétés et des cycles de
  vie différents.
- Faire de `agent_relations` l'autorité génétique unique : écarté, car le DAG de
  lignée conserve les génomes, scores et types d'arêtes nécessaires à l'évolution.
- Autoriser le contrôle à partir du type `manager` : rejeté, car une étiquette
  sociale ne constitue ni un contrat ni une preuve d'autorité.

## Validation

Le scénario `backend/tests/test_worker_relations_e2e.cjs` couvre la parenté
biparentale, la fratrie, le récit familial dédupliqué, le refus des proches parents,
la mutation mono-locus, la promotion vérifiée vers l'amitié et la projection de la
subordination.
