# Registre philosophique — référence et gouvernance

- **Statut** : Partiel
- **Portée** : concepts, relations et mappings philosophiques déclaratifs
- **Dernière revue** : 2026-09-17

## Rôle

Le registre philosophique fournit un vocabulaire canonique interrogeable par le
routeur philosophique et MCP. Il décrit des concepts, leurs relations, leur
provenance et leur niveau de maturité. Il ne constitue pas une base de vérité
philosophique et ne confère aucune autorité d'exécution.

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
