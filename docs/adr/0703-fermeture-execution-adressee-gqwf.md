# ADR 0703 — Sceller une fermeture d'exécution GQWF adressée par contenu

- **Statut** : Accepté
- **Date** : 2026-10-20
- **Domaine** : GQWF, CAS, provenance, reproductibilité, Nix
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0369, ADR 0629, ADR 0643, ADR 0701

## Contexte

GQWF identifie déjà les octets d'une racine, le backend de matérialisation et
les preuves de promotion. Une racine ne décrit toutefois ni la commande, ni le
runtime, ni les dépendances et variables qui ont influencé l'exécution. Deux
runs peuvent donc partager les mêmes fichiers d'entrée sans partager le même
contexte d'exécution.

Nix traite cette question avec des dérivations et une fermeture de dépendances
hermétique. Reprendre immédiatement ce contrat complet exigerait un sandbox de
build, une résolution de store et une capture de tous les accès externes que
GQWF ne possède pas. Affirmer l'herméticité à partir de simples hashes serait
contraire au modèle de preuve GenOS.

## Décision

Introduire `gqwf-execution-closure-v1`, un manifeste canonique lié à une racine
GQWF existante. Il contient :

- la commande et ses arguments ordonnés ;
- l'identité, la version et le digest du runtime ;
- une liste triée de dépendances versionnées et digérées ;
- les noms de variables d'environnement et le hash de leur valeur, jamais leur
  valeur en clair ;
- une assurance non modifiable indiquant `externalInputs: declared-only` et
  `sandbox: not-attested`.

`sealExecutionClosure` valide et trie le manifeste, l'écrit dans le CAS de
métadonnées, puis indexe `(workspace, closureHash, rootHash)` dans
`gqwf_execution_closures`. Un rejeu identique est idempotent. Toute variation
de racine, runtime, dépendance, commande ou empreinte d'environnement change
le hash.

`inspectExecutionClosure` relit l'objet par hash, reconstruit sa forme
canonique, vérifie son identité, son workspace et l'accessibilité de sa racine.
L'objet reste inspectable si la ligne d'index a disparu et retourne alors
`registered: false`. Cette propriété permet à un reçu externe de conserver le
hash sans présenter l'index SQLite comme l'unique copie autoritative.

Une fermeture indexée protège sa racine de la collecte GQWF. Le scrub relit
chaque objet de fermeture indexé et signale `invalid_execution_closure` si son
hash, sa forme canonique ou sa racine ne peuvent plus être vérifiés.

La tranche ne raccorde pas encore automatiquement ce manifeste à toutes les
missions. Le runtime appelant doit fournir les digests observés ; aucune valeur
ambiante n'est inventée ou lue implicitement.

## Conséquences

### Positives

- Une exécution peut référencer une description immuable de ses entrées
  déclarées en plus de la racine de fichiers.
- L'ordre des dépendances et variables n'altère pas l'identité.
- Les secrets d'environnement ne sont pas stockés en clair.
- Un `valueHash` non salé ne protège pas un secret à faible entropie contre une
  attaque par dictionnaire ; l'opérateur doit préférer une référence opaque ou
  un HMAC calculé hors de GQWF.
- Le manifeste rend visibles les limites d'assurance au lieu de revendiquer une
  reproductibilité non testée.
- Le hash survit à une perte de l'index SQLite s'il est conservé par un reçu.
- La collecte conserve les racines liées et le scrub couvre l'intégrité des
  fermetures indexées.

### Négatives et limites

- La liste est déclarative : GQWF ne prouve pas encore que le processus n'a lu
  aucun fichier, réseau ou état global supplémentaire.
- Le digest d'un runtime ou d'une dépendance doit être fourni par une couche
  capable de l'observer correctement.
- Les arguments peuvent contenir des données sensibles ; les appelants doivent
  utiliser des références ou hashes pour les secrets.
- L'index des fermetures n'est pas encore inclus dans `gqwf-catalog-v1` et ne
  bénéficie pas de sa reconstruction SQLite.
- La présence d'une fermeture ne constitue ni un verdict de test ni une
  autorisation de promotion.

## Alternatives

### Revendiquer une dérivation Nix complète

Rejeté : aucun sandbox hermétique ni store de dérivations n'en fournit encore
la preuve.

### Capturer tout l'environnement en clair

Rejeté : cela persisterait des secrets et rendrait le manifeste dépendant de
variables sans rapport avec le résultat.

### Hasher un JSON libre fourni par l'appelant

Rejeté : l'ordre, les champs inconnus et les doublons produiraient des identités
ambiguës et empêcheraient une validation indépendante.

### Lier la fermeture directement à la promotion

Différé : les parcours de mission doivent d'abord fournir des digests observés
et une attestation d'isolation ; une fermeture déclarative seule ne doit pas
durcir artificiellement le gate.

## Validation

`node backend/tests/test_gqwf_execution_closure.js` couvre l'identité
canonique, l'idempotence, la perte d'index, l'altération du CAS, les champs
secrets refusés, les doublons, les digests invalides et les racines inconnues.
