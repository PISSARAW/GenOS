# Qualification P1 — consommateurs mémoire REST/gRPC et prompt

- Date : 2026-10-10
- État : qualification logicielle bornée réalisée ; P1 reste ouvert.
- Base initiale : `a544834554261485291d6557988047621e4cb942`.
- Décision : [ADR 0389](../adr/0389-autorite-des-consommateurs-memoire-rest-et-grpc.md).

## Contre-épreuves et portée

Les tests utilisent des clés individuelles générées, stockées sous forme de
hash, des appartenances réelles dans SQLite, deux projets frères, un tenant
étranger et une mémoire globale. Le vrai middleware REST et le router
mémoire sont montés sur un port HTTP éphémère ; gRPC utilise protobuf et son
guard de transport sur un autre port. Cela qualifie la frontière du router,
pas la composition complète du serveur HTTP ni CSRF/CORS.

Une même requête autorisée doit restituer l’identifiant et le contenu de
la mémoire du projet dans les deux interfaces. Clé absente, identifiant
public présenté comme secret, secret de transport absent, scope incomplet
et projet frère sans appartenance doivent être refusés. Les refus ne
doivent déclencher aucune requête d’embedding.

Les écritures doivent persister le scope et le principal réellement résolu,
renvoyer l’identifiant de la ligne, refuser le membre en lecture seule et
le projet archivé. Une collision d’identifiant avec un tenant étranger
doit être refusée sans modifier la mémoire existante.

L’ingestion REST refuse également le viewer et le projet archivé, puis
attribue une écriture autorisée au principal résolu. La contre-épreuve
`ingest-red.log` montre l’écriture viewer avant correction ; la version
corrigée passe dans `ingest-green.log`.

`storage-red.log` reproduit une ouverture DB défaillante masquée en succès.
Le test corrigé vérifie aussi l’indisponibilité réelle de la table mémoire
par renommage temporaire : REST renvoie 500, gRPC une erreur INTERNAL.
`storage-green.log` conserve le résultat corrigé. Les lectures SQL primaires
propagent leurs erreurs ; les index optionnels gardent leur fallback.

Le même client gRPC et les mêmes credentials sont réutilisés après retrait
de l’appartenance puis révocation de la clé. Les lectures suivantes REST
et gRPC doivent être refusées ; cela ne démontre pas l’annulation d’une
requête déjà autorisée et en cours d’exécution.

Le test de prompt provoque une panne du fetch primaire du corpus, puis
exécute la vraie recherche SQL d’échecs et le vrai rendu. L’ancien chemin
injecte `canary-sibling` ; le correctif ne conserve que `canary-own`.
L’embedding est rendu indisponible par un serveur HTTP local pour forcer
un fallback lexical déterministe. Ce test n’est pas une campagne IA.

## Versions et preuves

Les artefacts sont conservés hors Git dans
`C:/Users/Shadow/.codex/visualizations/2026/10/06/01a11128-3c02-7882-a146-5b1ec06e3434/p1-memory-consumers-20261010`.
`baseline-counterproof.cjs` charge les modules ciblés du commit initial
dans des processus de test distincts. `consumers-baseline.log` montre
l’absence de refus individuel ; `prompt-scope-baseline.log` montre
l’injection du projet frère. Les premiers journaux `*-before.log`
échouaient avant le protocole faute de configuration admin de la fixture ;
ils ne servent pas de preuve d’un défaut produit.

La fusion concurrente `7f136899` a temporairement retiré le lot du
checkout, puis son stash commun `12d9032eb04cfd76912ee5eb00975297d805651e`
a été réappliqué. Les fichiers de ce lot ne diffèrent pas entre la base du
stash et la fusion ; le stash partagé reste conservé. Les vérifications
post-fusion doivent être distinguées des résultats initiaux.

Les résultats finaux sont rattachés au lot de sources du commit portant
cet audit et au manifeste indépendant ci-dessous. Aucun lot P1 n’est clos
par le seul protocole.

