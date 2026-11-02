# CONTINUITY dans le runtime Rust natif

- Statut : profil local borné, implémenté dans `genos-orchestrator::mission_protocols`.
- Portée : mission `integer_sum`, registre SQLite local et incarnations successives.
- Dernière revue : 2026-11-02.

## Autorité et point d'effet

`Store::admit` inscrit une première incarnation. Le pointeur
`rust_protocol_current` conserve la génération courante indépendamment des
checkpoints. Une nouvelle admission de la même mission ne remet pas ce compteur
à un. Le binding lie mission, exécution, acteur, workspace canonique, génération,
politique, requête, environnement et échéance.

`Store::transaction` prend une transaction SQLite `IMMEDIATE`, relit le binding
courant avant son opération et le contrôle de nouveau avant le commit.
`continuity::fence` expose ce même contrôle à l'intérieur de la transaction au
point d'effet. Un contrôle effectué uniquement avant l'acquisition du verrou
serait insuffisant. Les écritures SQL missionnées utilisent cette frontière.

## Checkpoint et succession

`Store::checkpoint(binding, value)` enregistre une valeur JSON et sa référence
adressée par contenu. La référence lie le digest du binding et celui du snapshot.
Une réécriture identique ne crée pas un nouveau reçu de scellement. La valeur est
un snapshot fourni par le code local ; son hash ne prouve pas à lui seul une
observation externe ou une réussite métier.

`Store::prepare_successor(prior)` prépare un binding distinct, de génération
exactement suivante, sans activer son autorité. `Store::handoff` exige ce binding
enregistré, le même acteur, workspace, contrat et environnement, ainsi qu'un
checkpoint exact du prédécesseur. Le déplacement du pointeur courant, le reçu de
succession et l'événement sont committés ensemble. La transaction contrôle
l'ancien propriétaire avant le déplacement, puis le nouveau avant son commit.
Un rejeu exact restitue le reçu ; un autre successeur ne peut pas reprendre ce
même transfert.

Lorsque les tables OMEGA et ALLOSTASIE sont installées, la succession est refusée
si l'ancien binding possède encore une intention native non terminée ou une
exposition budgétaire retenue. Une nouvelle identité d'exécution ne peut donc pas
contourner une issue inconnue en créant de nouvelles clés d'opération. Le contrôle
reste autonome lorsque ces tables ne sont pas installées ; il ne remet aucun
compteur de dépense à zéro.

`Store::restore_checkpoint` exige soit le binding courant d'origine, soit le
successeur autorisé pour cette référence exacte. Restaurer une valeur ne modifie
jamais le pointeur d'autorité. Une ancienne incarnation reste refusée, y compris
après fermeture et réouverture du magasin.

## Issue inconnue

`begin_effect` durabilise une intention avant un appel externe. Une intention
sans résultat confirmé produit `EFFECT_OUTCOME_UNKNOWN` au rejeu ; elle n'autorise
pas une nouvelle distribution, même après succession. Un effet terminé restitue
son résultat exact pour une requête identique. `complete_effect` exige toujours
l'incarnation qui possède l'intention.

Ce registre conservateur ne devine pas si un endpoint a exécuté une requête.
Une réconciliation externe doit fournir une preuve fiable ou une déduplication
réelle de cet endpoint. Le registre OMEGA du pipeline traite ses propres étapes
et reçus de processus ; le fencing commun reste obligatoire pour leurs commits.

## Limites et vérification

La possession du registre SQLite et du code local fait partie de la frontière de
confiance. Copier toute la base dans deux autorités indépendantes n'établit pas
un consensus distribué. Copier un checkpoint seul ne transfère aucune autorité.
Le profil ne révoque pas automatiquement un processus distant, ne reconfigure pas
les génomes biologiques et ne rend pas une écriture de fichier arbitraire atomique
avec SQLite.

Tests : `cargo test -p genos-orchestrator --test mission_protocol_continuity`.
Ils couvrent succession/reprise, refus au point d'effet, corruption d'un
checkpoint, résultats connus et intentions inconnues sans relance.
`--test mission_protocol_continuity_process` ajoute des processus Rust distincts
et une écriture SQLite réelle pour vérifier le refus de l'ancien propriétaire.
