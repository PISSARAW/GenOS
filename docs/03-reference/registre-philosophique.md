# Registre philosophique — référence et gouvernance

- **Statut** : Opérationnel avec concepts partiels
- **Portée** : registre canonique, audits logiciels bornés et gouvernance des preuves
- **Dernière revue** : 2026-10-06

## Rôle

Le registre philosophique fournit un vocabulaire canonique interrogeable par le
routeur philosophique et MCP. Il décrit des concepts, leurs relations, leur
provenance et leur niveau de maturité. Il ne constitue pas une base de vérité
philosophique et ne confère aucune autorité d'exécution.

Le sous-domaine `mathematics` est documenté dans
[philosophie des mathématiques](../01-concepts/philosophie-des-mathematiques.md).

## Sources de vérité

| Élément | Source |
| --- | --- |
| Concepts | `backend/src/philosophy/conceptDefinitions.js` |
| Normalisation et validation | `backend/src/philosophy/conceptRegistry.js` |
| Relations philosophiques | `backend/src/philosophy/relationRegistry.js` |
| Sous-domaines GenOS | `backend/src/philosophy/genosSubdomains.js` |
| Maturité des services | `backend/src/philosophy/serviceMaturity.js` |
| Contrats philosophiques | `backend/src/philosophy/implementationContracts.js`, `spec/implementation-contract.schema.json` |
| Profils des 375 audits | `backend/src/philosophy/operationalProfiles.js`, `operationalPredicates.js`, `contractRuntime.js` |
| Expériences et reçus rejouables | `backend/src/philosophy/contractExperiments.js`, `contractPromotion.js` |
| Observations de mission | `backend/src/services/ontogenesis/philosophicalObservationService.js` |
| Raccord Ontogenèse | `backend/src/services/ontogenesis/canonicalConceptRegistry.js`, `missionCapabilityPlanService.js`, `runtimeHarness.js` |

La documentation explique le modèle ; elle ne duplique pas le registre canonique.

## Contrats d’implémentation

Le compilateur `backend/src/philosophy/implementationContracts.js` transforme
les 375 concepts en contrats structurés. Les 21 contrats pilotes conservent leurs
invariants détaillés ; chaque entrée possède désormais un profil d'audit explicite
dans `operationalProfiles.js`. Aucun profil n'est déduit par un fallback de domaine.
Les contrats compilés portent `executable-audit` et `mechanism-linked` : ce statut
prouve l'existence du mécanisme logiciel, pas l'implémentation complète de la théorie.
Le format est versionné par `spec/implementation-contract.schema.json`.
Chaque contrat contient une interprétation, un invariant, un mécanisme partagé,
des observables, un scénario comparable, des tests de falsification, des limites
et une responsabilité. Chaque entrée possède aussi une expérience planifiée,
un baseline, une hypothèse, un critère de succès et un critère de rejet.
Les scénarios planifiés restent distincts des expériences réellement exécutées.
`runImplementationExperiment` réalise trois cas (critère satisfait, contre-exemple,
observation absente), une ablation et une répétition, sur quatre simulations de
graphes et trois graines : 36 cas par contrat, 13 500 pour le registre. Les graphes
ne sont pas des dispatchs runtime ; les fixtures ne sont pas des missions réelles.

`executeImplementationContract` produit un état d'audit : observations évaluées,
incertitudes, tâches de vérification et réserves de réponse. L'opération retourne
cet état sans modifier les permissions, les leases ou les stores des agents.
Pour les contrats `core.*`, une observation non satisfaite peut seulement ajouter
une retenue de promotion ; un audit satisfait ne lève jamais une retenue existante.

Le routeur expose aussi `listImplementationContracts`, `getImplementationContract`,
`implementationContractHealth`, `implementationReadiness` et
`implementationExperimentCoverage`. La readiness contrôle le schéma et le profil ;
elle n'exécute pas une campagne et n'accorde pas de promotion.

La liste des contrats est paginée : `arguments.offset` commence à zéro,
`arguments.limit` est un entier de 1 à 100 (100 par défaut), et le filtre de
cible précède le découpage. La réponse fournit `contracts`, `total`, `offset`,
`limit` et `nextOffset`. Reprendre cet offset jusqu'à `null` pour lire les
375 entrées. La santé conserve les comptes et erreurs, sans dupliquer le
catalogue complet dans une réponse MCP trop grande.

Les sources et interdictions initiales sont conservées lors de la compilation.
Les plans de tests spécialisés restent des plans ; leur présence aux côtés des
sondes bornées ne certifie pas leur exécution. Les objets JSON identiques ne
suffisent pas à satisfaire un critère de pluralité par simple différence
d'identité en mémoire.

`assessContractPromotion` accepte comme preuve de scénario uniquement un reçu
lié à l'empreinte complète du contrat et reproduit par le même exécuteur canonique.
Une chaîne telle que `scenario-receipt`, un booléen de succès ou un reçu modifié
puis réempreinté ne comptent pas. Les cibles `integrated` et `validated` restent
refusées : le service de maturité ne vérifie pas encore d'attestation runtime et
indépendante. Les reçus de mission décrits ci-dessous ne comblent pas implicitement
cette lacune. Tous les verdicts conservent `promotionEligible: false`.

