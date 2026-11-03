# Qualification des sept protocoles dans le runtime Rust

Campagne des 2 et 3 novembre 2026 sous Windows.

## Périmètre

Le parcours qualifié est `genos run --executor rust`, domaine installé
`integer_sum`. Il lit des entiers JSON, lance un producteur et deux vérificateurs
dans trois processus Rust, accepte une preuve liée à la mission puis publie le
résultat dans un CAS SQLite. La [référence](../03-reference/protocoles-missions-rust.md)
donne le contrat et une commande reproductible ; l'[ADR](../adr/2026-11-02-protocoles-runtime-rust.md)
fixe les dix points de livraison.

Le profil exige EVIDENCE, CONTINUITY, MORPH, OMEGA, GQWF Exchange, SYNAPSE et
ALLOSTASIE. Il ne transforme pas les simulations biologiques ni les autres
familles de workers en exécuteurs natifs. Il n'annonce pas l'exécution native
de missions LLM arbitraires. Le stockage et le binaire restent de confiance
opérateur local.

## Scénarios exécutables

| Frontière | Vérification |
| --- | --- |
| Parcours CLI | Trois PID distincts, somme correcte, sept protocoles persistés et objets CAS relus ; `PATH` sans Node |
| Reprise | Deuxième processus CLI : publication identique, trois observations conservées, aucun nouveau worker |
| EVIDENCE | Reçus issus du lanceur réel ; échec de processus, politique modifiée et job surdimensionné refusés ; prédicat admis relu |
| CONTINUITY | Génération courante hors checkpoint, ancienne incarnation refusée après réouverture et redémarrage de processus ; course de succession clôturée par transaction |
| MORPH | Roster committée obligatoire, installation/reprise et identité de worker vérifiées |
| SYNAPSE | Contexte appliqué, adressé puis relu ; contexte, audience et base incohérents refusés |
| OMEGA | Intentions durables, ordre installé, résultat observé et refus de redispatch inconnu |
| ALLOSTASIE | Réserve protégée de 5 %, exposition durable, coût réel d'un processus échoué, règlement après expiration sans nouvelle autorité |
| GQWF | Source réelle transférée entre deux namespaces, fermeture rehashée, corruption refusée et une seule génération gagnante |
| Atomicité de publication | Trigger SQLite `ABORT` après mise à jour de tête : tête, reçu OMEGA, reçu de publication et statut de fin tous annulés ; reprise du commit sans nouveau calcul |
| Admission | Méthodes, paramètres, critères, contrats et options non installés refusés ; absence de mission sans contact réseau ni démarrage TUI |
| Confinement | Traversée et hardlinks source, journal et WAL refusés avant effet externe |

Les tests de publication utilisent les reçus opaques des vrais processus :
ils ne construisent pas un JSON de preuve accepté artificiellement.
L'algorithme du producteur et les deux recomputations diffèrent, mais les trois
processus partagent le même binaire : cela ne constitue pas trois autorités
indépendantes.

Le passage final de `rust_native_mission` déclare 11 cas `ok`, dont 10 exercés
et un retour conditionnel pour symlink Windows indisponible. Les trois tests
de `rust_protocol_publication` passent avec de vrais enfants Rust.

## Commandes de qualification

| Contrôle | Résultat observé |
| --- | --- |
| Qualité globale | 8 654 fichiers source, aucune violation |
| `cargo test --workspace` | Code zéro sur les sources Rust finales |
| Lots de `npm test` | Tous validés ; dernier lot P1 V3 rejoué séparément avec code zéro |

Le lancement global Node a subi une interruption de processus Windows
(`1073807364`) au démarrage du dernier lot `test:p1-v3`, après la réussite du
backend complet, des portes fondatrices/GCI et des huit suites Garage. Le lot
P1 V3 a ensuite été exécuté jusqu'au code zéro. Le lanceur global interrompu
n'est pas présenté comme un `npm test` ayant terminé avec le code zéro.

```powershell
python scripts/ci/check_code_quality.py
npm test
cargo test --workspace
```

Pour rejouer le périmètre natif plus rapidement :

```powershell
cargo test -p genos-cli --test rust_native_mission --test rust_protocol_publication
cargo test -p genos-orchestrator --test mission_protocol_foundation --test mission_protocol_continuity --test mission_protocol_continuity_process --test mission_protocol_morph --test mission_protocol_synapse --test mission_protocol_evidence --test mission_protocol_omega --test mission_protocol_gqwf --test mission_protocol_allostasis
```

Les journaux bruts, bases de test, binaires et checkpoints d'agent sont des
artefacts locaux ignorés ; ils ne sont pas versionnés avec ce document.

La compatibilité inclut la maintenance du reçu fondateur versionné et de
l'empreinte d'implémentation du descripteur GCI `PROMOTION_GATE`. Le reçu est
recalculé par `qualify-foundational-principles.cjs` après les onze tests
d'évidence déclarés ; son contrôle de cycle de vie et les cinq tests ciblés GCI
passent. Ces métadonnées ne changent ni les portes d'autorité ni la portée de
la qualification fondatrice, qui reste bornée et sans autorisation de
promotion. Les tests de fraîcheur ne sont pas assouplis.

## Découpage des commits

Les dépendances imposent de livrer SYNAPSE avant EVIDENCE et OMEGA avant la
publication GQWF. Chaque point a son propre commit, sans fusion des sujets :

| Point de l'ADR | Commit |
| --- | --- |
| 1 — Socle et processus natifs | `034429899` |
| 2 — EVIDENCE | `c5db89946` |
| 3 — CONTINUITY | `78c7226fc` |
| 4 — MORPH | `c2ee72494` |
| 5 — OMEGA | `0f3dea80b` |
| 6 — GQWF Exchange | `99639a8f3` |
| 7 — SYNAPSE | `2f58bf944` |
| 8 — ALLOSTASIE | `964e90e36` |
| 9 — Exécuteur et CLI | `aec45aa1c` |
| 10 — Qualification | Commit introduisant le présent bilan et les régressions de publication |

## Limites de l'environnement

Qualification locale Windows. La création de symlink est refusée par le système
(privilège Windows 1314) : le cas de lien symbolique pendant n'a pas été exercé
sur cette machine, même si le test annonce une réussite après son retour
conditionnel. Les hardlinks ont été créés et les refus correspondants réellement
exercés. Cette qualification n'établit pas un résultat Linux ou macOS.

Une issue inconnue antérieure à la publication bloque la reprise automatique.
Le profil ne fournit ni sélection libre de commande, ni transfert réseau CAS,
ni quorum MORPH distant, ni conversion de budget en tokens ou USD. La reprise
d'une publication exige encore le même binding valide et le même objet source.
