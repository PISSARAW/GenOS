# ADR 0326 — Audits philosophiques exécutables et preuves bornées

- Statut : Accepté
- Date : 2026-10-06
- Domaine : contrats philosophiques, expérimentation, Ontogenèse, preuve
- Lié à : [ADR 0318](0318-contrats-implementation-concepts.md), [ADR 0319](0319-raccord-contrats-philosophiques-ontogenese.md)

## Contexte

Les 375 entrées disposaient de contrats, mais 354 n’avaient qu’un mapping
déclaratif. Les 21 pilotes affichaient `tested` sans reçu associé. La préparation
structurale pouvait donc être confondue avec l’exécution ou la validation.
Le contrôle de maturité reconnaissait des noms de reçus fournis par le demandeur :
ces chaînes ne constituaient pas une preuve. Le raccord Ontogenèse transportait
des références sans imposer un audit des observations demandées.

## Décision

### Catalogue exécutable explicite

Associer chacun des 375 identifiants à un profil revuable : primitive, champ,
prédicat et interprétation. Aucune entrée inconnue ne reçoit un profil exécutable
par défaut. Conserver les notions concurrentes ; exposer leurs distinctions et
tensions comme relations de conception, pas comme preuves historiques.

### Portée bornée

Le mécanisme calcule une condition typée sur une observation déclarée. Il
enregistre une évaluation et produit une tâche de vérification et une réserve
de réponse lorsque le critère manque ou échoue. La composition conserve les
barrières existantes ; aucun audit ne crée de lease ni de permission.

La compilation conserve aussi les sources, interdictions et plans de tests
propres au contrat initial : les sondes bornées les complètent sans les effacer.
Le schéma courant est chargé une fois par compilation de registre, pas une
fois par contrat, puis appliqué à chaque entrée. Un schéma inaccessible ou
illisible fait échouer la compilation ; il n'est pas remplacé par un cache
global périmé.

Les résolutions canoniques construisent un index local à leur appel, en
conservant l'ordre de priorité et les premiers alias rencontrés. Le catalogue
de capacités reste frais entre missions ; aucun index de permissions n'est
partagé durablement. Cette réduction des reconstructions ne modifie pas les
délais de claim, les budgets ni les gates.

### Transport du catalogue

La lecture MCP est paginée, avec au plus 100 contrats par réponse et les
métadonnées `total`, `offset`, `limit`, `nextOffset`. Le filtre de cible précède
la pagination. La santé expose les comptes et erreurs, pas les contrats
complets : l'ensemble dépasse la taille de réponse autorisée. Des arguments
hors bornes sont rejetés, et la lease existante reste obligatoire.

Ces calculs n’implémentent pas tous les invariants philosophiques. La présence
d’un témoin n’est pas sa validité, une probabilité bornée n’est pas sa calibration,
une trace déclarée n’est pas une preuve de vérité externe. Cette limite
accompagne les contrats, les résultats et la documentation.

### Expérimentation reproductible

Comparer cas satisfaisant, contre-exemple et donnée absente avec activation,
ablation et répétition. Propager les évaluations dans quatre graphes simulés
avec trois graines. Mesurer messages, tours et portée après panne d’un nœud.
Ne pas qualifier ces simulations de missions multi-agents exécutées.

### Preuves et maturité séparées

Revenir à `mechanism-linked` au chargement. Un reçu de scénario porte
l’empreinte du contrat complet et doit résister au replay ; un nom de reçu
est rejeté. Une modification des limites ou du profil invalide l’ancien reçu.
L’éligibilité reste limitée à l’audit logiciel borné.

Le vérificateur Ontogenèse reconstruit les contrats courants, extrait les valeurs
depuis des sources JSON confinées, contrôle mission et empreintes, puis rejoue
avant intégration et après les checks du workspace intégré. Les concepts
explicitement demandés deviennent des exigences ; le contexte automatique
reste consultatif. Les artefacts `.genos` ne sont pas du code à commiter et
n’accordent aucun droit d’écriture supplémentaire.

Le hash d’une source lie son contenu au calcul, pas à une vérité externe.
La reconnaissance des reçus runtime par la gouvernance de maturité et la
validation indépendante sur missions réelles restent distinctes : `integrated`
et `validated` ne sont pas auto-attribués.

## Conséquences

### Positives

- 375 interprétations d’audit deviennent exécutables sans 375 modules isolés.
- Une absence ou un contre-exemple modifie l’état de manière observable.
- Une sortie falsifiée reste détectable même si son hash est recalculé.
- Une référence de contrat périmée ne satisfait pas la vérification courante.
- Simulation, intégration et validation générale restent des degrés distincts.

### Limites et travail restant

- Les critères simples ne réalisent pas tous les invariants des 375 concepts.
- Les tâches et réserves nécessitent des consommateurs runtime contrôlés.
- Les observations d’un worker ne sont pas indépendantes de lui par défaut.
- La couverture des audits ne vaut pas 100 % du plan initial : mécanismes
  spécialisés, comparaisons effectivement exécutées et validation indépendante
  sur missions représentatives restent nécessaires.

## Alternatives

1. Conserver les mappings déclaratifs : préparation seulement, pas comportement.
2. Valider les concepts après contrôle de schéma : rejeté, faute de mesure.
3. Réaliser 375 théories dans 375 modules : rejeté ; les mécanismes doivent être
   partagés et une position philosophique n’est pas un succès que le runtime décrète.
4. Élargir les permissions pour produire les preuves manquantes : rejeté ;
   l’absence de source ou d’autorité doit rester un blocage explicite.

## Vérification

Les tests opposables sont `test_philosophy_executable_contracts.js`,
`test_philosophy_compilation_boundaries.js`, `test_philosophy_contract_transport.js`,
`test_philosophy_observation_binding.js` et les suites Ontogenèse. Les résultats
globaux sont rapportés séparément ; une suite ciblée ne certifie pas une release
du monorepo.

Voir [le contrat détaillé](../03-reference/contrats-philosophiques-ontogenese.md)
et [la matrice exhaustive](../03-reference/matrice-operationnelle-philosophique.md).
