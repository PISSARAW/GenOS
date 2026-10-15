# ADR 0486 — Frontière de confiance du transfert HGT

- **Statut** : Proposition en qualification; la frontière de confiance et l'unicité interprocessus restent à démontrer.
- **Date** : 2026-10-14
- **Domaine** : Transfert horizontal de plasmides, autorité et reçus.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0028, autorisation et secrets externes ; ADR 0044, matrice d'autorité et gates de provenance.

## Contexte

L'implémentation initiale utilisait un lease HMAC dont le demandeur pouvait
construire l'autorité et fournir le secret au contexte de transfert. Le HMAC
prouvait la cohérence sous cette clé, pas l'indépendance de l'émetteur. Le store
ne liait pas l'autorité à une configuration détenue par l'application.

Des chemins parallèles (`PlasmidBank::transfer`, conjugaison et transformation
biologiques directes, CLI, diagnostic) pouvaient appliquer un plasmide sans lease.
Une garde limitée à `GenosEcosystem::hgt_transfer_under_lease` ne protégeait donc
pas tous les transferts.

## Contrat proposé

Établir une frontière explicite entre l'émetteur de l'autorisation et le runtime :

1. L'émetteur externe détient la clé privée Ed25519; elle n'est jamais chargée
   dans le runtime ni fournie par le demandeur du transfert.
2. Le bootstrap de l'application hôte est la racine de confiance : il charge une
   fois les clés publiques épinglées par `issuer_id` et le chemin du journal.
   `configure_hgt_trust` est une API de bootstrap, pas une API de demande de
   transfert; elle ne doit pas être exposée à un worker ou à un client distant.
   Si le même appelant non fiable peut choisir ces clés, la preuve Ed25519 ne
   démontre aucune indépendance d'émetteur. Révoquer un émetteur retire sa clé
   du runtime; ajouter une clé exige de recréer le runtime avec la configuration.
3. Le message signé est le JSON UTF-8 compact produit par `HgtLeaseRequest::signing_bytes`,
   avec les champs dans cet ordre : `schema` (`genos.hgt-lease/v1`), `issuer_id`,
   `mission_id`, `lease_id`, `nonce`, `donor_id`, `recipient_id`, `plasmid_id`,
   `plasmid_digest`, `expires_at_unix_ms`. `mission_id` est l'unique scope v1;
   le digest SHA-256 porte sur la sérialisation JSON du plasmide. La signature est
   transportée en hexadécimal. Le runtime vérifie clé, signature, mission,
   identités, digest et expiration avant mutation.
4. Le reçu durable contient les claims, la preuve signée et le résultat; il est
   appendé avant l'installation du plasmide. La signature porte sur le lease,
   pas sur le reçu. Le rejeu revalide donc les claims, le digest, les identités,
   les champs du rapport et le plasmide. La clé d'idempotence combine mission,
   émetteur et nonce; le lease ID n'en fait pas partie, afin qu'un nonce ne
   puisse pas être réutilisé sous un nouveau lease.
5. Une mutex sérialise les appels dans un runtime. Un verrou de fichier géré par
   le noyau (`flock` sur Unix, `LockFileEx` sur Windows) protège la séquence
   lecture/idempotence/append entre runtimes partageant le même journal. Le
   fichier sidecar persiste, mais le noyau libère le verrou quand le processus
   ferme son handle, y compris après une terminaison brutale; l'ouverture
   suivante peut réutiliser ce fichier. Le transfert refuse si la configuration
   manque ou si la preuve est invalide. `PlasmidBank::transfer`, le diagnostic
   et la commande CLI refusent la conjugaison directe; API/MCP ne sont pas
   intégrées.

## Conséquences envisagées

### Positives

- Un demandeur de transfert ne peut pas fabriquer l'autorisation si la
  configuration de confiance reste exclusivement au bootstrap hôte.
- L'autorité et l'effet sont liés à une mission, un plasmide précis et un reçu.
- Les chemins de diagnostic et les futurs transports ne contournent pas la
  politique via une primitive directe.
