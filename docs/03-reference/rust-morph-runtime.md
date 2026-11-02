# MORPH dans le pipeline Rust natif

- Statut : transformation locale bornée, implémentée dans `mission_protocols`.
- Portée : installation et rebind du roster `integer_sum`.
- Dernière revue : 2026-11-02.

## Organisation réellement consommée

Le roster persistant contient exactement trois rôles : `producer`,
`verifier_a`, `verifier_b`. Chaque identité est liée à l'exécution sous la forme
`run_id:role`. Le moteur lit le roster committé et utilise ces identités et rôles
pour lancer les processus natifs. Une liste écrite uniquement dans un événement
ne constituerait pas une installation de topologie.

`Roster::validate` refuse un rôle manquant, un doublon, une identité étrangère ou
une version nulle. `Store::roster` refuse un roster encore lié à une ancienne
incarnation. `Store::ensure_roster` installe la première version ou construit un
rebind explicite après une succession CONTINUITY.

## Préparation et décision

`prepare_roster(binding, plan)` conserve le plan, le snapshot source et leurs
digests, sans installer le roster cible. Le plan fixe l'identifiant de
transition, la version source attendue et la version cible exactement suivante.
Un identifiant réutilisé avec un autre plan est un conflit.

`commit_roster` relit le plan préparé et le snapshot source sous transaction
SQLite `IMMEDIATE`. Il contrôle le binding et réalise un CAS sur la version.
Le roster cible, la décision irrévocable, le reçu et l'événement `COMMIT` sont
inscrits dans cette même transaction. Deux transitions préparées sur la même
version ne peuvent pas gagner toutes les deux. Les missions distinctes ne
partagent pas leur compteur de version.

Un rejeu du commit restitue le reçu historique exact. Une panne après le commit
ne transforme pas la décision en annulation. Le moteur peut relire l'organisation
installée ; les effets déjà distribués restent soumis aux règles d'idempotence
et d'issue inconnue d'OMEGA.

## Frontière du profil

Le participant de cette décision est le registre/installateur local. Le profil
ne fabrique aucun `READY` provenant des processus futurs et ne prétend pas
mettre en œuvre un consensus distribué. La réussite des trois processus est
établie séparément à partir de leurs résultats et des gates EVIDENCE.

La transformation autorisée conserve les trois responsabilités et leur
séparation. Elle ne permet pas de fournir un exécutable, une commande, des droits
supplémentaires ou une composition libre par payload. Elle ne modifie pas les
tissus biologiques historiques, les génomes ni un prétendu head AgentGit.

## Vérification

`cargo test -p genos-orchestrator --test mission_protocol_morph` couvre la
préparation sans effet, le reçu durable, le CAS concurrent, les identités
étrangères, les snapshots corrompus et le rebind après succession.
Le lancement réel des processus relève également des tests du moteur/CLI ;
un test du registre seul ne constitue pas cette preuve.
