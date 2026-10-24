# ADR 0745 — Émission serveur d'un reçu humain GCI

- **Statut** : Accepté
- **Date** : 2026-10-24
- **Domaine** : GCI, approbation humaine, signatures
- **Décideurs** : GenOS
- **Lié à** : ADR 0743, ADR 0744

## Contexte

La route d'approbation de stratégie vérifie un reçu humain et une signature
HMAC-SHA256, mais GenOS n'exposait aucune voie de production pour qu'un humain
authentifié obtienne cette preuve. Le helper de signature existant était utilisé
par les tests seulement. Demander le secret HMAC au relecteur ou au consommateur
affaiblirait la frontière de confiance.

## Décision

Ajouter `POST /api/gci/v1/projects/:projectId/approval-proofs`. Cette route exige
`gci:human-approve`, une portée tenant/projet en écriture et une session humaine
interactive; les clés d'accès sont refusées même si elles ont des droits élevés.
La requête doit indiquer `decision: "approve"`, le run et le digest attendu. Le
serveur vérifie que le run en attente appartient au projet, recalcule le digest,
refuse une approbation périmée ou une auto-approbation, puis signe une preuve
valable cinq minutes avec le secret serveur. La décision et son empreinte sont
inscrites dans le journal GCI; la clé HMAC et la signature ne sont pas journalisées.

La route prépare la preuve et ne modifie pas le run. L'appel Linked ultérieur
reste nécessaire pour exécuter le handler `PROMOTION_GATE` et obtenir son reçu
d'invocation.

## Conséquences

### Positives

- Le relecteur ne reçoit jamais le secret de signature.
- L'identité vient d'une session GenOS; elle n'est pas librement fournie par le
  consommateur GCI.
- Le digest courant, le tenant, le projet, le run et la séparation des rôles sont
  vérifiés avant émission.

### Négatives

- Le client doit transmettre la preuve éphémère au consommateur dans les cinq
  minutes.
- Cette route est une API opérateur; elle ne fournit pas encore d'interface Studio.

## Alternatives

- Exposer le secret ou demander une signature HMAC hors bande : rejeté.
- Signer avec l'identifiant fourni par une clé de service : rejeté, car cela ne
  prouve pas une décision humaine authentifiée.
