# Capsules transportables chiffrées

Le service backend/src/services/capsuleTransportService.js fournit un pilote
de transfert d'état. Il n'est pas appelé par la restauration persistante des
spores et ne remplace pas son format AES-GCM.

## Contrat

sealCapsule reçoit un objet avec state, context et key. La clé doit être un
Uint8Array de 32 octets généré ou distribué par un système de confiance.
Le contexte contient domainId, vaultId, artifactId, artifactVersion et
schemaVersion. La sortie contient le format, un en-tête et des blocs encodés
en base64. Ni la clé ni l'état en clair ne figurent dans la capsule.

openCapsule reçoit capsule, context, key, authorize et minimumVersion.
authorize doit approuver explicitement l'opération capsule:restore ; la version
du contexte doit atteindre le plancher fourni. Le service vérifie chaque bloc
et le marqueur de fin avant de décoder MessagePack. Un échec ne produit aucun
état restaurable. L'appelant reste responsable de l'écriture atomique et de la
conservation de la dernière capsule valide.

Le format accepte au plus 8 Mio de contenu et 128 blocs de 64 Kio. Les
catégories d'état, les clés et le plancher de version doivent être contrôlés
par le stockage qui fait autorité.

Test ciblé :

    node backend/tests/test_capsule_transport.js

Voir [ADR 0324](../adr/0324-capsules-secretstream-transport.md).