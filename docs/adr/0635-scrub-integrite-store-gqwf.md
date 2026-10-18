# ADR 0635 — Scrubber explicitement le store GQWF

- **Statut** : Accepté, détection sans réparation
- **Date** : 2026-10-18
- **Domaine** : GQWF, stockage, intégrité, récupération, preuves
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0614, ADR 0633, ADR 0634

## Contexte

GQWF vérifie déjà un blob lorsqu'il le lit, écrit une racine, promeut une
candidate ou collecte des objets. Cette défense locale ne fournit toutefois
pas l'équivalent opérationnel d'un scrub de système de fichiers : un opérateur
ne peut pas vérifier tout le store à froid, obtenir un inventaire stable des
défauts et conserver le résultat comme reçu durable.

La récupération des avantages de Btrfs/ZFS doit commencer par la détection.
Réparer avant de disposer d'une source redondante authentifiée confondrait
disponibilité et intégrité, en contradiction avec les portes de preuve GenOS.

## Décision

Introduire le protocole `gqwf-scrub-v1`, exposé par `scrubIntegrity`.

Un scrub est non destructif et couvre, dans une transaction :

1. tous les manifestes de racines du workspace, y compris les racines
   actuellement orphelines ;
2. toutes les références d'overlay non supprimées ;
3. toutes les entrées physiques du store de blobs, y compris les blobs non
   référencés et les chemins anormaux ;
4. le hash et la taille de chaque blob référencé.

Le rapport est déterministe pour un même inventaire. Il porte `healthy` ou
`corrupt`, une liste d'anomalies structurées et un `inventoryHash`. Un reçu
complet est persisté dans `gqwf_integrity_runs`. Le scrub ne modifie, ne
supprime et ne remplace aucun blob défectueux.

Le scanner physique devient une frontière commune au scrub et à la collecte,
afin d'éviter deux interprétations concurrentes d'un blob valide.

## Plan de récupération

Cette tranche ouvre un ordre de mise en œuvre, sans déclarer les étapes
suivantes déjà disponibles :

1. **Détecter** — scrub exhaustif et reçus durables, objet de cet ADR.
2. **Répliquer** — transporter les blobs et manifestes par hash avec reprise,
   contrôle de tenant et reçu de destination.
3. **Réparer** — restaurer uniquement depuis une réplique authentifiée dont le
   contenu correspond au hash attendu ; jamais depuis une copie arbitraire.
4. **Fermer l'environnement** — décrire les dépendances et paramètres de build
   dans une closure distincte, inspirée des dérivations Nix.
5. **Raccorder Git** — importer ou publier explicitement une projection Git
   sans faire du worktree l'autorité du workspace GQWF.
6. **Qualifier** — comparer chaque capacité à son rival sur des scénarios
   appariés avant toute activation automatique.

## Conséquences

### Positives

- Une corruption silencieuse peut être découverte avant une promotion ou une
  collecte.
- Les reçus donnent une base falsifiable aux futures opérations de réparation.
- Les blobs orphelins restent vérifiés sans être automatiquement supprimés.
- Le GC et le scrub partagent la même définition physique de l'intégrité.

### Négatives

- Le scrub lit tout le store et peut être coûteux en E/S.
- La transaction protège la cohérence des métadonnées mais peut retarder des
  écritures concurrentes pendant le parcours.
- Aucun bit n'est réparé dans cette tranche ; un statut `corrupt` exige encore
  une intervention ou une future source redondante.

## Alternatives

### Réparer immédiatement depuis le workspace matérialisé

Rejeté : le workspace peut être mutable et ne constitue pas une source de
vérité authentifiée.

### Se reposer uniquement sur les lectures et le GC

Rejeté : les défauts restent latents tant que l'objet n'est pas consommé ou
collecté, et aucun reçu exhaustif n'est conservé.

### Exiger Btrfs ou ZFS

Rejeté comme prérequis universel : GQWF doit rester portable. Ces systèmes de
fichiers pourront fournir des garanties supplémentaires à un backend qualifié.

## Validation

`node backend/tests/test_gqwf_garbage_collection.js` couvre un store sain, une
corruption, un blob manquant, la persistance des reçus et l'absence de
réparation implicite.
