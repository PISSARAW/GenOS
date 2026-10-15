# ADR 0548 — Capturer un checkpoint natif et réassocier le runtime

- **Statut** : Accepté ; capture intégrée, réassociation qualifiée isolément
- **Date** : 2026-10-15
- **Domaine** : runtime local, CellThread, reprise, contrôle, redémarrage
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0535, ADR 0539, ADR 0542 et ADR 0547

## Contexte

L'ADR 0547 permet de reprendre une génération déjà produite, mais l'appelant
devait encore recopier exactement le contexte natif dans une requête de
scellement CellThread. Cette copie donnait à un corps client la possibilité de
proposer un contexte différent de celui détenu par le processus.

L'attestation du contrôle demeurait par ailleurs attachée à l'objet
`ChildProcess` du backend qui avait lancé le runtime. Après un redémarrage du
backend, connaître un PID ou relire une ancienne annonce ne recrée ni le canal
IPC ni la preuve que le même processus contrôle toujours la même cellule.

## Décision

### Capture native après pause

Le scellement managé reste une requête explicite distincte de la pause. Il ne
crée pas un checkpoint CellThread à chaque génération. Lorsque l'appelant
n'envoie aucun contexte, le backend demande au runtime exact une capture
`capture_checkpoint` par le protocole coopératif.

Cette nouvelle action change la liste exacte des capacités et porte le
protocole coopératif à la version 2. Un runtime version 1 est refusé fermé ; il
doit être redémarré avec le binaire version 2 avant toute capture native. Les
pulsations du bail conservent leur propre version 1, car leur schéma ne change
pas.

La capture n'est recevable que si les conditions suivantes sont toutes vraies :

- la CellThread persistée est `waiting_signal` ;
- le processus porte les six identifiants exacts de la cellule ;
- sa capacité de contrôle est attestée et son bail est frais ;
- le runtime est encore bloqué par une pause au point sûr `generated` ;
- son dernier checkpoint natif possède le schéma exact
  `genos-local-runtime` version 1 et la phase `generated`.

L'accusé de capture contient le contexte, son empreinte canonique et sa taille.
Le parent recalcule ces deux valeurs, vérifie le schéma natif et la limite de
256 Kio, puis dérive lui-même les références de preuve. Un `body.context` ou
des références de preuve fournies par le client ne deviennent jamais
l'autorité de la capture native.

Le runtime reste pausé après l'accusé. L'accusé prouve seulement la capture ;
il ne prouve pas l'écriture SQLite. Le succès du scellement n'est retourné
qu'après la transaction CellThread et la relecture du checkpoint immuable.

Une répétition exacte retourne le même checkpoint. Une répétition dont le
contexte, la lignée ou la portée diffère est une collision ou un refus, jamais
un second succès.

### Fenêtres de panne

Avant l'accusé runtime, aucune capture n'est promue. Entre l'accusé et le commit
SQLite, le runtime demeure pausé et l'appel échoue sans reçu positif. Une
nouvelle requête peut alors recapturer le même état. Après le commit mais avant
la réponse HTTP, l'idempotence permet de relire le checkpoint existant.

La transition de thread, le reçu de commande de pause et le scellement restent
des preuves distinctes. Leur transport ne doit pas les fusionner en un succès
implicite. Une réconciliation expose toute projection partielle au lieu de
présenter un checkpoint comme appliqué.

### Réassociation après redémarrage

Le runtime local ouvre un transport de contrôle reconnectable en boucle locale.
Le descripteur public lie l'endpoint, une identité d'instance runtime, la lignée
complète, une identité de processus et la clé publique éphémère du runtime. Le
PID est une information de diagnostic ; il ne constitue jamais une preuve
d'identité ou d'autorité.

Un nouveau backend crée un challenge frais contenant un identifiant de
reconnexion et un nonce de 256 bits. Il signe le challenge avec sa clé Ed25519
durable. Le runtime vérifie cette signature, la clé attendue, la lignée,
l'instance et l'identité de processus, puis répond avec un second nonce et une
signature de sa clé éphémère. Les messages possèdent une forme exacte.

Le runtime refuse un identifiant de reconnexion rejoué et ne remplace son canal
contrôleur qu'après réception de l'activation exacte. Le backend attache alors
le canal, exige une nouvelle annonce `ready` et ouvre un nouveau bail. Une
ancienne annonce ou un bail détenu en mémoire avant le redémarrage n'est pas
réutilisé.

