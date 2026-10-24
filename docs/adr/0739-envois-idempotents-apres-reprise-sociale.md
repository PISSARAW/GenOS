# ADR 0739 — Dédupliquer durablement les envois sociaux après reprise

- **Date** : 2026-10-24
- **Statut** : Accepté
- **Domaine** : Communication, persistance, reprise sociale
- **Décideurs** : GenOS maintainers
- **Lié à** : [ADR 0738 — Boucle de développement social intégrée à l’Ontogenèse](0738-boucle-developpement-social-integree.md)

## Contexte

La boucle sociale peut livrer un signal, puis échouer avant d’enregistrer son épisode ou de terminer l’observation. La reprise libère le bail et relance la décision. Un identifiant de cycle ne suffit pas : le transport créait un nouvel identifiant de signal à chaque tentative. Les lignes de `signal_blobs` expirent aussi avec leur TTL.

## Décision

Chaque observation sociale produit une clé déterministe à partir de son organisation, projet, agent et identifiant d’observation. Le transport en dérive un identifiant de signal stable et calcule une empreinte de la demande, du destinataire et de son périmètre. Dans une transaction SQLite unique, il persiste le signal, les livraisons en attente et un registre d’idempotence permanent contenant le hash de la clé, l’identifiant du signal, l’émetteur et l’empreinte.

Une reprise avec la même clé et la même empreinte retourne la publication existante sans réémettre le signal. L’empreinte conserve le contenu, les raisons, le résumé, le canal, les références, le destinataire et le périmètre; elle ignore uniquement la métrique `utility`, recalculée par le moteur de checkpoint et sans effet sur le signal déjà publié. Une réutilisation de la clé avec un autre contenu ou destinataire échoue fermée. La reprise ne signifie pas que le destinataire a accusé réception : le résultat de livraison reste fondé sur les accusés durables de `signal_deliveries`.

## Conséquences

- Positives : le replay après expiration du signal et redémarrage ne publie pas un second message.
- Négatives : le registre croît avec les envois idempotents; une éventuelle purge devra dépasser la durée maximale de reprise.
- Les replays restent dédupliqués après expiration du signal et redémarrage du processus.
- Le registre garde des empreintes compactes sans conserver le contenu du message ni la clé brute.
- Les clients hors de la boucle sociale gardent leur comportement existant lorsqu’ils n’envoient pas de clé d’idempotence.

## Alternatives

- Dédupliquer uniquement par `cycleId` : écarté, car il ne fixe pas l’identifiant de signal et le cycle peut être régénéré.
- S’appuyer sur `signal_blobs` : écarté, car les signaux expirés sont purgés.

## Validation

Le test d’intégration simule un échec de complétion après publication, expire puis purge le signal, ferme et rouvre SQLite, et vérifie qu’une reprise conserve le même signal et l’accusé durable sans seconde publication. Il vérifie aussi qu’une clé réutilisée avec une empreinte différente est rejetée.
