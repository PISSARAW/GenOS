# ADR 0350 — Cycle immuable des claims scientifiques

- **Statut** : Accepté
- **Date** : 2026-10-07
- **Domaine** : Expérimentation, contrats et provenance

## Contexte

L01 du programme P1 exige la conservation des rejets et rétractations.
Le registre `scientificEvidenceLedger` contient déjà expériences, claims,
preuves contradictoires et assessments immuables. Le manifeste GVX de
l'[ADR 0349](0349-manifeste-experimental-gvx-et-provenance-p1.md) conserve
des statuts déclarés au départ, sans implémenter leurs transitions.

Le contrôleur REST des assessments vérifiait le scope de l'expérience de
l'URL, mais ne transmettait pas cet identifiant au registre. Un identifiant
de claim appartenant à une autre expérience pouvait donc être évalué.

## Décision

Étendre le registre scientifique existant avec `scientific_claim_events`,
sans créer un second magasin de claims. Les claims et leurs événements
deviennent immuables par triggers SQLite. La migration est additive et
idempotente ; les anciens claims sans événement se lisent `proposed`.

Les transitions autorisées sont `proposed` → `rejected` ou `retracted`,
puis `rejected` → `retracted`. Une rétractation est terminale. Ces états
décrivent une décision conservée, pas la vérité de l'énoncé. Aucun état
`verified`, `supported` ou une autorisation de promotion ne peut être acquis
par cet endpoint.

Chaque événement conserve l'expérience, le claim, l'acteur, le motif et
les références de preuves. Sa sérialisation utilise `genos-json/v1` et
son schéma est `genos.scientific.claim-event/v1`. Le premier événement
référence l'empreinte du claim ; les suivants référencent l'événement précédent.
La lecture vérifie cette chaîne et les empreintes des preuves référencées.

Le client fournit `eventId` et `expectedHeadHash`, obtenu par inspection.
L'insertion compare le dernier hash dans une seule instruction SQLite et
l'unicité `(claim_id, previous_hash)` empêche deux successeurs. Un client
dont l'état est périmé reçoit `SCIENTIFIC_CLAIM_STATE_CONFLICT`, HTTP 409.
Le rejeu identique d'un événement déjà conservé retrouve le même résultat,
même après une transition ultérieure. Changer son contenu reçoit un conflit.

REST expose `POST /api/experiments/:experimentId/evidence-ledger/claims/:claimId/transitions`
avec les contrôles existants de tenant, permission `experiment:write` et
projet accessible en écriture. Le contrôleur impose l'acteur authentifié et
l'expérience de l'URL. Le registre refuse un claim étranger, HTTP 404.
Les assessments REST transmettent désormais également l'expérience.
Les appels internes historiques sans `experimentId` restent compatibles.

Trinity/Meristem refuse de sceller une nouvelle vague à partir d'un claim
rejeté ou rétracté, même si un ancien assessment porte `verified`. Preuves
et assessments restent lisibles. L'inspection expose deux axes : l'ancien
`status` décrit les preuves et assessments ; `lifecycle` décrit les décisions
successives, avec `promotionEligible: false`.

## Validation et limites

Les sondes utilisent SQLite réel : deux connexions concurrentes, refus de
scope dans les contrôleurs, rejeu, rétraction terminale, maintien des preuves,
lecture dans un nouveau processus, triggers et altérations forcées du journal.
Les consommateurs scientifiques et le manifeste GVX sont testés séparément.

Les empreintes ne sont pas une signature d'autorité externe. Elles détectent
les altérations sans recalcul cohérent de toute la chaîne ; elles ne prouvent
pas l'authenticité d'une référence ni ne résistent à un administrateur capable
de réécrire l'ensemble ou de tronquer une fin de journal après retrait des
triggers. Un claim ancien sans événement n'a pas de scellement historique.

Cette extension ne révoque pas les artefacts ou promotions déjà consommés,
ne synchronise pas automatiquement un manifeste GVX historique et ne relie
pas encore toutes les missions générales. Le contrôle Meristem observe l'état
au début du scellement ; il ne réserve pas cet état contre une rétractation
concurrente pendant le scellement. La propagation des rétractations,
l'autorité commune et les oracles indépendants restent des travaux P1.
L01 et P1 restent partiels ; aucun gain scientifique n'est revendiqué.
