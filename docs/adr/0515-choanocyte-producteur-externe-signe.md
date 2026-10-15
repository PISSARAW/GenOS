# ADR 0515 — Authentifier la provenance externe des flux Choanocyte

- **Statut** : Accepté
- **Date** : 2026-10-15
- **Domaine** : Choanocyte, autorité d'entrée, reçus biologiques
- **Décideurs** : Runtime GenOS
- **Lié à** : ADR 0324, maturité biologique — Choanocyte

## Contexte

Le flux `MissionChoanocyteStream` venait d'un fichier choisi par l'appelant. Le
runtime attribuait ensuite `producerId` à sa cellule orchestratrice. Ce champ
prouvait l'identité runtime, mais ne disait rien sur l'origine externe des
paquets. Un identifiant ajouté au JSON d'entrée n'est pas une preuve.

## Décision

Le flux d'entrée porte `producerId`, `signatureHex` et les paquets. Avant le
tamisage, le runtime calcule le SHA-256 canonique de `{schema, producerId,
packets}` puis vérifie une signature Ed25519 sur des claims versionnés qui
lient ce digest à `missionId` et `producerId`.

La commande exige l'opt-in `--choanocyte-trust` et reçoit les clés de confiance
par `GENOS_CHOANOCYTE_TRUST_JSON`, document bootstrap hôte `genos.choanocyte-
producer-trust/v1`. L'autorité refuse un document absent, vide, mal formé,
ambigu ou trop grand, une identité non épinglée et toute signature invalide.
Les clés ne sont jamais acceptées depuis le flux lui-même. L'hôte doit injecter
ce document depuis sa configuration bootstrap contrôlée; le runtime ne certifie
pas que la configuration de l'hôte est gérée correctement.

Le reçu sépare `producerId` (source externe vérifiée) de
`runtimeProducerId`/`orchestratorId` (cellule runtime), et conserve l'empreinte
de clé, la signature, le digest d'entrée et la mission. Le rejeu revalide la
signature avec l'autorité courante et vérifie que l'identité du reçu correspond
à l'enveloppe authentifiée.

## Conséquences

### Positives

- Une source inconnue ou un flux altéré ne peut produire un reçu Choanocyte.
- Une signature valide pour une mission ne peut être déplacée vers une autre.
- Les reçus distinguent la source externe vérifiée de l'identité runtime.
- La reprise de processus réutilise le reçu idempotent après revalidation.

### Négatives

- Les producteurs doivent sérialiser les claims canoniques et signer avec une
  clé privée Ed25519; la confiance est indisponible sans bootstrap hôte.
- La vérification lie les octets sérialisés canoniques, mais ne prouve ni la
  vérité sémantique des paquets, ni la présence d'un capteur physique.
- La sécurité de la clé publique dépend de la gestion de
  `GENOS_CHOANOCYTE_TRUST_JSON` par l'hôte; la valeur d'environnement n'est pas
  elle-même une attestation cryptographique du processus hôte.

## Alternatives

- Accepter un `producerId` auto-déclaré : rejeté, car il ne prouve pas l'origine.
- Réutiliser uniquement l'identité de l'orchestrateur : rejeté, car elle décrit
  le consommateur runtime, pas le producteur externe.
- Charger une clé depuis le JSON du flux ou un argument associé au flux : rejeté,
  car l'appelant pourrait choisir sa propre autorité.