L'association à `activeProcesses` emploie une comparaison avec le propriétaire
observé : un canal vivant préexistant ou un changement concurrent fait échouer
la réassociation. Une fermeture retire seulement le canal qui possède encore
l'entrée.

## Critères d'acceptation

La capture doit refuser :

- une CellThread active ou toute absence de pause prouvée ;
- les phases `prepared` et `evaluated` ;
- un contexte surdimensionné ou dont l'empreinte et la taille divergent ;
- une lignée, un worker ou un tenant différent ;
- un ACK rejoué, enrichi ou associé à une autre requête ;
- toute écriture partielle présentée comme un succès.

La réassociation doit refuser :

- un PID seul, y compris s'il a été recyclé ;
- un descripteur qui ne correspond pas à la portée attendue ;
- une signature, un nonce, une instance, une clé ou une lignée divergente ;
- un challenge ou une réponse rejoué ;
- une activation sans nouvelle annonce de capacité ;
- le remplacement concurrent d'un canal encore vivant.

Les tests de processus réel doivent aussi démontrer qu'un backend neuf peut
obtenir une nouvelle capacité depuis le même runtime, que l'ancien canal est
fermé seulement après la nouvelle preuve et qu'aucun succès n'est retourné si
le processus meurt dans une fenêtre intermédiaire.

## Conséquences

### Positives

- Le checkpoint CellThread reproduit l'état natif du runtime, sans confiance
  accordée à une copie cliente.
- Le runtime reste quiescent entre la capture et une reprise explicite.
- Le redémarrage du backend n'oblige plus à confondre PID et identité.
- Chaque reconnexion recrée une capacité courte et révocable.

### Limites

- La pause et le scellement restent deux appels explicites.
- Le mécanisme ne capture que `generated` ; `prepared`, `evaluated` et les
  effets arbitraires restent hors du contrat de capture managée.
- Le transport est local à l'hôte. Une réassociation distante demanderait une
  identité d'hôte et une politique réseau supplémentaires.
- La conservation, la rotation et la récupération de la clé privée backend
  restent des responsabilités d'exploitation.
- Un descripteur reconnectable doit provenir du registre persistant et de la
  portée attendue ; accepter un descripteur fourni librement par un client
  annulerait la preuve de lignée.
- La réassociation à la demande ne constitue pas encore un balayage automatique
  de tous les runtimes orphelins au démarrage.

## État de qualification

La capture native est raccordée au contrôle coopératif et au service managé de
scellement. Les tests lancent un véritable processus enfant et une base SQLite.
Ils couvrent le contexte client falsifié, la persistance altérée, le tenant
divergent, les phases interdites, la taille, la CellThread active, le rejeu
idempotent et la perte du commit après capture. Aucun de ces refus ne crée de
checkpoint ni de réponse positive.

Le protocole de réassociation, son transport en boucle locale, le challenge
mutuellement signé, l'activation, la nouvelle annonce de capacité, la course de
propriété et le proxy de contrôle sont qualifiés avec de vrais sockets et un
processus enfant survivant. Cette preuve valide les primitives et leur
composition explicite.

Le runtime local livré ne démarre toutefois pas encore ce serveur dans son
bootstrap normal. Le superviseur ne provisionne ni la clé publique backend ni
un writer durable de descripteur, aucun store produit n'implémente encore
`listReconnectAuthorities`, et le démarrage backend n'appelle pas le recovery
bootstrap. La reconnexion automatique après redémarrage reste donc non prouvée
sur le chemin produit, malgré la réussite de l'expérience multiprocessus. La
réassociation qualifiée recrée seulement le canal de contrôle : elle ne
récupère pas les flux stdout/stderr ni le contexte complet de supervision de
l'ancien backend.

## Alternatives

- Sceller le contexte fourni par le client : écarté, car il peut diverger de
  l'état réellement pausé.
- Sceller chaque génération active : écarté, car une CellThread active n'est
  pas un état reprenable et le runtime continuerait à produire des effets.
- Réutiliser l'annonce `ready` persistée : écarté, car elle atteste un ancien
  canal et un ancien bail.
- Réassocier par PID et chemin d'exécutable : écarté, car un PID peut être
  recyclé et le chemin ne prouve ni la lignée ni la possession d'une clé.