- Configuration absente, altération, expiration, scope incorrect ou conflit de
  rejeu refusent sans mutation.

### Négatives et limites

- Il faut exploiter un émetteur, distribuer les clés de vérification et définir
  leur rotation et leur révocation.
- Les appelants internes utilisant `PlasmidBank` devront obtenir une preuve;
  diagnostics peut refuser une réparation si aucun octroi autorisé n'existe.
- La garantie de verrouillage repose sur les verrous de fichiers locaux de l'OS;
  le comportement des systèmes de fichiers réseau n'est pas qualifié. Le journal
  reste single-writer et la reprise d'un append durable suivi d'un crash avant
  mutation dépend du rejeu du reçu.
- Cette décision ne rend pas le transfert biologiquement réel et ne valide pas
  la sûreté sémantique du payload du plasmide.

## Alternatives

- **Garder le HMAC et l'autorité fournis à chaque appel** — rejeté : le demandeur
  crée sa propre clé et prouve seulement la cohérence de son propre octroi.
- **Mettre le secret HMAC dans la configuration du même processus** — insuffisant
  seul : cela permet au runtime de signer et vérifier, sans prouver que l'octroi
  vient d'une autorité indépendante de l'appelant.
- **Garder le transfert direct pour les appels internes** — rejeté : la frontière
  dépendrait d'une identité d'appelant non vérifiée et laisserait un contournement.

## Choix encore ouverts

- Identifier le service émetteur (backend GenOS ou service externe) et comment il
  authentifie l'autorisation d'un lease.
- Exploiter l'émetteur et définir comment il authentifie les demandes de lease;
  le runtime v1 fournit le contrat de vérification, pas le service d'émission.
- Définir tenant/multi-tenant au-delà du scope mission v1 et la révocation
  immédiate avant expiration (la rotation v1 retire une clé au redémarrage).
- Remplacer ou étendre le store pour garantir unicité/consommation atomique entre
  processus et définir la reprise si l'append durable précède un crash avant
  mutation.
- Définir comment diagnostics demande un octroi de réparation.

## Critères d'acceptation de l'implémentation

- Aucun demandeur de transfert ne fournit de secret de signature ni ne construit
  l'autorité de production avec une clé choisie par lui.
- Refus d'une clé inconnue, d'une preuve altérée ou expirée, d'un autre scope,
  d'un autre plasmide, d'un rejeu divergent ou d'une configuration absente.
- Tests couvrant transfert valide, refus sans mutation, rejeu exact après
  redémarrage, conflit, panne d'écriture et concurrence interprocessus.
- `hgt_transfer_under_lease`, `PlasmidBank`, diagnostics et toute route API/MCP
  découverte passent par la même vérification; aucune primitive directe n'est
  accessible hors de la garde.
- Les clés privées n'apparaissent pas dans les requêtes, reçus, journaux,
  fichiers versionnés ou artefacts durables de test.
- La maturité n'est réévaluée qu'après preuve de ces critères et qualification
  des tests de bout en bout.

## Vérification actuelle

Le runtime configure les clés dans `GenosEcosystem`, vérifie les preuves Ed25519
externes et persiste un reçu avant mutation. `ProcessFileLock` fournit le verrou
de handle commun aux journaux HGT et biologiques; le noyau le libère à la fin du
processus, même après terminaison forcée. Sur Windows, `cargo test -p
genos-orchestrator process_file_lock::tests::process_exit_releases_the_kernel_lock`
et `cargo test -p genos-orchestrator --test hgt_authority` passent; ce dernier
exécute 5 tests, dont contention/rejeu entre processus. Les API directes de conjugaison,
transformation, diagnostic et CLI échouent fermés. La configuration des clés
est une API publique de la crate et son confinement au bootstrap hôte n'est pas
imposé par le type; le reçu n'a pas de signature propre; les systèmes de
fichiers réseau et l'intégration API/MCP ne sont pas qualifiés. La sérialisation
du verrou n'établit pas une garantie d'écriture transactionnelle du journal.
Ne pas déclarer HGT validé avant satisfaction de tous les critères d'acceptation.
