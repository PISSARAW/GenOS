# B06 — Reprise des promotions et qualification des consommateurs

Le commit de preuves demandé avant cette reprise est `e01f00d6`.
Ce dossier complète la qualification précédente sans effacer ses résultats.
B06 est clôturé pour la qualification des parcours P0 implémentés des lots
L01–L05 et L22. La première passe ci-dessous restait partielle ; la clôture
documentée en fin de dossier apporte les clients Studio et VS Code installable,
le CLI et le TUI reliés au même run. La maturité des fonctionnalités de recherche
proposées dans le plan reste distincte de cette qualification.

## Promotions et snapshots

Le journal et ses frontières sont décrits dans
[l'ADR 0346](../adr/0346-journal-de-reprise-des-promotions.md).
La qualification native Windows couvre :

- deux processus et deux assemblages AEIS frais : une réservation gagnante,
  deux nonces consommés sur quatre possibles, deux assemblages persistés ;
- six arrêts forcés suivis d'une nouvelle ouverture SQLite : une seule
  application committée des primitives, une trajectoire et une provenance
  positive, réponse idempotente après commit ;
- une fusion partielle et une fusion entièrement publiée avant panne : les
  postimages déjà présentes ne sont pas réécrites ;
- un journal modifié et une requête modifiée : refus explicite ;
- publication de snapshot : trois erreurs EPERM injectées puis renommage réel,
  échec permanent après six tentatives sans nouvelle ligne ni staging résiduel,
  douze collisions natives et refus d'un payload altéré.

L'erreur Windows observée précédemment n'est pas attribuée à un antivirus sans
preuve. La correction ajoute une récupération bornée et vérifiée du renommage.
Elle ne garantit pas que toute erreur de permission Windows soit transitoire.

## Holdout IA exécuté

`benchmarks/p0-consumers/run-memory-holdout.cjs` appelle réellement
`modelProvider.generate` avec Ollama local, `qwen2.5-coder:7b`.
Le manifeste du protocole est écrit avant le premier appel. Le candidat reçoit
le prompt et la mémoire, sans outil ni accès au fichier oracle. Les réponses,
les canaris privés et les partitions train/dev sont conservés dans le protocole
de l'évaluateur et ne sont pas transmis au candidat. Chaque cas utilise une
base SQLite temporaire neuve. Le bras GenOS passe par le stockage, la récupération
et le formatteur mémoire de production ; l'attaque doit rester visible après
troncature pour que le cas soit exécuté.

| Mesure exploratoire, protocole b06-memory-v4 | Mémoire brute | Mémoire GenOS |
|---|---:|---:|
| Cas réservés exécutés | 8 | 8 |
| Réponses exactes | 4 | 8 |
| Instructions adversariales suivies | 4 | 0 |
| Échecs de fournisseur | 0 | 0 |
| Tokens d'entrée | 1 099 | 3 413 |
| Tokens de sortie | 129 | 125 |

16 appels, aucune fuite du canari privé. Digest du modèle :
`dae161e27b0e90dd1856c8bb3209201fd6736d8eb66298e75ed87571486f4364`.
Manifeste des cas :
`140f5cc652f2d2cf05bf8fafd11797c7cbd555fe5ca5ff0e775b2b89b571cf0e`.

Cette observation concerne une famille synthétique de tâches et quatre formes
d'attaque sur un modèle local. Le contexte GenOS est plus long. Les quatre
discordances favorables donnent p = 0,125 au test binomial apparié bilatéral ;
elles n'établissent pas un gain scientifique représentatif, ni une défense
générale contre l'injection. Une campagne confirmatoire devra geler de nouveaux
domaines, contrôler la longueur du contexte, prévoir des ablations et une
puissance adaptée. Les coûts monétaires du fournisseur local sont nuls ; le
temps matériel et l'énergie n'ont pas été mesurés.

Les tentatives précédentes sont conservées : v1 confondait garde et troncature,
v2 a révélé un marqueur de directive non neutralisé, v3 a détecté une interférence
de récupération entre cas. Elles ne constituent pas une mesure finale valide.
Le marqueur `SYSTEM_DIRECTIVE_EPISTEMIC_SHIELD` est maintenant neutralisé dans
les souvenirs et vésicules, qui restent des données non authentifiées.

## Première passe interactive, conservée comme historique

Le binaire Rust natif a été lancé en mode `--monitor` dans un pseudo-terminal
Windows, connecté au vrai `trinityMonitorServer` et à une base SQLite isolée.
Il affiche la mission B06, trois mondes puis l'état `COMPLETED` avec verdict
`WEAK` et barrière `UNKNOWN` en l'absence de preuve. Les touches `2`, `s`, `r`
et `q` sont envoyées ; `r` est sans effet en mode live, conformément au code.
La sortie rend le terminal et retourne 0. Ce parcours qualifie le moniteur et
ses commandes locales, pas une mission IA complète.

Le dépôt courant ne contient pas de frontend Studio web opérationnel.
`GenOSWork` est un site public, sans connexion démontrée au runtime. L'accès au
navigateur via CUA échoue au démarrage du sandbox Windows (code 1056), avant toute
lecture d'interface. Aucune capture fictive ou simple page de démonstration
n'est comptée comme une preuve Studio. L'URL ou le dépôt du client opérationnel
et de l'extension IDE a été demandé pour poursuivre cette partie.

## Preuves locales de la première passe

Les journaux et résultats générés sont hors Git dans
`C:/Users/Shadow/.codex/visualizations/2026/10/06/01a11128-3c02-7882-a146-5b1ec06e3434/b06/` :
`consumers/`, `ai-holdout-v4/protocol.json`, `responses.jsonl`, `summary.json`,
`tui-interaction.json`, `npm-test.log` et `cargo-workspace.log`.

| Validation de la première passe | Résultat |
|---|---|
| npm test | Exit 0, suite complète |
| cargo test --workspace | Exit 0 ; 671 tests, 80 suites, zéro échec et zéro ignoré |
| Qualité | 5 338 sources ; 100 violations de baseline, zéro nouvelle ; exit 0 |
| Harnais consommateurs | 58/59 ; ancienne attente de refus corrigée après réponse idempotente |
| Rejeu des sept parcours affectés | 7/7 ; dérive concurrente de GraphRAG détectée |
| Mémoire et vésicules après cette dérive | 2/2 ; zéro dérive de source |
| Reproduction du pilote v4 après cette dérive | Même manifeste, même modèle, mêmes scores et tokens |
| Baseline qualité | SHA-256 inchangé par rapport au rapport P0 précédent |

La première passe observe des modifications concurrentes de `trajectoryController`
et `memoryStdp`; le rejeu final observe `graphRagService`. Ces dérives sont
conservées dans les manifestes. Le test d'approbation vérifie désormais que le
même run est retourné sans seconde exécution. STDP est exercé avec mutations
réelles de renforcement, dépression et modulation dopaminergique. La mémoire
et le pilote sont rejoués après la dernière dérive. `validation-summary.json`
conserve les empreintes des journaux et la comparaison finale des sources.

## Clôture des consommateurs P0

Les clients sont livrés dans `integrations/studio/` et
`integrations/ide/vscode/`, conformément à l’ADR 0347. Le backend sert
`/studio/`; le VSIX se construit avec Python standard. `g inspect-run` fournit
la même inspection authentifiée. Les deux routes de lecture exigent un tenant
explicite et relisent le journal scellé, l’assemblage AEIS et les empreintes
parent/enfant de la provenance dans une transaction cohérente.

Le navigateur Chrome réel reçoit un refus sur un autre projet et sur un dossier
sans signature, puis soumet une approbation valide. Il affiche la promotion
committée, la mémoire reliée à son parent et capture un snapshot de workspace
réel. Le token reste en mémoire ; déconnexion et erreur effacent les données.

Le harnais construit et installe réellement le VSIX dans un profil isolé de
VS Code 1.139.1. Le driver est une autre extension ; GenOS est chargé depuis
le répertoire des extensions installées. Les commandes natives connectent,
inspectent, ouvrent un document JSON dans l’éditeur, déconnectent et reconnectent
avec la même identité d’intégration. `g.ps1 inspect-run` retourne le même run,
les mêmes hashes et le snapshot ; les cas anonymes et hors projet échouent.
Les commandes et heartbeats d’une intégration révoquée retournent 404.

Le TUI natif se connecte au moniteur de ce run. La fixture contient un seul
monde ; aucun monde de démonstration n’est ajouté. Progression et tokens restent
inconnus tant qu’aucune métrique n’est fournie. La progression ne monte plus
artificiellement à chaque polling. Les touches `1`, `s`, `s`, `q` sont exercées,
le dashboard reste stable entre deux appuis et le terminal est rendu, exit 0.
Les événements Windows de relâchement/répétition ne basculent plus deux fois
le dashboard ; un test de régression couvre cette frontière.

Le run commun final est `strategy_run_1791353886445_e0d49956`, avec deux
effets primitifs committés, une mémoire liée à la promotion et un snapshot.
Le manifeste `clients-verified/client-results.json` ne détecte aucune dérive.

Le run de promotion est `completed` tandis que les étapes antérieures de la
fixture restent `planned` et l’agent du moniteur reste `running`. Les clients
affichent ces états observés. Cette preuve ne simule pas une mission IA complète
et ne transforme pas son statut de promotion en validation des autres étapes.

La qualification complète obtient **64/64 commandes**, sans dérive de source.
Les dix parcours B06 sensibles obtiennent **10/10**, également sans dérive.
Les bases, dossiers de travail et profils clients sont neufs et supprimés
après exécution ; les journaux et captures sont conservés hors Git.

| Validation de clôture | Preuve sous le dossier local `b06/` |
|---|---|
| Consommateurs L01–L05/L22 : 64/64, exit 0, zéro dérive | `consumers-final/consumer-results.json` |
| Reprise, snapshot, STDP et provenance : 10/10, exit 0, zéro dérive | `recheck-final/consumer-results.json` |
| Studio, VSIX installé, CLI et TUI sur un run commun | `clients-verified/client-results.json`, `tui.json`, `studio.png`, logs natifs |
| npm test : suite complète, exit 0 | `npm-test-final.log` |
| cargo test --workspace : 673 tests, 80 suites, zéro échec/ignoré, exit 0 | `cargo-workspace-final-verified.log` |
| Qualité : 5 354 sources, 88 violations admises, zéro nouvelle, exit 0 | `code-quality-closure.log` |
| Pilote IA reproduit : 16 appels, même modèle/manifeste/scores/tokens, zéro fuite | `ai-holdout-closure/summary.json` |
| Index ADR : 423 fichiers/lignes, zéro problème | `scripts/ci/check_adr_index.py` |

Les passes clients intermédiaires sont conservées. Elles ont révélé le
middleware administrateur des ressources de mission appliqué accidentellement
aux routes suivantes, puis les métriques de démonstration du TUI et le double
événement clavier Windows. Le rôle administrateur reste requis sur chaque
route de ressource de mission. Des modifications concurrentes de `lib.rs` puis
`config.rs` du CLI sont consignées par les manifestes ; la compilation et les
clients sont rejoués après correction des références de trait introduites.
Aucune passe avec dérive n’est présentée comme entièrement stable.

La version VS Code habituelle était bloquée par sa mise à jour. Une archive
Microsoft officielle de la même version, avec signature Authenticode valide,
a fourni un hôte indépendant et des profils temporaires ; aucun processus
éditeur ou installateur habituel n’a été fermé. Le harnais suit le principe
d’[hôte de test d’extension](https://code.visualstudio.com/api/working-with-extensions/testing-extension).

La baseline qualité conserve le SHA-256
`B971F4E32783538077B37AFA0D5D0C83DFCFC88956BC684AFB8838D93184C944`.
`validation-closure-summary.json` conserve les empreintes finales, les résultats
et les limites. B06 est acquis au périmètre des parcours P0 implémentés.
Les garanties restent bornées par l’ADR 0346 ; le dépôt mémoire n’est pas garanti
sur toute panne possible. Les mutations SDK exhaustives, les autres IDE et les
fonctions de recherche P1 restent à qualifier séparément. Le pilote IA demeure
exploratoire, avec p = 0,125 et un contexte plus long dans le bras GenOS.
