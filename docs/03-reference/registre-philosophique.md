# Registre philosophique — référence et gouvernance

- **Statut** : Opérationnel avec concepts partiels
- **Portée** : concepts, relations et mappings philosophiques déclaratifs
- **Dernière revue** : 2026-09-17

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
| Contrats | `spec/philosophical-concept.schema.json`, `spec/ontology-relation.schema.json` |

La documentation explique le modèle ; elle ne duplique pas le registre canonique.

## Contrats d’implémentation

Le compilateur `backend/src/philosophy/implementationContracts.js` transforme
les 375 concepts en contrats structurés. Les 21 concepts transversaux disposent
de contrats pilotes détaillés ; les 354 autres sont reliés à un mécanisme partagé
et marqués `mapped-pending-behavior`.
Le format est versionné par `spec/implementation-contract.schema.json`.
Chaque contrat contient une interprétation, un invariant, un mécanisme partagé,
des observables, un scénario comparable, des tests de falsification, des limites
et une responsabilité. Chaque entrée possède aussi une expérience planifiée,
un baseline, une hypothèse, un critère de succès et un critère de rejet.
Les expériences déclarent aussi la topologie de référence `isolated_critics` et
les variantes `centralized`, `federated` et `peer_to_peer`.
Les 354 contrats mappés ne sont pas présentés comme des fonctionnalités : leur
mapping n’est pas encore une preuve de comportement.
Le routeur expose les contrats en
lecture seule via `listImplementationContracts`, `getImplementationContract` et
`implementationContractHealth`. L’opération `implementationReadiness` exécute
un contrôle borné sur les 375 contrats et ne marque jamais un contrat comme
promouvable : elle établit seulement `ready-for-experiment`.

La santé du registre est vérifiée au chargement et par la suite
`backend/tests/test_philosophy_registry_health.js`. Une entrée peut rester
`partial` ou `planned` sans devenir une capacité d'exécution : le statut
philosophique et la maturité du service restent deux dimensions séparées.

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