La [matrice opérationnelle](matrice-operationnelle-philosophique.md) énumère les
375 profils. La référence des contrats précise les prédicats, bornes, protocoles,
limites et travaux restant à réaliser pour une validation sur missions réelles.

La santé du registre est vérifiée au chargement et par la suite
`backend/tests/test_philosophy_registry_health.js`. Une entrée peut rester
`partial` ou `planned` sans devenir une capacité d'exécution : le statut
philosophique et la maturité du service restent deux dimensions séparées.

## Raccord à l’Ontogenèse

Le détail du flux est décrit dans
[Contrats philosophiques dans l’Ontogenèse](contrats-philosophiques-ontogenese.md).
En résumé, le registre canonique attache à chaque concept son contrat complet et
une référence compacte. Lorsqu’une mission sélectionne ou demande un concept,
`missionCapabilityPlanService` déduplique ces références dans
`philosophicalContracts`, puis `runtimeHarness` les transmet au runner.

Les concepts explicitement demandés par la mission deviennent des audits requis ;
les références ajoutées automatiquement pour contextualiser la planification
restent consultatives (`requiredForMission: false`). Le runner reçoit l'instruction
de produire `.genos/philosophy-observations.json`, lié à l'identifiant de mission
et aux empreintes des contrats. Les valeurs sont lues dans des fichiers JSON
confinés, au moyen de pointeurs déclarés : la présence du manifeste seul ne suffit pas.

`integrationController` rejoue ces lectures et audits avant le passage `verified`,
avant l'intégration, sur les sources intégrées et à la reprise d'un commit. Absence,
contre-exemple, empreinte obsolète ou source modifiée provoquent un refus. Le reçu
lie les octets lus, les contrats et le hash de contenu ; il ne prouve ni la vérité
de ces déclarations ni leur indépendance. Une topologie incompatible reste bloquée.
Aucun de ces contrôles n'élargit l'autorité d'exécution ou de promotion.

Les adaptateurs bornés de qualia, d'intentionnalité, de supervenience,
d'émergence et de modèles esprit-corps sont opérationnels via `evaluateConcept`
et fournissent leurs limites dans la réponse. La première tranche ontologique
décrite ci-dessous reste partiellement opérationnelle :
`ontology.person-other`, `ontology.continuous-discrete` et
`ontology.possible-worlds` disposent de services bornés, persistants et testés.
Cette implémentation décrit des relations, des transitions et des hypothèses ;
elle ne transforme pas une analyse ontologique en preuve ni en autorisation.

## Contrat d'une entrée

Une entrée possède au minimum :

- un identifiant stable en minuscules (`domain.concept`) ;
- un libellé, une famille et une école ;
- un statut (`implemented`, `partial`, `interpretive`, `disputed`, `planned` ou `registered`) ;
- des sous-domaines GenOS explicites ;
- une maturité de service séparée du statut philosophique ;
- une provenance lorsque l'entrée repose sur une source externe.

Un statut `implemented` signifie qu'un adaptateur testable existe. Il ne signifie
pas que GenOS implémente la théorie philosophique dans toute sa portée.

## Gouvernance des relations

Une relation doit :

1. pointer vers des concepts existants ;
2. utiliser un type déclaré dans le registre ;
3. rester justifiable par une note ou une provenance lorsque l'interprétation est contestable ;
4. distinguer une opposition théorique d'un mapping technique ;
5. être rejetée si elle transforme une analogie en permission runtime.

Les relations dynamiques entre entités runtime sont traitées séparément par
`ontology_relations` et ne doivent pas être confondues avec les relations
philosophiques déclaratives.

## Procédure de changement

Toute nouvelle entrée ou relation doit inclure :

1. l'identifiant et le libellé ;
2. la famille, l'école et le sous-domaine GenOS ;
3. le statut et le niveau de maturité ;
4. les relations entrantes ou sortantes pertinentes ;
5. un test de validation ou de refus ;
6. la mise à jour de cette référence si le contrat évolue.

Une modification du schéma, du routeur ou de la persistance nécessite un ADR.

## Garde-fous

- Un concept conceptuel ne doit pas être annoncé comme une capacité runtime.
- Un service philosophique ne modifie pas les leases, droits, branches ou barrières
  d'évidence sans passer par les contrôles dédiés.
- Une métrique d'intégration, de valence ou de cognition ne prouve pas une
  expérience subjective.
- Une sortie réussie du routeur prouve uniquement qu'une opération a été traitée,
  pas que l'argument philosophique est vrai.

Les analyses métalogiques et paradoxales sont des services runtime bornés et
testés ; `implemented` signifie uniquement qu'un adaptateur exécutable existe.
Les analyses scientifiques et sceptiques suivent le même principe : leur
adaptateur est testable, mais leur `epistemic_context` reste interprétatif et
non promouvable sans preuve indépendante.
Les adaptateurs d’épistémologie sociale et de reliabilisme suivent la même
règle : les indices de crédibilité, de corroboration ou de fréquence observée
restent des éléments révisables, pas des autorités autonomes.
