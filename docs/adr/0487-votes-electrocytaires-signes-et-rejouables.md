# ADR 0487 — Votes électrocytaires signés et rejouables

- **Statut** : Décidé pour le contrat Rust v1 et le CLI expérimental; le provisionnement de confiance et les transports serveur restent ouverts.
- **Date** : 2026-10-15
- **Domaine** : Quorum électrocytaire, identité des votants et reçus durables.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0191, quorum électrocytaire lié à la mission; ADR 0486, frontière de confiance HGT.

## Contexte

Le quorum de l'ADR 0191 vérifiait les UUID de cellules actives, les doublons,
la majorité et l'échéance, mais un appelant pouvait déclarer les votes au nom
des cellules. Le reçu durable était idempotent par mission et proposition,
mais le rejeu ne vérifiait pas d'autorité cryptographique.

## Décision

1. Chaque vote porte une signature Ed25519 hexadécimale. Les octets canoniques
   sont le JSON UTF-8 compact ordonné par le type privé de claims avec les
   champs `schema` (`genos.electric-vote/v1`), `mission_id`, `proposal_id`,
   `expires_at_unix_ms`, `participant_cell_id` et `approve`.
2. `ElectricVoterAuthority` vérifie ces signatures contre les clés publiques
   épinglées dans son registre. La requête ne choisit pas la clé du votant; le
   registre doit provenir de la configuration fiable de l'application.
   L'API de configuration de confiance au démarrage et son stockage sécurisé
   ne sont pas fournis dans cette version.
3. Le quorum conserve le contrôle des cellules actives, le seuil multi-cellules,
   la majorité stricte, l'échéance et le rejet des doublons. Les chemins mémoire
   et durable requièrent tous deux l'autorité de vérification.
4. Le chemin durable garde la clé d'idempotence `mission_id:proposal_id`, append
   le reçu avant la mutation de l'organe et refuse une requête divergente pour
   une proposition déjà acceptée. Le rejeu revalide les signatures et les claims
   du reçu avant de restaurer l'état.
5. `genos electric-quorum` accepte un fichier JSON versionné de clés publiques
   fourni explicitement par l'appelant, restaure la population et le tick de la
   mission, puis utilise le verrou noyau partagé et le journal de reçus local.
   Cette voie exige `--experimental` et déclare l'appelant CLI non authentifié;
   fournir un fichier de clés ne constitue pas une racine de confiance hôte.

## Conséquences

### Positives

- Une décision ne peut pas être attribuée à une cellule sans la clé privée
  correspondant à une clé publique présente dans le registre de confiance.
- Une signature ne peut pas être déplacée vers une autre mission, proposition,
  échéance, cellule ou décision.
- Les refus de vote non fiable, altéré, dupliqué ou expiré ne mutent pas l'organe
  et n'ajoutent pas de reçu durable.
- Le reçu accepté peut être vérifié et rejoué après réouverture du journal dans
  un processus distinct.

### Négatives et limites

- Le runtime ne provisionne ni ne renouvelle les clés; l'appelant doit lui
  fournir un registre issu d'une configuration de confiance. Sans cette
  intégration, la vérification cryptographique ne prouve pas l'identité de
  transport du demandeur.
- La collecte des votes est synchrone et fournie au runtime en un lot. Il n'y a
  ni collecte distribuée, ni mesure de délai réseau, ni mécanisme de consensus
  entre processus.
- Le journal est single-writer; l'idempotence locale ne garantit pas une
  consommation unique entre plusieurs processus concurrents.
- Le branchement CLI est local et expérimental; aucun backend n'est fourni et
  aucune tension électrique réelle n'est mesurée.

## Alternatives

- **Conserver des UUID déclarés sans signature** — rejeté : cela ne lie pas le
  votant aux claims de la décision.
- **Faire signer les votes par une clé transmise dans la requête** — rejeté :
  l'appelant pourrait créer l'identité et sa preuve.
- **Persister un reçu sans revérifier les signatures au rejeu** — rejeté : un
  reçu altéré pourrait restaurer un état non autorisé.

## Vérification

- `crates/genos-orchestrator/src/electric_quorum_runtime.rs`
- `crates/genos-orchestrator/src/electric_quorum_runtime_tests.rs` : signatures,
  clé inconnue, altération, doublons, expiration, idempotence divergente et
  mutation seulement après append.
- `crates/genos-orchestrator/tests/electric_quorum_process_restart.rs` : reprise
  et vérification des votes signés dans un processus enfant.
- `crates/genos-cli/src/commands/electric_quorum_tests.rs` et
  `crates/genos-cli/tests/electric_quorum_process_cli.rs` : opt-in, clé absente,
  idempotence divergente et deux processus CLI sur un journal de mission.
