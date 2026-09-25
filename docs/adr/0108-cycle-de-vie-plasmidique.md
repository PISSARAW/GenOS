# ADR 0108 — Cycle de vie et gates plasmidiques

- **Statut** : Accepté
- **Date** : 2026-09-25
- **Domaine** : génome, capacités, CLI

## Contexte

Le dépôt avait plusieurs états incompatibles (`active`, `available`, `leased`,
`assimilated`) et le résolveur ne consultait pas les gates avant expression.
La commande Rust pouvait annoncer une assimilation malgré un échec d’écriture
et remplacer un génome illisible par un génome neuf.

## Décision

- Employer le cycle `available → leased → assimilated` et des états explicites
  `disabled`, `superseded`, `expired` et `revoked`.
- Dans le résolveur de capacités, n’assimiler qu’un plasmide loué au receveur
  exact, après réussite des gates d’intégrité, compatibilité, autorité,
  immunité et lease.
- Refuser les transitions de statut interdites et retourner des snapshots
  immuables de l’historique.
- Dans le CLI, exiger des identifiants explicites, refuser les chemins qui
  sortent du répertoire chromatin, préserver les états illisibles et ne
  confirmer l’assimilation qu’après validation et écriture réussie.
- Utiliser un RNG injectable pour les cycles de pool et borner le pool par le
  budget énergétique total et une capacité maximale.
- Un signal inter-agent reste une notification d’identifiant; il ne transporte
  pas de code exécutable. Le receveur doit disposer du contenu par un canal
  validé avant de pouvoir l’assimiler.

## Conséquences

- Les manifests incomplets ou les receveurs sans autorité, état immunitaire,
  capacités et lease explicites sont refusés.
- Les erreurs de lecture/validation/écriture du CLI remontent comme erreurs,
  sans faux statut `assimilated`.
- Le registre du résolveur et son historique restent en mémoire de processus;
  ils ne constituent pas un registre durable multi-instance.
- L’import de payload entre agents n’est pas activé tant que la provenance,
  l’empreinte et la validation du contenu ne sont pas disponibles ensemble.
