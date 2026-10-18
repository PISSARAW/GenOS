# Plan de maturité des principes fondateurs vers 95/100

- **Statut** : Exécution en cours, phase 10 qualifiée
- **Portée** : fermeture transverse des réserves après les phases 7 à 9
- **Dernière revue** : 2026-10-18

## Point de départ

La qualification des phases 7 à 9 établit un score 4 pour 19 principes dans un
périmètre vertical borné. Elle ne constitue ni une revendication universelle, ni
une autorisation de promotion. Le présent plan vise 95/100 en supprimant les
principales réserves transverses constatées après cette qualification.

Chaque lot doit produire un commit autonome, des commandes reproductibles et un
reçu vérifiable. Un lot incomplet n'ajoute aucun point.

## Allocation des 13 points

| Lot | Gain | Résultat exigé | État initial |
| --- | ---: | --- | --- |
| Phase 10 — CI Node transverse | +3 | `npm test` termine à zéro sans dépendre de `.env` ni d'une autorité implicite | Qualifiée le 2026-10-18 |
| Phase 11 — validation Rust reproductible | +2 | `cargo test --workspace` termine à zéro dans un répertoire de build isolé | À faire |
| Phase 12 — dette du gate qualité | +2 | aucune nouvelle dette et gate global ramené à un état accepté et documenté | À faire |
| Phase 13 — registre de confiance déployable | +3 | bootstrap, rotation, révocation et récupération de clés testés en fail-closed | À faire |
| Phase 14 — journal de révocation durable | +2 | anti-rollback, reprise après crash et réplication vérifiées sur stockage durable | À faire |
| Phase 15 — qualification transverse | +1 | matrice multi-chemins et reçu frais couvrant Node, Rust, MCP et récupération | À faire |

## Phase 10 — CI Node transverse

Travaux :

1. Mettre à niveau les fixtures antérieures à l'autorité v2 avec mission active,
   tenant explicite, enveloppe signée et politique de vérification cohérente.
2. Conserver le refus fail-closed : aucun fallback ne doit transformer une
   absence d'autorité en succès.
3. Exécuter les scénarios fautifs plusieurs fois pour détecter les courses.
4. Exécuter `npm --prefix backend run test:aeis`, puis `npm test`.

Sortie : les suites Node complètes sont vertes et les tests continuent de
rejeter les preuves absentes, les signatures invalides et les quorums incomplets.

Preuves de sortie :

- révision de code qualifiée : `99425028` ;
- commits du lot : `d190ff78`, `7f7f0c85` et `4b002752` ;
- `npm test` : code de sortie 0 avec base, studio et répertoire temporaire
  isolés, `GENOS_DISABLE_DOTENV=1` et sauvegarde de boot désactivée ;
- sous-suites observées : AEIS 42/42, daemon 43/43, workers 35/35,
  garage 8/8 et qualification fondatrice 19/19 au score 4 dans son périmètre
  borné ;
- les preuves manquantes, les portées d'autorité incohérentes, les altérations,
  les quorums incomplets et les domaines d'oracle indisponibles restent refusés.

La campagne initiale sur le disque système a produit des faux négatifs `ENOSPC`.
La campagne probante a donc utilisé un répertoire temporaire dédié sur un autre
volume, supprimé après exécution. Aucun point des phases 11 à 15 n'est acquis par
cette qualification Node.

## Phase 11 — validation Rust reproductible

Travaux : isoler `CARGO_TARGET_DIR`, diagnostiquer les blocages `aws-lc-sys`,
borner les délais de compilation et conserver les artefacts de test. Exécuter
ensuite `cargo test --workspace` depuis un environnement propre et publier les
versions de toolchain et les digests des sorties.

Sortie : un reçu distingue compilation, exécution des tests et éventuel skip
explicite. Un timeout ou un verrou partagé vaut échec, jamais succès.

## Phase 12 — dette du gate qualité

Travaux : inventorier les violations par propriétaire, empêcher toute croissance
de la baseline, puis réduire les fichiers et fonctions hors limites par lots sans
modifier leur comportement. Les changements architecturaux exigent un ADR.

Sortie : `python scripts/ci/check_code_quality.py` passe et la baseline résiduelle,
si elle existe encore, est bornée, attribuée et accompagnée d'une date de retrait.

## Phase 13 — registre de confiance déployable

Travaux : définir un paquet de confiance signé, séparer les clés de signature et
de vérification, tester le bootstrap initial, la rotation chevauchante, la
révocation et la restauration. Une configuration vide ou périmée doit refuser
l'admission.

Sortie : aucun secret n'est commité ; les clés publiques et leur lignée sont
installables, versionnées et vérifiables avec des tests de falsification.

## Phase 14 — journal de révocation durable

Travaux : remplacer la garantie limitée au fichier local par une interface de
stockage durable avec compare-and-swap, ancrage de tête, détection de rollback,
rejeu idempotent et réplication testable. Conserver un backend local pour le
développement, explicitement non qualifié pour la production.

Sortie : les tests prouvent le rejet d'une troncature, d'une tête ancienne, d'une
double écriture et d'une reprise incohérente après crash.

## Phase 15 — qualification transverse

Travaux : étendre le manifeste de qualification aux chemins Node, Rust, MCP,
promotion, récupération et révocation. Ajouter fraîcheur, digests des sources,
toolchains et dépendances, puis exécuter le gate sur une révision propre.

Sortie : un nouveau reçu peut élargir le périmètre qualifié. `universalClaim` et
`authorizesPromotion` restent faux tant que leurs critères spécifiques ne sont
pas démontrés séparément.

## Règle de notation

Le score cible devient 95/100 uniquement après validation des six sorties. Les
preuves historiques ne compensent pas un gate courant rouge, un test interrompu
ou un reçu périmé.