Après la fusion, `cargo test --workspace`, `npm test`, `npm run test:p1-v3`
et `npm --prefix backend run test:grpc` ont terminé avec un code zéro.
Le contrôle qualité final trouve 5 726 sources et quatre violations déjà
connues, sans dette nouvelle. Le premier contrôle traversait le stash et
des fichiers temporairement absents ; le suivant observait une nouvelle
complexité Rust corrigée par le travail V3 concurrent. Ces passages ne
sont pas fusionnés en une preuve unique. Les vérifications après la
dernière correction d’ingestion sont consignées séparément :

| Commande | Journal | Résultat |
| --- | --- | --- |
| `npm test` | `npm-storage-final.log` | Code 0, dont les nouveaux tests avec défaut de stockage et ingestion |
| `npm --prefix backend run test:grpc` | `grpc-ingest-final.log` | Code 0 |
| `npm --prefix backend run test:quality` | `backend-quality-final.log` | Code 0, 12 tests |
| `python -B scripts/ci/check_code_quality.py` | `quality-ingest-final.log` | Code 0, quatre violations existantes et aucune nouvelle |
| `cargo test --workspace` | `cargo-final.log` | Code 0, target D, debug et incremental désactivés |

Le checkout partagé évoluait pendant les suites globales. Ces passages
prouvent leur exécution sur ce checkout ; ils ne constituent pas un gel
intégral de tous les changements V3 concurrents. La reproduction ci-dessous
fige séparément les sources et dépendances réellement utilisées.

## Reproduction indépendante

L’opérateur `p1-v3-independent-agent`, autorisé par l’utilisateur, n’a pas
consulté les journaux primaires. Sa capsule finale empaquetée conserve
3 343 sources et 22 648 fichiers de dépendances, copiés et empreintés.
Le manifeste `independent/final-packaged-manifest.json` a pour SHA-256
`5ebbfdb6318989fc8ac0c187de801cd24d688c4eb47f0d3a118450cdbb7a3cee`.

Les deux tests canoniques terminent avec un code zéro, les sondes propres
à l’opérateur passent 20/20 pour les consommateurs et 5/5 pour le prompt.
Elles incluent clé expirée, identité forgée, appartenance retirée puis
restaurée, global/tenant étranger exclus et collision d’identifiant entre
deux projets auxquels le principal appartient réellement.

Une capsule antérieure reproduit les deux résultats adverses d’ingestion :
viewer autorisé à écrire, puis attribution fixe `python_script` également
pour l’opérateur. Ces résultats restent conservés avec leur version.
Les premiers gels en conflit ou incomplets (`backend/bin` absent) sont
archivés comme tentatives non qualifiées. L’ajout du bin est conservé dans
des sidecars distincts ; aucun résultat n’est attribué à une capsule modifiée
silencieusement. Cette reproduction ne démontre ni indépendance OS ni gain IA.

## Limites restantes

Le MCP stdio reste un accès opérateur avec scopes déclarés. Les identités
individuelles et les politiques des autres services gRPC restent ouvertes.
Les seeds génériques et les effets historiques de reconsolidation ne sont
pas des preuves de gain cognitif. La couverture complète des consommateurs
L22, l’isolation entre branches et les campagnes IA représentatives
restent à terminer.

Les autres mutations REST (cherry-pick, vesicle, sleep et prune), le serveur
HTTP complet et la révocation en cours d’opération restent hors de cette
qualification. L’attribution testée porte sur les nouvelles écritures ;
elle ne constitue pas un journal complet des auteurs de mises à jour.

La recherche de mémoires d’échecs GenOS a été utilisée. Aucun checkpoint
GenOS de cette exécution n’est attesté : les métadonnées du hook ne sont
pas disponibles. Les décisions et preuves exécutables sont donc conservées
dans cet ADR, cet audit et les artefacts locaux, sans déclaration de
validation par les gates GenOS.
