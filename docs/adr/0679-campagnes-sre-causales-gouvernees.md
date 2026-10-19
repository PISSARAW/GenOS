# ADR 0679 — Campagnes SRE causales et gouvernées

- **Statut** : Accepté
- **Date** : 2026-10-19
- **Domaine** : exploitation, SRE, causalité, autorité, récupération
- **Décideurs** : équipe GenOS
- **Lié à** : [guide de guérison SRE](../04-exploitation/guerison-sre-causale.md)

## Contexte

Le contrôle plane disposait de télémétrie, d'incidents, d'un replay causal, de
permissions et d'un circuit breaker. Il ne portait pas encore un objet durable
réunissant responsabilité SRE, diagnostic concurrent, candidat de remédiation,
autorisation, observation longitudinale et demande de rollback.

Une boucle compacte qui enchaîne directement « alerte → action → succès » ferait
du transport une preuve et mélangerait l'apprentissage interne avec l'effet réel
en production.

## Décision

Introduire une campagne SRE scopée et persistante. Une campagne :

1. s'ouvre seulement sur une dérive fraîche et reproduite ;
2. reste attachée à un agent responsable durable ;
3. exige plusieurs hypothèses falsifiables et une preuve causale avec
   intervention, témoin et résultat distincts ;
4. borne coût, rayon d'impact et permissions avant de produire un candidat ;
5. sépare le candidat, son autorisation et un éventuel reçu `APPLIED` externe ;
6. vérifie l'effet sur plusieurs fenêtres indépendantes ;
7. rend l'apprentissage éligible seulement après vérification de l'effet ;
8. bloque l'autorisation ou demande le rollback lorsque le circuit breaker est
   ouvert, sans exécuter lui-même l'action.

Les transitions sont stockées dans un journal append-only chaîné. La tête de la
campagne avance sous verrouillage optimiste, tandis que son identité et son agent
responsable restent immuables.

## Conséquences

### Positives

- reprise d'une investigation après redémarrage avec responsabilité explicite ;
- abstention traçable (`NO_CHANGE`) quand la preuve ou le budget est insuffisant ;
- audit distinct des causes, permissions, actions et effets ;
- arrêt protecteur compatible avec le circuit breaker existant ;
- absence de faux succès produit par un simple accusé de transport.

### Négatives

- deux tables et une migration supplémentaires ;
- l'intégrateur doit fournir l'adaptateur d'action et l'oracle d'évidence ;
- la chaîne de reçus protège contre une mutation SQLite ordinaire, mais n'est pas
  une attestation cryptographique externe.

## Alternatives

- **Enrichir uniquement `global_alerts`** : rejeté, car une alerte mutable ne
  représente ni la causalité ni une chaîne de décisions.
- **Exécuter le candidat dans le service** : rejeté, car cela contournerait les
  frontières de permission et les adaptateurs de production.
- **Apprendre dès l'autorisation ou le transport réussi** : rejeté, car aucune
  amélioration de production n'est alors démontrée.

## Vérification

- `node backend/tests/test_sre_healing_policy.js`
- `node backend/tests/test_sre_healing_store.js`
- gate de commit GenOS sur les fichiers source modifiés
