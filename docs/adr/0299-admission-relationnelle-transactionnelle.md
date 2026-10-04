# ADR 0299 — Admission transactionnelle des signaux relationnels

- **Statut** : Proposé, implémentation ciblée
- **Date** : 2026-10-04
- **Domaine** : Communication inter-agents, autorité, persistance
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : [ADR 0298](0298-physiologie-relationnelle-executable.md),
  [Physiologie relationnelle](../02-orchestration/physiologie-relationnelle.md)

## Contexte

Le moteur RPE V1 calcule une décision et un plan réduit, mais son port
`execute` n'était raccordé à aucun transport durable. Le transport général
`publishSignal` diffuse aussi vers des récepteurs et le bus en mémoire ; une
transaction englobante ne pourrait pas annuler ces effets externes.

## Décision

Ajouter un mode relationnel ciblé à `genos_signal_publish` et
`genos_worker_publish` sur le contrôleur HTTP MCP. L'identité vient de
l'authentification existante et le scope du
contexte tenant. Le client fournit uniquement un identifiant d'opération,
un destinataire et des références typées ; `signal_data` doit être vide.

Un grant persistant par acteur, destinataire et scope contient les triplets
`(id, hash, kind)` autorisés, une échéance et un niveau d'accusé. Il est
configuré par l'administration du plan de contrôle, jamais par le message.
Une transaction `BEGIN IMMEDIATE` charge le graphe et le grant, évalue RPE,
écrit le reçu, le signal réduit et la livraison en attente, puis valide le
tout. Le couple scope/opération rend l'admission idempotente ; une réutilisation
avec un autre contenu est refusée. Une révocation du grant avant l'admission
empêche toute insertion.

Le canal exploite la lecture persistante déjà présente dans
`readSignalsForAgent` et son enveloppe ciblée vérifiée. L'admission
`published: true` signifie que le signal est stocké et en attente de
lecture ; elle ne prouve ni lecture, ni ACK, ni action du destinataire.

## Conséquences

### Positives

- Le refus et le silence ne créent aucun signal ; une erreur d'écriture
  annule aussi le reçu.
- Le plan transmis ne contient ni corps libre ni références interdites.
- Le grant et le graphe sont lus sous le même verrou d'écriture que l'admission.
- Les doublons ne créent pas de deuxième livraison.

### Limites

- Seul le mode relationnel du contrôleur HTTP MCP est protégé ici. Les autres
  appels au transport général et le serveur MCP stdio conservent leur chemin.
- Le canal utilise le stockage et la lecture ciblée, sans émission sur le bus
  réactif ni activation de récepteurs.
- L'autorisation MCP générale précède cette transaction ; la frontière
  transactionnelle clôt le grant RPE et le graphe, pas tous les baux du système.
- Le grant est administré par données persistées ; aucune interface de
  provisionnement publique n'est ajoutée dans cette étape.

## Alternatives

- Englobement de `publishSignal` dans une transaction : écarté, car ses effets
  sur le bus et les récepteurs surviennent avant le commit.
- Relation sociale comme permission : écartée ; seul le grant d'autorité
  explicite ouvre ce canal.
