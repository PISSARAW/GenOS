# ADR 0689 — Isoler le laboratoire synthétique DiCode de la décision réelle

- **Statut** : Accepté
- **Date** : 2026-10-19
- **Domaine** : workers, apprentissage, responsabilité, preuve, promotion, rollback
- **Décideurs** : mainteneurs GenOS
- **Lié à** : ADR 0481, ADR 0483, ADR 0622

## Contexte

Une boucle inspirée de « Dreaming in Code » peut fabriquer un environnement
pédagogique pour explorer une lacune, par exemple une obligation de rollback
sans propriétaire. Cette liberté est utile pour produire un capteur ou un test
temporaire, mais elle crée un risque épistémique : une fixture réussie pourrait
être présentée comme la preuve que la décision de production s'est améliorée.

Le runtime worker possédait déjà un rapport clinique explicitement synthétique
et l'interdiction générale d'auto-promotion. Il lui manquait un contrat
exécutable reliant la génération d'un banc, son confinement, une mesure réelle
indépendante, une gate de promotion distincte et le retrait du candidat.

## Décision

Le crate `genos-worker` expose deux frontières complémentaires.

### Laboratoire pédagogique temporaire

`dreaming::build_responsibility_bench` accepte une seule lacune et un budget
portant sur le nombre d'essais, les échantillons du capteur et le temps écoulé.
Le banc est toujours créé avec :

- l'environnement `synthetic_educational` ;
- `production_access: false` et `ephemeral: true` ;
- des références limitées à `fixture://` ou `synthetic://` ;
- un retrait définitif qui interdit toute nouvelle observation.

Un dépassement de budget ou une référence non synthétique échoue fermé. Le
résultat conserve toujours `production_proof: false` et
`promotion_eligible: false`.

### Effet réel, promotion et retrait

`dreaming_promotion::assess_real_decision` compare la couverture de
responsabilité avant/après sur la même décision. Un progrès n'est reconnu que
si la mesure vient du système réel, comporte des preuves et un reçu de
validation indépendante. Cette conclusion reste non promotrice.

`evaluate_promotion` est une étape séparée. Elle exige en plus une approbation
humaine, un reçu de politique et un rollback réversible. Son verdict indique
une éligibilité ; il n'exécute aucun déploiement.

`evaluate_withdrawal` surveille ensuite une mesure réelle. L'absence de preuve
ou une couverture sous le seuil provoque un retrait fail-closed et sélectionne
la référence de rollback déclarée.

## Conséquences

### Positives

- L'environnement pédagogique peut rechercher une lacune sans acquérir
  d'autorité sur la production.
- La preuve d'amélioration vient d'une observation réelle indépendante, pas de
  la fixture qui a suggéré le capteur.
- Les budgets bornent le coût du rêve et le retrait termine son cycle de vie.
- La promotion et le rollback deviennent deux décisions visibles et testables.

### Négatives et limites

- Le module modélise les contrats ; il ne provisionne pas de sandbox OS et
  n'exécute pas lui-même un rollout.
- Les schémas de références et reçus sont opaques dans ce crate. Leur signature
  et leur persistance restent la responsabilité des gates appelants.
- Une hausse de couverture mesure seulement l'attribution des obligations ;
  elle ne prouve pas toute la qualité ou l'innocuité de la décision.

## Preuves exécutables

`cargo test -p genos-worker dreaming` vérifie six cas : confinement du banc,
budget et origine des preuves, absence de promotion synthétique, mesure réelle
indépendante, gate séparée et retrait vers le rollback déclaré.

## Alternatives écartées

- **Promouvoir après réussite de la fixture** : confond apprentissage
  pédagogique et preuve de production.
- **Autoriser le banc à lire la production** : détruit sa frontière de
  confinement et mélange les provenances.
- **Fusionner mesure et promotion** : accorde une autorité implicite au
  composant qui évalue son propre effet.
- **Conserver un candidat sans surveillance** : rend la régression et le
  rollback inobservables.
