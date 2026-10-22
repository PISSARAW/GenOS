# ADR 0727 — Security Authority Kernel (SAK) et séparation observation / instruction

- **Statut** : Accepté
- **Date** : 2026-10-22
- **Domaine** : cybersécurité, contrôle d'autorisation, responsabilité, résistance à la falsification
- **Décideurs** : mainteneurs GenOS
- **Lié à** : ADR 0613, ADR 0721, ADR 0725

## Contexte

L'exécution d'opérations de cybersécurité exige un noyau d'autorité qui ne
puisse jamais être contourné par le modèle de langage ni manipulé par des
contenus hostiles observés dans les journaux d'événements (EVTX, syslog) ou les
rapports d'audit.

## Décision

Le module `backend/src/services/securityAuthorityKernel/` implémente le
**Security Authority Kernel (Chantier 11)** autour de huit garanties :

1. **Identités distinctes et disjointes** (`agent`, `operator`, `actuator`) :
   aucun identifiant ne peut cumuler deux rôles (`SAK_IDENTITY_ROLE_COLLISION`)
   et seul un `operator` peut émettre ou révoquer une permission
   (`SAK_PRINCIPAL_ROLE_MISMATCH`).
2. **Contrôle non contournable par le modèle** : tout drapeau de contournement
   (`bypassAuthorization`, `ignorePolicy`, `forceAllow`, `modelOverride`,
   `selfAuthorized`, `skipKernelCheck`, `escalatePrivilege`) est bloqué
   (`SAK_MODEL_BYPASS_ATTEMPT`) et chaque exécution sur un actionneur requiert
   un permis signé par HMAC du noyau (`SAK_PERMIT_FORGED_OR_INVALID`).
3. **Permissions bornées (cible, opération, durée)** : les jokers (`*`) sont
   interdits (`SAK_TARGET_INVALID`, `SAK_OPERATION_INVALID`), l'opération doit
   appartenir au catalogue autorisé et la validité temporelle
   `[issuedAtMs, expiresAtMs)` est vérifiée à l'autorisation comme à
   l'exécution (`SAK_GRANT_EXPIRED`, `SAK_SCOPE_MISMATCH`).
4. **Révocation immédiate** (`revokeGrant`, `revokePrincipal`) : invalide
   instantanément toute permission ou tout permis déjà émis avant exécution par
   l'actionneur (`SAK_GRANT_REVOKED`, `SAK_PRINCIPAL_REVOKED`).
5. **Politique de refus par défaut** (`defaultPolicy: 'deny'`) : toute requête
   sans permission explicite valide est refusée avec `SAK_DEFAULT_DENY`.
6. **Protection contre les injections d'instructions** : détection et
   neutralisation des motifs d'injection présents dans les journaux et rapports
   (`SAK_LOG_INJECTION_BLOCKED`, `SAK_LOG_INJECTION_NEUTRALIZED`).
7. **Séparation stricte entre données observées et instructions exécutables** :
   toute donnée issue d'un fichier EVTX ou d'un rapport d'audit est scellée dans
   une enveloppe `observed_data` (`executable: false`, `authority: 'none'`) et
   ne peut jamais être interprétée comme une nouvelle instruction
   (`SAK_OBSERVED_DATA_NOT_EXECUTABLE`).
8. **Journaux d'autorisation résistants à la falsification**
   (`tamperEvidentAuthLog.js`) : chaînage SHA-256 et scellement HMAC-SHA256 de
   chaque décision d'autorisation, vérifiables par `verifyAuthLog`.

## Validation

- `node backend/tests/test_security_authority_kernel.js` valide l'ensemble des
  invariants du noyau d'autorité de sécurité.
