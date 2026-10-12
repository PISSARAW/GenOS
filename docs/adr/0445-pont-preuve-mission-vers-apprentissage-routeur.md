# ADR 0445 — Lier l'apprentissage du routeur à une mission vérifiée

Statut : accepté pour la voie worker native, sous activation explicite.

## Contexte

Le bandit n'acceptait que des assemblages AEIS portant directement un énoncé
`genos.model-route-outcome/v1`. Le runtime conserve déjà une autre chaîne de
preuve : événement terminal du worker, reçu biologique, acceptation de l'oracle
natif et assemblage AEIS signé. Aucun producteur opérationnel ne fabriquait le
premier type d'assemblage. Signer un nouvel énoncé de succès à partir du seul
retour du fournisseur aurait contourné les vérificateurs indépendants.

## Décision

`routeMissionOutcomeBridge` dérive une observation à partir de la preuve
existante, sans émettre de nouvelle signature. Il relit le run terminé, le reçu
et les observations intègres du worker, l'acceptation native historique et un
assemblage AEIS encore actif. Il réévalue l'assemblage avec les vérificateurs
actuellement autorisés. Si un contrat explicite d'issue existe, ses obligations
doivent être toutes vérifiées.

Une seule tentative modèle peut être attribuée au run. Son usage et son coût
doivent être mesurés par le fournisseur, correspondre aux totaux du reçu worker,
être compris dans la durée du run, respecter le tenant, et porter le même
`action_id` qu'une décision active du contrôleur. Une observation de coût
créée pendant le run et scellée dans le reçu doit porter le même ID de
tentative. L'ingestion du bandit refait
ces contrôles dans sa transaction et conserve la référence AEIS pour vérifier
de nouveau les observations lors des évaluations différées.

## Limites

Ce pont n'attribue pas un succès à plusieurs tentatives, aux appels sans usage
mesuré, aux runs sans oracle natif, ni aux échecs sans preuve indépendante.
L'unicité et la concordance comptable établissent une attribution prudente ;
elles ne prouvent pas à elles seules que le texte du modèle a causé le résultat.
Le contrat d'issue explicite resserre la signification du succès quand il est
présent. L'appel `ingest` doit être déclenché après la clôture de la mission ;
le pont n'introduit pas de callback automatique dans cette tranche.

## Vérification

`node backend/tests/test_route_mission_outcome_bridge.js` exécute un worker
natif sur SQLite, relit sa preuve réelle et refuse une tentative et un journal
d'action ajoutés par la fixture après clôture, avec des compteurs nuls. Le
test ne qualifie plus cette association comme observation du routeur. Voir
[ADR 0448](0448-observation-couts-modele-dans-recu-worker.md) pour le raccord
comptable et la limite de la voie native actuelle.
