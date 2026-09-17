# ADR 0017 — Philosophie politique et gouvernance contrôlée

- Statut : Accepté
- Date : 2026-09-17
- Domaine : Philosophie, gouvernance, preuve, sûreté
- Décideurs : Équipe GenOS
- Lié à : [effets runtime philosophiques contrôlés](0016-effets-runtime-philosophiques-controles.md), [épistémologie et évidence](../01-concepts/epistemologie-et-evidence.md)

## Contexte

GenOS étend son registre philosophique aux concepts de pouvoir, d'État, de
légitimité, de démocratie, de liberté, de surveillance et de justice. Ces
concepts peuvent éclairer l'architecture, mais une analogie politique ne doit
pas être présentée comme une capacité sociale réelle du runtime.

Le risque principal est double : confondre une analyse philosophique avec une
autorisation d'exécution, ou attribuer à une sortie de service une légitimité
qu'elle ne possède pas.

## Décision

Le registre sépare quatre niveaux :

1. `planned` ou `registered` : concept documenté, sans adapter exécutable ;
2. `partial` : analyse limitée, explicitement accompagnée de ses limites ;
3. `implemented` : adapter testé, mais toujours analytique ;
4. `mapping` : correspondance documentée vers un mécanisme GenOS, sans octroi de permission.

Les services philosophiques politiques sont purs et retournent des observations,
des tensions, des limites et les preuves nécessaires. Ils ne modifient ni les
leases, ni les contrats, ni les branches, ni les droits MCP.

Toute influence runtime passe par une opération séparée, une allow-list d'effets,
les barrières d'évidence et les contrôles d'autorité existants. Un mapping vers
`toolLeasePolicy`, `agentEvidenceService` ou `circuitBreaker` décrit une relation
architecturale ; il ne remplace pas ces composants.

## Conséquences

### Positives

- Les concepts politiques restent interrogeables et comparables sans être
  transformés en décisions politiques automatiques.
- Les analogies avec GenOS sont traçables et accompagnées de limites.
- La progression des adapters est vérifiable par tests et par statut.
- Les gates de preuve et d'autorité restent les seules sources d'exécution.

### Négatives

- Le registre contient des notions riches qui ne sont pas toutes exécutables.
- Les mappings peuvent être utiles sans constituer une équivalence philosophique.
- Une nouvelle famille ou un nouvel adapter exige la mise à jour du registre,
  du schéma, des tests et de la documentation.

## Règles de changement

Toute nouvelle famille politique ou tout nouvel adapter doit :

1. ajouter un identifiant stable dans le registre ;
2. choisir explicitement un statut de maturité ;
3. déclarer ses auteurs, œuvres, relations et limites lorsque disponibles ;
4. fournir un test positif et un test de refus pour les concepts non exécutables ;
5. documenter tout mapping runtime comme `analogy`, `service`, `data` ou `experiment` ;
6. ne jamais contourner les leases, les barrières d'évidence, le circuit breaker
   ou les contrôles de promotion.

## Alternatives

- Transformer directement les concepts politiques en politiques runtime : rejeté,
  car cela confond philosophie normative et autorité opérationnelle.
- Stocker les mappings uniquement dans la documentation : rejeté, car ils ne
  seraient pas validables ni interrogeables par le registre.
- Autoriser tous les adapters dès leur déclaration : rejeté, car un transport
  ou un adapter ne constitue pas une preuve de validité.
