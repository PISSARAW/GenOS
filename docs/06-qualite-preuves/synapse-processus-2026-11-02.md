# SYNAPSE : dictionnaire divergent, accusé durable et rebase explicite

- **Statut** : Démonstrateur exécutable du profil expérimental Node
- **Date** : 2026-11-02
- **Portée** : Un émetteur et deux destinataires, trois processus et bases séparées

## Exécution

Depuis la racine :

```powershell
npm --prefix backend run test:synapse-protocol
```

Le démonstrateur seul se lance avec
`node backend/tests/test_synapse_protocol_process_recovery.js`.
Les répertoires suivent `os.tmpdir()` ; un volume temporaire disposant d'espace
peut être choisi via `TEMP` et `TMP` pour le seul processus de test. La campagne
a utilisé un autre volume après saturation du disque système.

## Sens et objets réellement partagés

Chaque processus possède ses tables natives de dialectes et de connaissances
communes, alimentées par `dialectService` et `commonGroundService`. Les entrées
ont des provenances locales distinctes. Le codec n'exige pas que deux bases
inventent la même histoire de grounding ; il confronte les liaisons sémantiques,
leur validité, la confiance locale et les exigences de provenance configurées.
Ces déclarations ne constituent pas une attestation de compréhension mentale.

Les documents sont des objets JSON persistés dans SQLite. Le schéma local
définit les états de `P17`, `C42` et `D8`, ainsi qu'une note locale facultative.
Le changement offert rétracte `P17`, suspend `C42` et demande la réévaluation de
`D8`. Il comporte des opérations `put` explicites avec un digest canonique.

Le contexte lie le publisher, l'audience exacte, le domaine, la base et sa
génération, le schéma, le snapshot complet du dictionnaire et les dépendances.
Le snapshot inclut les significations canoniques et les schémas de payload ;
le hash natif du dialecte ne suffit pas à couvrir toutes ces dimensions.
Le delta engage séparément la base, le résultat et les opérations canoniques.

## Un seul dictionnaire change

Le destinataire A possède le contexte attendu. Il reçoit la représentation
compacte, la décode avec les services natifs et applique le changement.

Le dictionnaire du destinataire B est modifié par l'API native, avec une nouvelle
version et un sens différent pour le même symbole. L'offre source reste
inchangée. B conserve son document initial et émet `REQUEST_MISSING`, avec
`dictionary` et `canonicalRequested: true`. Il ne réinterprète pas silencieusement
le symbole selon sa nouvelle définition locale.

L'émetteur transmet alors les opérations canoniques sous le **même engagement**.
Le récepteur vérifie `operationsDigest` et `targetDigest` avant l'application.
Il n'installe ni le dictionnaire ni un schéma distant pour faire réussir l'offre.

## Coupure avant livraison de l'accusé

Le test suspend B après le retour de l'application durable, avant que son
accusé soit acheminé à l'émetteur, puis arrête son processus. L'état modifié,
le reçu d'application et `ACK_STATE` dans l'outbox sont déjà commités ensemble.

Après redémarrage, l'état est toujours à la génération un. Le replay du même
`APPLY_DELTA` renvoie son résultat historique sans appliquer une seconde fois
les opérations. L'outbox retrouve l'accusé et celui-ci est livré à la source.
Les messages livrés sont aussi rejoués à l'identique pour vérifier la déduplication.

La source journalise ses émissions et les réponses reçues. Elle ne prétend pas
avoir appliqué localement le delta simplement parce qu'elle l'a émis ou a reçu
un `ACK_STATE` distant. Son propre document conserve sa génération initiale
jusqu'à une modification locale explicitement autorisée.

## Une seule base change

B ajoute ensuite une note à son document local : sa base passe à la génération
deux. La source prépare un nouveau delta depuis la génération un. B demande
la base manquante et `canonicalRequested` reste faux. Une tentative avec les
opérations canoniques échoue également à appliquer le changement ; aucun reçu
d'application n'est produit et la note locale reste intacte.

L'opérateur de test rebase explicitement le document source par CAS sur l'état
réel de B, puis ouvre une nouvelle conversation pour la **même ressource**.
La nouvelle offre engage cette base et sa génération. Après la demande de forme
canonique due au dictionnaire toujours différent, B applique le résultat à la
génération trois en conservant sa note. A demeure à la génération un.

Le replay de l'ancien succès de B laisse la génération trois inchangée.
La clé de ressource ne dépend pas de la conversation ; ce scénario ne simule
pas un rebase en créant simplement un nouveau document vide.

## Accusés sans promotion implicite

Le registre reçoit un `ACK_FACT` pour `state_applied`, fondé sur le reçu réel
de la conversation. Il n'établit pas automatiquement les autres dimensions.
Un second fait `independently_verified` exécute réellement un programme Node
local installé, dans un sous-processus, qui vérifie les trois statuts attendus
dans le document résultant. Le reçu lie sujet, prédicat, environnement et politique.

Cette séparation d'exécution est annoncée ; une indépendance statistique n'est
pas établie. Le test ne réalise aucune action métier et ne configure aucune
source d'autorisation humaine. Ces deux dimensions restent fausses. Une demande
d'accusé humain sans source correspondante est refusée.

Les reçus sont historiques. Après un autre changement de base, le registre
indique `currentApplicability: not_evaluated` et ne transforme pas un ancien
test réussi en permission actuelle d'agir. `externalActionsAuthorized` reste faux.

## Frontières du profil

L'IPC est un transport de test contrôlé par le superviseur. Les adaptateurs
associent des rôles aux canaux et vérifient les portées ; une identité inscrite
dans un message ne constitue pas à elle seule une authentification réseau.
Cette campagne n'établit pas une interopérabilité Rust ni une fédération de production.

Les états, événements et outbox locaux partagent leur transaction et leur mutex.
Les fournisseurs de contexte et de preuve sont des lectures de confiance.
Les callbacks d'autorisation prennent une décision sans modifier les droits
ou le contexte pendant leur évaluation.
Une configuration externe mutable doit participer au même verrou ou fournir
un mécanisme de révision applicable ; le profil ne rend pas atomiques plusieurs
sources externes arbitraires et n'annonce pas une transaction distribuée.

SYNAPSE/REFLEX exécutable reste hors de cette version. Aucun récepteur n'est
déclenché par la seule réception d'un delta. Les commandes, effets inconnus,
reprises et autorisations réelles doivent être raccordés séparément aux garanties
d'exécution, notamment celles d'OMEGA.

Voir le [contrat](../03-reference/protocole-synapse.md), le
[contexte natif](../03-reference/synapse-contexte.md), la
[conversation durable](../03-reference/synapse-conversations.md) et les
[accusés distincts](../03-reference/synapse-accuses.md).
