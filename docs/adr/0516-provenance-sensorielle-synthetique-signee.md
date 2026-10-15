# ADR 0516 — Provenance signée des stimuli sensoriels synthétiques

- **Statut** : Accepté
- **Date** : 2026-10-15
- **Domaine** : signaux VNO/PAF, reçus sensoriels
- **Lié à** : ADR 0515, maturité biologique — stimuli sensoriels

## Contexte

Le flux de reçus sensoriels pouvait conserver un digest et une mission, sans
prouver quelle source avait fourni le stimulus. Un digest détecte une
modification après ingestion, mais n'authentifie pas le producteur.

## Décision

Le chemin expérimental signé accepte une enveloppe
`genos.signed-synthetic-sensory-input/v1` contenant une identité producteur,
un tick, un signal typé et une signature Ed25519. La clé publique provient
uniquement du document bootstrap hôte `GENOS_SENSORY_TRUST_JSON`, de schéma
`genos.synthetic-sensory-producer-trust/v1`.

Le producteur signe des claims versionnés liant l'UUID de mission, le tick,
l'identité et le SHA-256 de `{schema, producerId, tick, signal}`. Le runtime
refuse une clé absente, une identité non épinglée, un tick nul, une signature
invalide, un stimulus altéré ou une signature réutilisée pour une autre
mission. Le reçu durable conserve la signature, le digest, le tick et
l'empreinte de clé. La lecture de ces reçus par le pont PAF revalide la
signature avec la configuration de confiance courante.

Les entrées non signées sont refusées, même avec l'opt-in expérimental. Les
signaux restent des données synthétiques fournies par un appelant : la
signature authentifie l'émetteur de ces octets, pas un capteur physique ni la
vérité biologique du stimulus. Le fichier est borné à 1 MiB avant décodage.

La frontière reprend ADR 0515 : la clé ne vient pas du flux et les claims
séparent l'identité externe de l'identité runtime. Le schéma sensoriel lie en
plus explicitement le tick du stimulus.

## Conséquences

- Le PAF ne consomme un reçu signé qu'après vérification de signature, mission,
  tick et digest du stimulus.
- Le rejeu après redémarrage revalide le reçu avec les clés bootstrap hôte
  courantes; une rotation/revocation de clé peut donc rendre un ancien reçu
  non consommable.
- L'intégrité et l'identité de source progressent, mais la génération du
  stimulus demeure synthétique et n'établit ni perception physique ni
  autonomie biologique.
