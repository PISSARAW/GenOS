# ADR 0324 - Capsules transportables par flux authentifié

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Domaine** : continuité, cryptographie, restauration
- **Décideurs** : équipe GenOS
- **Lié à** : [Scellement des spores](0300-scellement-spores-biome.md)

## Contexte

Les spores persistantes utilisent AES-GCM et lient leur contenu à un contexte.
Le transfert d'un état volumineux entre hôtes demande un format découpé en blocs
dont l'ordre, la fin et l'intégrité sont vérifiables avant toute restauration.

## Décision

Un service distinct emploie libsodium secretstream XChaCha20-Poly1305. Il encode
l'état MessagePack en blocs bornés. Chaque bloc est authentifié avec le contexte
domaine, coffre, artefact, version et schéma ; le dernier porte le marqueur FINAL.
L'ouverture refuse les blocs manquants, altérés, réordonnés, surnuméraires et
les contextes différents. Elle exige une autorisation fraîche et un plancher
de version fourni par le stockage faisant autorité.

Le service retourne un état déchiffré ; il n'écrit aucune restauration. Le
stockage appelant doit effectuer la comparaison du plancher et l'écriture
atomique, en conservant la dernière copie valide en cas d'échec. La clé
symétrique de 32 octets est fournie par l'appelant et n'est jamais sérialisée
dans la capsule. Le format existant des spores n'est pas modifié.

## Conséquences

### Positives

- L'altération, l'omission et le changement d'ordre échouent avant le décodage.
- Le contexte et la version sont liés au contenu authentifié.
- Le format est borné à 8 Mio et 128 blocs.

### Négatives

- Le backend dépend de libsodium-wrappers et de son module libsodium.
- La distribution, rotation et conservation des clés restent à définir par
  l'environnement qui exporte et importe les capsules.
- Le pilote ne constitue pas encore une commande de sauvegarde entre hôtes.

## Alternatives

- Étendre directement le format AES-GCM des spores : son contrat actuel
  représente un état monobloc et sert déjà la persistance locale.
- Chiffrer chaque bloc indépendamment : l'ordre et la fin demanderaient un
  protocole additionnel de chaînage et de validation.