# GQWF Exchange : reprise et promotion entre deux processus

- **Statut** : Démonstrateur exécutable du profil expérimental Node
- **Date** : 2026-11-02
- **Portée** : Deux processus, deux bases SQLite et deux CAS physiques distincts

## Exécution

Depuis la racine :

```powershell
npm --prefix backend run test:gqwf-exchange
```

Le scénario seul est `node backend/tests/test_gqwf_exchange_process_recovery.js`.
La suite comprend sept fichiers : contrat, qualification, transfert, sécurité du
CAS, promotion, transactions concurrentes et démonstrateur entre processus.
Elle figure également dans `backend/package.json` sous `test:unlocked`.

## Objets et vérification réelle

Le producteur construit des manifests et closures GQWF natifs, avec leurs
sérialisations et empreintes exactes. Chaque processus emploie son propre
répertoire local et son propre fichier SQLite. Le workspace conserve une
identité logique commune ; aucun chemin distant n'est adopté par le récepteur.

Les blobs transférés contiennent deux compteurs, un identifiant de branche et
un programme de vérification. Le récepteur accepte uniquement les octets du
programme local installé et le prédicat configuré : le compteur candidat doit
être strictement supérieur au compteur de base. Il confronte aussi les données
de base offertes au contenu de la tête native actuelle, puis exécute réellement
Node dans un répertoire temporaire séparé. Il vérifie code de sortie et sortie
standard aux étapes `REQUEST_EVIDENCE`, `PREPARE_PROMOTION` et `COMMIT`.

Le programme distant n'est pas exécuté sur la seule foi de sa commande déclarée.
L'identité du runtime Node est liée à la closure. Cette vérification locale ne
constitue pas une attestation complète des entrées externes ou de la sandbox.

## Coupure avant accusé durable

Après le transfert d'un monde de base, le producteur offre la branche A. Le
récepteur négocie les objets manquants. Le test suspend son traitement après
l'écriture physique du premier blob, avant le commit du message et son accusé,
puis arrête le processus.

À la réouverture, une nouvelle négociation retrouve ce blob dans le CAS et ne
demande que les objets encore absents. Le nombre d'objets manquants diminue
exactement d'une unité. La vérification finale relit les octets, le manifest,
la closure et leurs index natifs. Chaque message ayant reçu une réponse est
également rejoué à l'identique pour vérifier son idempotence durable.

## Deux branches et changement de base

Deux candidats A et B sont transférés, vérifiés indépendamment et préparés sur
la même base de génération zéro. La tête reste inchangée pendant ces étapes.
Deux demandes de commit sont envoyées ensemble ; le récepteur les traite
séquentiellement et A publie la génération un. B échoue parce que sa base est
devenue périmée, malgré ses tests antérieurs réussis.

Une nouvelle offre de B qui change seulement son hash de base est également
refusée par le vérificateur : ses données décrivent toujours l'ancienne base.
Le producteur construit alors un monde effectivement rebasé. Tous ses blobs
existent déjà sur le récepteur, mais son nouveau manifest et sa nouvelle closure
doivent être vérifiés. Trois nouvelles vérifications sur la tête A autorisent
la publication de la génération deux par le CAS natif.

Après un nouveau redémarrage, le replay des commits A et B rebasé renvoie leurs
reçus historiques. La tête demeure celle de la génération deux ; le replay
d'un ancien succès ne republie pas une ancienne racine.

## Garanties et limites observées

La promotion utilise `gqwf/roots.publishCandidate`, les têtes et événements
natifs, ainsi que le checkpoint du catalogue. Les tests transactionnels séparés
vérifient le rollback commun tête/reçu, la révocation avant commit, l'absence de
lecture non commitée et d'accusé de transfert annulable par une autre transaction.
La validation du CAS inspecte aussi les shards existants qui ne figurent pas
dans le monde reçu. Une jonction dans un tel shard bloque les écritures du
catalogue natif ; les régressions exigent que le répertoire extérieur reste
inchangé. L'initialisation d'une tête partage le mutex transactionnel pour ne
pas accuser une insertion ensuite annulée par une autre transaction.

L'origine `isolated` reste conservée dans le reçu. Les assurances de closure
restent `content-addressed`, `declared-only` et `not-attested`.
Le reçu porte `externalEffectsAuthorized: false` : publier une tête n'autorise
pas un déploiement ou une action métier.

L'IPC est un transport de test contrôlé par le superviseur. Les callbacks
d'autorisation associent les rôles à des routes et portées explicites. Cette
campagne ne qualifie ni une authentification réseau de production, ni une
implémentation Rust indépendante, ni une isolation contre un propriétaire
système hostile capable de modifier le CAS pendant les accès. Elle ne mesure
pas le débit, la latence ou une concurrence entre plusieurs machines.

Voir le [contrat](../03-reference/protocole-gqwf-exchange.md), la
[qualification](../03-reference/gqwf-exchange-qualification.md), le
[transfert durable](../03-reference/gqwf-exchange-transfert.md) et la
[promotion native](../03-reference/gqwf-exchange-promotion.md).
