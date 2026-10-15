# ADR 0545 — Racine de confiance hôte pour le quorum électrocytaire

- **Statut** : Accepté pour le CLI expérimental local.
- **Date** : 2026-10-15
- **Domaine** : Quorum électrocytaire, provisionnement local des clés de votants.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0191, quorum électrocytaire lié à la mission; ADR 0487, votes électrocytaires signés et rejouables.

## Contexte

Le CLI `electric-quorum` vérifiait correctement les signatures Ed25519, mais
laissait son appelant choisir le registre des clés avec `--trusted-keys`. Cette
configuration prouvait que les votes correspondaient aux clés du fichier choisi,
pas que l'hôte avait approuvé ces clés. L'appelant pouvait donc créer lui-même
sa racine de confiance.

## Décision

1. Le CLI ne reçoit plus de chemin de registre dans ses arguments. Il lit le
   registre versionné `config/electric-voter-trust.json` sous le workspace
   configuré par l'hôte (`GENOS_STUDIO_ROOT`, ou le répertoire courant).
2. Le dossier `config` doit être un répertoire réel, non un lien symbolique, et
   sa résolution doit rester sous la racine du workspace. Le registre doit être
   un fichier régulier, non un lien symbolique, limité à 1 Mio, avec le schéma
   `genos.electric-voter-trust/v1`. Toute erreur ou autorité vide fait échouer
   la commande sans accepter de reçu.
3. Le résultat indique `host_bootstrap_workspace_config` comme origine des clés.
   Il précise aussi `not_authenticated_for_direct_cli` pour la liaison de racine.
   `--experimental` reste obligatoire et l'identité de l'appelant CLI demeure
   explicitement non authentifiée.

## Conséquences

### Positives

- Un chemin arbitraire fourni par l'appelant ne peut plus remplacer la confiance
  provisionnée par l'hôte.
- Le chargement échoue de façon fermée si le bootstrap manque, est mal formé,
  pointe vers un lien symbolique ou sort du workspace.
- Le contrat de signature et le registre Rust des votants restent inchangés.

### Négatives et limites

- Le déploiement doit provisionner et protéger le workspace et son fichier de
  configuration. Cette vérification de chemins ne contrôle pas les ACL du
  système d'exploitation ni l'identité de l'utilisateur qui écrit ce fichier.
- Un processus qui peut choisir `GENOS_STUDIO_ROOT` ou modifier le workspace
  peut encore choisir sa propre configuration; l'intégration serveur doit fixer
  cette racine dans un contexte d'hôte de confiance.
- Il n'y a toujours ni principal CLI authentifié, ni backend, ni quorum distribué,
  ni mesure électrique physique.

## Alternatives

- **Garder `--trusted-keys`** — rejeté : l'appelant choisit alors la racine de
  confiance qu'il prétend vérifier.
- **Ajouter une autorité signée par un backend** — différé : aucun contrat de
  transport de votes électrocytaires authentifié n'existe encore.
- **Déclarer le CLI authentifié par son seul registre** — rejeté : une clé de
  vérification configurée n'authentifie pas le principal du transport.

## Vérification

- `crates/genos-cli/src/commands/electric_quorum_tests.rs` : confiance vide,
  rejet fail-closed et preuve qu'un fichier arbitraire adjacent ne remplace pas
  le registre hôte.
- `crates/genos-cli/tests/electric_quorum_process_cli.rs` : rejeu entre processus
  avec le registre hôte et rejet de l'argument `--trusted-keys`.
