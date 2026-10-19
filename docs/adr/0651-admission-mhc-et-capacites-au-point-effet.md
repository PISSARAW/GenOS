# ADR 0651 — Admission MHC et capacités au point d’effet

- **Statut** : Accepté pour le MVP local
- **Date** : 2026-10-19
- **Portée** : artefacts d’agents, admission supply-chain, secrets d’exécution
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0028, ADR 0618, ADR 0625

## Contexte

GenOS vérifie déjà les leases d’exécution, les scopes tenants et les preuves de
promotion. Il manquait toutefois un contrat local qui relie les octets d’un
artefact d’agent à sa nomenclature, sa provenance, son environnement et ses
capacités avant de lui permettre un effet externe. Le coffre existant sait
résoudre une valeur ; une lecture administrative peut cependant encore remettre
cette valeur au client. Ce comportement ne convient pas à un agent qui ne doit
jamais recevoir le secret durable.

Une admission positive ne prouve ni la sûreté d’une dépendance, ni la qualité de
l’artefact, ni le succès du déploiement. Elle prouve seulement que les liaisons
déclarées ont été vérifiées par ce contrat.

## Décision

Le MVP introduit trois contrats Node composables sous
`backend/src/services/supplyChain/` :

1. une identité MHC canonique signée par HMAC, liée au digest des octets, au
   digest de SBOM, à la provenance, au scope tenant/environnement, aux capacités
   requises et à une durée de validité ;
2. un broker de capacité opaque, mono-usage, limité à cinq minutes et lié à
   l’agent, au scope, à l’action, à la destination et au digest d’artefact ;
3. un gate d’effet gouverné qui émet d’abord un reçu d’admission, puis seulement
   la capacité, et exige le même reçu avant de confier le secret à un adaptateur
   d’effet enregistré côté hôte.

Le secret est résolu sous forme de `Buffer` uniquement après tous les contrôles,
effacé dans un bloc `finally`, absent des reçus et refusé si l’adaptateur tente de
le recopier dans son résultat. Les reçus lient leurs hashes, portent
`authorizesPromotion: false` et ne remplacent jamais le gate de promotion.

L’échec de signature, de digest, de SBOM, de scope, de capacité, d’expiration,
de destination, de token ou de liaison de reçu ferme l’admission. Une capacité
est consommée avant l’effet asynchrone afin d’interdire les rejeux concurrents.

## Conséquences

### Positives

- Un artefact falsifié ne reçoit aucune capacité d’effet.
- L’agent manipule un token opaque et non le secret durable.
- Les effets sont liés à une destination et à un artefact précis.
- Les reçus d’admission et d’effet sont corrélables sans contenir de secret.

### Négatives et limites

- La clé HMAC est symétrique ; une PKI de builders et la rotation de clés restent
  à construire.
- Les capacités sont en mémoire et ne survivent pas au redémarrage. Cette perte
  est fail-closed, mais il n’existe pas encore de journal de reprise.
- Les adaptateurs d’effet sont du code hôte de confiance. Le MVP détecte une
  copie du secret dans le résultat mais ne prouve pas l’absence de canal caché.
- Le service n’est pas encore exposé par HTTP, gRPC ou MCP.
- Il ne constitue ni un Dependency Firewall, ni un scanner de vulnérabilités,
  ni un moteur de politique de registre, ni un rollback de production.

## Alternatives

- **Étendre directement les routes de release** : rejeté pour ce MVP, car elles
  ne réalisent pas encore un rollback réel de production.
- **Retourner un secret temporaire à l’agent** : rejeté ; même court, un bearer
  lisible peut être journalisé ou exfiltré.
- **Accepter tout artefact signé sans relire ses octets** : rejeté ; la signature
  de métadonnées seule ne prouve pas l’identité du contenu exécuté.

## Vérification

- `node backend/tests/test_artifact_identity_admission.js`
- `node backend/tests/test_point_of_effect_capability.js`
- `node backend/tests/test_governed_supply_chain_effect.js`
- `python scripts/ci/check_code_quality.py`

