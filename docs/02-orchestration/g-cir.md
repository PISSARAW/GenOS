# G-CIR : interface cognitive résiduelle de GenOS

- **Statut** : Partiel ; noyau Omega livré localement, intégrations générales encore progressives
- **Portée** : contrats cognitifs, admission, projection vers un modèle, visibilité et validation
- **Dernière revue** : 2026-10-04
- **Décisions liées** : [ADR 0294](../adr/0294-contrat-residuel-cognitif-signal-plane.md), [ADR 0297](../adr/0297-g-cir-generation-hypotheses-trinity.md), [ADR 0299](../adr/0299-registre-obligations-g-cir.md)

---

## 1. Définition

**G-CIR** (GenOS Cognitive Intermediate Representation) désigne un contrat
intermédiaire entre une intention ou un événement GenOS et le récepteur qui doit
effectuer le travail restant. Son objectif est de résoudre localement les obligations
qui relèvent du runtime, puis de ne présenter à un modèle que le problème qui exige
effectivement ses capacités. Le contrat et son rendu pour le modèle sont deux objets
différents.

Le système doit pouvoir répondre, pour chaque interaction cognitive :

1. Quelle obligation reste ouverte ?
2. Pourquoi un appel au modèle est-il admis ?
3. Quelle information le modèle reçoit-il réellement ?
4. Pourquoi une autre information a-t-elle été omise ?
5. Quelle vérification autorise l'utilisation du résultat ?

Le nom « représentation intermédiaire » est une analogie avec les compilateurs.
Il ne signifie ni que les LLM comprennent un jeu d'opcodes universel, ni que toute
mission libre est aujourd'hui compilée par GenOS. La contribution à mesurer est
l'ensemble admission + résidualisation + visibilité + validation indépendante.

### 1.1 Principe

```text
Intention ou événement
  -> obligations et dépendances
  -> exécution non neuronale autorisée
  -> résidu encore ouvert
     -> vide : aucun appel LLM
     -> non vide : admission, contexte, projection, inférence
  -> candidat
  -> vérification indépendante
  -> émission ou promotion autorisée
```

Le Signal Plane applique déjà une partie de cette séquence : un récepteur peut
traiter un signal sans LLM ; l'escalade cognitive intervient sous une porte VoI.
L'adaptateur G-CIR livré ici ne s'active qu'après cette porte. Il ne remplace ni
le bus de signaux, ni l'ordonnanceur, ni les gates de preuve.
Trinity utilise le même contrat pour sa génération optionnelle d'hypothèses,
après sa porte de budget. La sélection du triplet reste sous le contrôle de
`trinityService` ; elle ne constitue pas une vérification expérimentale.

## 2. Statut des assertions et modèle logique

Dans cette fiche, **implémenté** signifie qu'un chemin de code et un test
exécutable existent. **Contrat cible** désigne une interface proposée dont le
runtime général n'existe pas encore. Une formule de coût est une définition
d'évaluation, pas une garantie d'optimalité. Un résultat du modèle n'est pas une
preuve parce qu'il respecte une grammaire.

Soit un contrat $C$ et son ensemble d'obligations $O(C)$. Chaque obligation
possède un état parmi `satisfaite`, `imposée`, `ouverte` et `bloquée`. Le
registre local maintient l'invariant pour les graphes de ses deux adaptateurs.
Un compilateur général devrait le maintenir pour toutes les missions :

$$
\forall o \in O(C),\quad
\operatorname{état}(o) \in
\{\text{satisfaite},\text{imposée},\text{ouverte},\text{bloquée}\}.
$$

Une obligation peut être omise du rendu destiné au modèle seulement si son état
et sa justification restent traçables hors de ce rendu. Une contrainte appliquée
par le runtime demeure visible au modèle lorsqu'elle change les choix que celui-ci
peut proposer. La classification exhaustive des obligations de missions libres
est un **contrat cible** ; le code actuel ne l'affirme pas.

Pour un appel admis, soit $R$ le résidu et $V$ la vue matérialisée dans
l'invocation. La projection portable est :

$$P = \operatorname{render}_{m}(R,V,K),$$

où $m$ représente les capacités du backend et $K$ les contraintes nécessaires
au raisonnement. Le hash de $P$ atteste les octets rendus par l'adaptateur ;
il n'atteste ni la compréhension du modèle, ni la fidélité d'une éventuelle
compaction en amont.

### 2.1 Invariants normatifs

| Invariant | Exigence | État actuel |
| --- | --- | --- |
| Admission | Aucune inférence sans autorisation explicite et résidu | Portes existantes et nœud `INFER` ouvert exécutable |
| Dépendances | Pas de cycle ni de référence manquante | Registre versionné, ordre topologique et digest déterministe |
| Type | Source et contexte cohérents | Signal validé ; mission et candidats Trinity contrôlés |
| Taille | Pas de troncature silencieuse | Projection supérieure à 16 Kio bloquée |
| Visibilité | Une référence seule n'est pas un contenu lu | Données du signal incluses ; reçu limité à l'invocation |
| Omission | Chaque suppression connue est justifiée hors prompt | Registre pour doublons et métadonnées de ce chemin |
| Épistémologie | Sortie neuronale = candidat | Signal : `candidate`, `need`, `unknown` ; Trinity : hypothèses `unverified` |
| Effets | Aucun effet accordé par le texte du modèle | Aucun exécuteur d'effet dans l'adaptateur |
| Fraîcheur | Connaissance expirée exclue | Lectures du common ground filtrées |
| Transport | Les octets internes ne sont pas du langage modèle | MessagePack existant hors de cet adaptateur |

Le registre persistant de visibilité porte désormais la session, la révision,
les fragments matérialisés et les événements d'invalidation. Un reçu sans
session explicite est rattaché à une session stable de l'agent ; une nouvelle
révision est créée lors d'un changement de modèle, de version ou de contexte.

## 3. Analogie et frontières réelles

L'analogie avec une chaîne `source -> IR -> machine` est utile pour séparer
la sémantique de son transport. Elle s'arrête à la frontière du modèle : un
LLM textuel ordinaire interprète du texte ou du code appris, et pas des octets
MessagePack ni des opcodes inventés. Une instruction compacte n'est intéressante
que si le récepteur peut en préserver le sens et la qualité à moindre coût total.

Le système distingue cinq assertions :

| Assertion | Exemple | Ce qu'elle prouve |
| --- | --- | --- |
| Possession runtime | Un artefact est stocké | GenOS peut le résoudre sous autorisation |
| Référence agent | Un identifiant apparaît dans un message | L'agent peut connaître son nom |
| Livraison | Une enveloppe a été reçue | Un transport a eu lieu |
| Visibilité | Le contenu figure dans l'invocation actuelle | Le modèle pouvait le lire |
| Compréhension | Le résultat utilise correctement ce contenu | À établir par évaluation, pas par reçu |

Le `commonGroundService` répond à des questions de connaissance partagée ;
il ne répond pas à la quatrième ni à la cinquième ligne. Son filtre d'expiration
évite seulement de qualifier comme « connue » une entrée périmée.

## 4. Cas d'usage et objectifs

### 4.1 Signal sans récepteur

Un signal de type valide, non traité par un récepteur, peut franchir la porte
d'escalade cognitive. G-CIR vérifie la cohérence de l'événement et du contexte,
matérialise les données utiles et appelle le `modelRouter` avec un rendu concis.
Le résultat est consultatif. Sans vérificateur ou actionneur autorisé, la
publication d'une décision reste interdite.

### 4.2 Débogage avec preuve

Le contrat cible d'un audit contient l'objectif, les chemins autorisés, la
contrainte « ne pas modifier », le budget, la méthode de reproduction et la
condition de publication. Un outil déterministe peut résoudre une partie de
ces obligations. Seule une question restant ouverte peut déclencher `INFER`.
Un constat du modèle passe ensuite par un reproducer indépendant avant `EMIT`.
Ce flux complet n'est **pas** implémenté par l'adaptateur Signal Plane.

### 4.3 Hypothèses Trinity

Lorsque `trinityHypothesisDesign.generateHypotheses` est demandé et que le plan
fixe n'a pas déjà été remplacé par un triplet fourni, Trinity peut admettre une
inférence dans la limite de son budget. Le compilateur matérialise la mission
et les candidats fournis, borne le rendu à 16 Kio et inscrit les autres champs
du design dans le registre d'omissions. La réponse est un ensemble de six
hypothèses candidates au maximum. Le service existant normalise et sélectionne
le triplet ; les protocoles proposés restent au statut `proposed`.

### 4.4 Calcul formel

Une opération `PROVE` appartient au backend formel et conserve l'énoncé exact,
les hypothèses et la version de l'environnement de preuve. Une proposition de
lemme par LLM est un candidat ; le vérificateur formel est l'autorité pour le
statut `formally_proved`. G-CIR ne convertit jamais un mot comme « prouvé »
dans la réponse du modèle en reçu de preuve.

## 5. Exemple concret du chemin implémenté

Entrée schématique :

```text
signalId = s1
signalType = ligand
llmRequired = true
signalData = {semanticType: NOVEL, claim: "review this signal"}
context.constraint = "Do not write files"
```

Le rendu actuel garde une instruction courte, les champs structurants, les
données du signal et la contrainte supplémentaire. Le champ `semanticType`
est retiré de `signal.data` parce qu'il apparaît déjà comme
`signal.semanticType`. L'identifiant de transport, la taille du payload et
l'heure d'escalade restent hors prompt, avec justification dans `omissions`.
Les objets irréguliers sont sérialisés en JSON compact ; c'est un choix local
de rendu, pas le format de l'IR ni un protocole imposé à tout GenOS.

Réponses reconnues :

```text
candidate inspect receptor mapping
need source artifact
unknown
```

La réponse `candidate` conserve le statut `unverified`. Une sortie libre ou
mal formée devient `unknown` avec la raison `invalid_response`. Aucune de ces
réponses ne modifie le dépôt ou l'état d'un agent.

Pour Trinity, le rendu porte la mission et `callerCandidates` sous forme JSON.
Une sortie JSON invalide, une projection surdimensionnée ou un reçu déjà en
échec renvoie le plan fixe sans nouvel appel au modèle. Le résultat expose
`verification: unverified`, le digest du prompt et l'identifiant du reçu.

## 6. Architecture technique

### 6.0 Incrément G-CIR Omega

Le noyau Omega ajoute un chemin de compilation sémantique indépendant des
adaptateurs historiques Signal Plane et Trinity. Il accepte les opérations
`READ`, `SELECT`, `CALL`, `INFER`, `CHECK` et `EMIT` dans le même registre
d'obligations, puis produit une SSA cognitive minimale (`%1`, `%2`, ...), un
slice causal arrière depuis les obligations demandées et une projection JIT.
Cette projection sélectionne une représentation supportée par le profil ABI du
modèle (`portable`, `json`, `sexpr`, `table` ou `code`) ; le modèle inconnu
retombe sur `portable`.

Le service `cognitiveVisibilityLedger` matérialise des objets par session et
révision, et permet l'invalidation explicite lors d'une compaction, d'un reset
ou d'un changement de contexte. `cognitiveWorkingSetService` fournit le
registre/page-in/page-out et retourne `page_fault` lorsqu'une référence n'est
pas dans le working set. `cognitiveMmuService` transforme désormais ce défaut
en résolution active : permission, resolver, matérialisation dans le ledger,
coût bytes/tokens/latence et chargement sont contrôlés ; son préchargeur ne
charge que les pages dont l'utilité attendue dépasse le coût estimé. Un défaut
non autorisé ou non résolu reste bloqué.

Le compilateur Omega est exposé par
`backend/src/services/cognitiveOmegaCompiler.js`. Il reste volontairement
additif : les points d'entrée existants conservent leur contrat v2 et leurs
reçus, mais `modelRouter.generate` constitue désormais la passerelle Omega
commune. Les domaines Signal, Trinity, Biocénose, workers, évaluations,
primitives et contrôleurs construisent leurs graphes natifs via
`cognitiveOmegaDomainGraphService`. Une requête non classifiée reste enveloppée
dans le graphe runtime de compatibilité ; une requête portant un programme Omega
explicite utilise le slice et la projection calculés par Omega. La mise en production d'un `CHECK` ou d'un `EMIT` exige toujours un
vérificateur ou un actionneur autorisé ; le texte d'un modèle ne peut pas
fournir lui-même cette autorité.

Ces graphes ne sont plus une simple suite fixe de cinq étiquettes : chaque
objet reçoit une référence et un digest, chaque `SELECT` porte ses critères et
ses dépendances, `CHECK` porte le binding de preuve et les `CALL`/`EMIT` portent
un contrat d'effets. Le runtime peut résoudre le magasin d'objets et appliquer
la sélection sémantique lorsqu'aucun handler spécialisé n'est enregistré.

L'exécution est fournie par
`backend/src/services/cognitiveOmegaRuntimeService.js`. Elle ne traite pas les
opérations comme de simples étiquettes : `READ` résout un objet via un lecteur
autorisé ou une table d'objets explicitement fournie, `SELECT` applique un
sélecteur enregistré ou transmet les dépendances, `CALL` invoque un outil
enregistré après contrôle de permission, `INFER` invoque un inferer enregistré
avec l'entrée des dépendances et le contexte de l'opération, `CHECK` exige un
vérificateur dont le résultat est effectivement vérifié, et `EMIT` exige à la
fois une permission d'effet et le reçu vérifié d'une dépendance `CHECK`. Toute
absence de handler, permission ou reçu bloque l'exécution. Le runtime retourne
un digest des résultats et ne considère jamais une réponse textuelle de modèle
comme une preuve.

### 6.1 Noyau cible

Le noyau proposé comprend six opérations. Leurs noms désignent une sémantique
runtime, pas des tokens spéciaux universels pour les modèles.

| Opération | Contrat attendu | Implémentation G-CIR actuelle |
| --- | --- | --- |
| `READ` | Résoudre une référence autorisée et versionnée | Hors périmètre |
| `SELECT` | Construire la vue des dépendances utiles | Champs du signal ou mission et candidats Trinity |
| `CALL` | Exécuter un outil autorisé | Existant dans GenOS, sans IR G-CIR général |
| `INFER` | Soumettre un résidu admis au modèle | Runtime Omega via `registerInferer`, plus Signal Plane et génération d'hypothèses Trinity |
| `CHECK` | Vérifier le candidat avec méthode et périmètre | Registre épistémique générique et receipts signés |
| `EMIT` | Publier selon permissions et reçus | Non branché sur ce chemin |

Le registre livré déclare les dépendances de `INPUT`, `GATE`, `INFER`, `CHECK`
et `EMIT` pour les deux adaptateurs. Chaque nœud a un identifiant, un type,
un état et des dépendances. Un nœud satisfait ou imposé porte une justification ;
un `CHECK` satisfait exige un reçu de vérification, un `EMIT` satisfait un reçu
d'effet. Les nœuds ouverts constituent le résidu. Le registre rejette les
cycles, dépendances absentes ou encore ouvertes pour un nœud déclaré résolu,
doublons, champs inconnus et graphes de plus de
64 nœuds. Il fournit un ordre topologique et un digest SHA-256 déterministe.
`ready` exige un `INFER` ouvert dont toutes les dépendances sont satisfaites ou
imposées ; `resolved` et `deferred` ne lancent pas le modèle.

Le runtime Omega crée par défaut un registre `cognitiveEpistemicCheckService`;
un registre explicite reste disponible comme override pour les environnements
spécialisés. Les descripteurs portés par les opérations `CHECK` y sont
enregistrés automatiquement. Le registre branche les vérifications `CHECK`
sur les adaptateurs de tests/reproduction, validation de schéma, commandes SMT
en sandbox, Lean, AEIS, SHEV et receipts signés. Chaque résultat est converti
en receipt HMAC lié à l'identifiant de l'opération et à un digest d'observations.
Un résultat inconclusif, une signature absente ou un vérificateur non autorisé
bloquent `CHECK` et empêchent toute émission dépendante.

Le graphe cible général déclare les dépendances et les sorties de ces opérations.
Un nœud `INFER` n'est supprimé que si un résultat réutilisable encore valide
ou une voie non neuronale autorisée satisfait la même obligation. Ce mécanisme
général de suppression n'est pas encore livré.

### 6.2 Fichiers et responsabilités

| Composant | Responsabilité actuelle |
| --- | --- |
| [`cognitiveEscalationService.js`](../../backend/src/services/cognitiveEscalationService.js) | Porte VoI et contexte minimal du signal |
| [`cognitiveResidualCompiler.js`](../../backend/src/services/cognitiveResidualCompiler.js) | Validation, rendu portable, omissions, contrat et reçu |
| [`cognitiveObligationRegistry.js`](../../backend/src/services/cognitiveObligationRegistry.js) | Validation du graphe, plan résiduel et digest canonique local |
| [`cognitiveInferenceReceiptService.js`](../../backend/src/services/cognitiveInferenceReceiptService.js) | Reçu SQLite, octets exacts du rendu et déduplication des appels |
| [`cognitiveSignalService.js`](../../backend/src/services/cognitiveSignalService.js) | Appel au routeur et classification consultative |
| [`trinityHypothesisGenerationService.js`](../../backend/src/services/trinityHypothesisGenerationService.js) | Admission budgétaire, candidats Trinity et repli fixe |
| [`signalPlaneSubscriber.js`](../../backend/src/services/signalPlaneSubscriber.js) | Déclenchement après routage, sans crédit de succès vérifié |
| [`commonGroundService.js`](../../backend/src/services/communication/commonGroundService.js) | Connaissance partagée et exclusion des entrées expirées |
| [`modelRouter.js`](../../backend/src/services/modelRouter.js) | Passerelle Omega commune, sélection et invocation du backend modèle ; les prompts vision Computer Use passent aussi par cette voie |

Les contrats retournés par `compileSignal` et `compileHypotheses` portent
`version: 2`, `operation`, `source`, `recipient`, `output`, `check`,
`obligationVersion` et `obligationDigest`. Chaque compilation expose aussi le
graphe et son plan. Ce n'est pas encore un schéma d'interopérabilité
inter-langages. Une évolution de ces champs exige une version de contrat et des
tests de lecture rétrocompatible avant persistance durable.

### 6.3 Admission et refus

L'adaptateur exige un agent cible, `llmRequired === true`, un type de signal
supporté, un identifiant de signal, des données objet et un contexte cohérent.
Il refuse un contexte qui contredit l'identifiant, le type, le type sémantique,
le sujet ou l'expéditeur du signal. Il refuse également une projection non
sérialisable ou dépassant 16 Kio. Ces refus précèdent `modelRouter.generate`.
Pour Trinity, l'activation explicite, le plan encore fixe et le budget sont
des préconditions supplémentaires. Une mission absente, des candidats mal
typés ou un rendu trop volumineux bloquent cet appel sans bloquer le plan fixe.

La porte VoI amont est une heuristique d'admission. Le fait de ne trouver aucun
récepteur n'établit pas, à lui seul, qu'une inférence soit utile ou autorisée.
Le contrat cible doit aussi représenter l'autorisation, le budget et les
capacités réelles du modèle pour tous les points d'entrée.

### 6.4 Visibilité attestée

Le reçu comprend un destinataire, la source, un hash SHA-256 du prompt exact,
la session, la révision de visibilité et le modèle rapporté par le routeur. Le
rendu exact, le graphe d'obligations, les fragments matérialisés et les
événements d'invalidation sont persistés dans SQLite, avec les objets
structurés encodés en MessagePack. La reprise après crash relit la session et
ses fragments valides depuis SQLite.
Une livraison répétée du même signal, ou une génération Trinity répétée pour
la même mission, au même destinataire, pour la même version et le même hash de
rendu, réutilise une réponse terminée. Une invocation en
cours ou échouée ne déclenche pas automatiquement une nouvelle inférence.
Le hash des octets stockés et l'audit du graphe sont revérifiés lors de la
réutilisation. Un budget différent pour un rendu Trinity identique échoue fermé :
la clé SQLite historique ne distingue pas encore les digests de graphe.

Un artefact seulement accessible par outil n'est pas « déjà lu » : seul un
fragment enregistré par le ledger est visible. Une compaction, une expiration,
un changement de modèle ou une reprise après crash invalide les fragments
concernés et conserve l'événement d'invalidation.

### 6.5 Registre des omissions

Chaque champ supprimé de la projection actuelle produit une entrée
`{field, reason}` hors prompt. Les raisons en usage sont `already_materialized`,
`payload_materialized_inline`, `runtime_identifier`, `runtime_metadata` et
`outside_generation_contract` pour les champs Trinity non projetés.
Le contrat cible distingue en plus : résultat exécuté avec reçu, résultat
réutilisé et valide, donnée exactement dérivable, hors dépendances déclarées,
ou omission heuristique soumise à une politique de risque. Une omission
heuristique n'est jamais qualifiée de preuve d'inutilité.

## 7. Transport, rendu et coût

| Frontière | Choix de conception | Situation actuelle |
| --- | --- | --- |
| Même processus | Structures typées | Objet JavaScript dans l'adaptateur |
| Transport/persistance interne | Profil binaire versionné si nécessaire | Reçus en MessagePack BLOB ; aucun profil inter-langages G-CIR |
| Code/preuve | Format natif du domaine | Non intégré à cet adaptateur |
| Entrée LLM | Texte, code ou tableau compris par le backend | Texte portable, objets imbriqués en JSON compact |
| API fournisseur | Format imposé par l'API | Le routeur existant garde cette frontière |

MessagePack ne définit pas à lui seul des octets canoniques pour un contrat
GenOS : ordre des champs, extensions, entiers, flottants et évolution de schéma
doivent être fixés et testés entre Node et Rust. Le digest JSON existant des
enveloppes de communication ne doit pas changer sans version explicite.
CBOR déterministe constitue une alternative à évaluer, pas une migration
annoncée. Un paquet binaire encodé en Base64 ne devient pas une instruction
compréhensible pour un LLM textuel.

Le coût pertinent est celui de l'épisode complet :

$$
C_{\mathrm{épisode}} = C_{\mathrm{compilation}} + C_{\mathrm{contexte}}
 + C_{\mathrm{inférence}} + C_{\mathrm{récupération}}
 + C_{\mathrm{réparation}} + C_{\mathrm{transport}}.
$$

La limite actuelle de 16 Kio borne les octets du rendu, mais n'est pas un
comptage de tokens. Un sélecteur de rendu futur doit utiliser le tokenizer du
backend lorsque possible, enregistrer l'usage rapporté, inclure les reprises
et comparer qualité, coût et latence sur des données indépendantes. Aucun gain
de tokens ou de fiabilité n'est revendiqué pour cette première intégration.

## 8. Topologies et morphogenèse

G-CIR a vocation à transporter le même contrat sémantique à travers les huit
topologies. La morphogenèse choisit l'organisation ; G-CIR définit le résidu
et la vue utiles aux récepteurs retenus. Cette interaction est un **contrat
cible**, pas un câblage déjà présent dans chaque topologie.

| Topologie | Projection envisagée | Garde-fou |
| --- | --- | --- |
| Trinity | Hypothèses distinctes, candidats et reçus | La convergence des chambres n'est pas une preuve |
| A-Team | Entrées et sorties par étape | Une étape ne reçoit que ses dépendances déclarées |
| Biocénose | Claims, désaccords et éléments probants | Le vote ne valide pas un fait |
| Biome | Signaux de ressource et activation | Priorité ne signifie pas vérité |
| Rhizome | Changements et dépendances invalidées | Une référence périmée doit être rechargée |
| Syncytium | État partagé lorsque compatible | Partage de mémoire ne prouve pas visibilité du modèle |
| Holobionte | Contrats de capacités des organes | Un outil conserve sa propre autorité |
| Métapopulation | Routines et contrats versionnés | Compatibilité vérifiée à destination |

Le noyau de six opérations reste commun. Les différences de topologie se
représentent par le graphe, les droits, le budget et les vues, plutôt que par
huit langages d'instructions indépendants. AGOW peut orienter les priorités
sans traduire chaque message.

## 9. Validation et processus de déploiement

### 9.1 Tests exécutables actuels

Le test [`test_cognitive_obligation_registry.js`](../../backend/tests/test_cognitive_obligation_registry.js)
couvre la canonicalisation du graphe, le résidu exécutable, les cycles,
les dépendances manquantes, les doublons et les justifications de `CHECK`.
Le test [`test_cognitive_residual_compiler.js`](../../backend/tests/test_cognitive_residual_compiler.js)
couvre l'admission, le blocage avant appel, la projection de la contrainte,
des unités et de la provenance, le registre d'omissions, le hash du rendu,
la variation du digest de graphe lorsque ces champs changent, la réutilisation, la concurrence,
la corruption du reçu, les réponses typées et l'expiration
du common ground. Il appartient au profil `signalPlane`.
Le test [`test_gcir_trinity_hypothesis_generation.js`](../../backend/tests/test_gcir_trinity_hypothesis_generation.js)
couvre la projection Trinity, son reçu, la réutilisation, le repli fixe et
l'absence d'appel après échec ou dépassement de taille.

```powershell
node backend/tests/test_cognitive_obligation_registry.js
node backend/tests/test_cognitive_residual_compiler.js
node backend/tests/test_gcir_trinity_hypothesis_generation.js
npm --prefix backend run test:signal-plane
```

Ces tests n'établissent ni un gain de coût, ni une généralisation aux modèles
réels. Le test du routeur utilise un stub pour vérifier la frontière d'appel.

### 9.2 Gates requis pour l'extension

1. Cartographier tous les points d'entrée modèle, leurs permissions et leurs
   contrats de sortie ; ne pas supposer que `cognitiveSignalService` les couvre.
2. Livré localement : registre d'obligations versionné et graphe de dépendances
   sur Signal Plane et Trinity. Les tests contrôlent la projection des négations,
   unités et provenances, puis le changement de digest si elles varient. Une
   conservation sémantique sur missions libres reste à établir.
3. Livré localement : registre de visibilité persistant par session, avec cold
   start, compaction, changement de modèle, expiration, invalidation et reprise
   après crash ; les tests couvrent aussi son lien avec les reçus SQLite.
4. Lier `CHECK` et `EMIT` aux vérificateurs et gates déjà autorisés ; rejeter
   les auto-déclarations de preuve et les effets répétés après redelivery.
5. Définir des vecteurs binaires Node/Rust avant tout transport G-CIR canonique.
6. Comparer sur des jeux figés le système courant, une prose courte, un rendu
   fixe et la résidualisation complète ; mesurer erreurs, tokens, coût et
   latence p50/p95 avec intervalles d'incertitude.
7. La projection adaptative est désormais profilée par modèle et domaine dans
   `cognitive_projection_samples` : le tokenizer backend mesure les tokens,
   tandis que coût, latence et qualité doivent être fournis par le runtime.
   `cognitiveProjectionProfilerService` sélectionne empiriquement une
   représentation seulement lorsque la qualité est attestée, puis versionne la
   promotion PGO dans `cognitive_projection_policies`. Les promotions et
   rollbacks sont également inscrits dans le journal GVX lorsqu'un scope est
   fourni.

Les résultats enregistrés lors d'un replay ne sont pas une nouvelle inférence
reproductible à l'identique. Les essais de formats supplémentaires consomment
un budget d'expérimentation distinct des optimisations de production.

## 10. Antériorités et comparaison

| Travail | Antériorité pertinente | Différence à tester pour GenOS |
| --- | --- | --- |
| [LMQL](https://arxiv.org/abs/2212.06094) | Langage de requêtes, contraintes et contrôle autour des LLM | Conservation des obligations et autorité du runtime |
| [LLMCompiler](https://arxiv.org/abs/2312.04511) | Graphe et parallélisation d'appels de fonctions | Résidu par récepteur et visibilité vérifiable |
| [Agora](https://arxiv.org/abs/2410.11905) | Routines fréquentes, langage naturel pour cas rares | Intégration aux gates épistémiques de GenOS |
| [LLMLingua-2](https://aclanthology.org/2024.findings-acl.57/) | Compression de prompts par sélection de tokens | Suppression du travail neuronal déjà résolu |
| [TOON](https://github.com/toon-format/toon) | Rendu compact de données structurées uniformes | Sélection de format selon coût et fidélité |
| [LatentMAS](https://arxiv.org/abs/2511.20639) | Collaboration dans des représentations latentes | Adaptateur optionnel si accès internes disponibles |

Ces travaux montrent que langage compilé, routines, compression et
communication latente ont des antécédents. Aucune exclusivité mondiale n'est
revendiquée. La combinaison G-CIR constitue une hypothèse d'ingénierie à
évaluer sur des tâches, modèles et coûts comparables.

## 11. Limites et non-objectifs

La décision Omega porte maintenant un bloc d'économie cognitive :
`cognitiveEconomyControllerService` normalise les huit topologies canoniques,
calcule un niveau L0–L5 à partir du risque et de l'incertitude, sélectionne le
meilleur ROI observé et attache tokens, latence, coût et risque au contrat.
AGOW, Morphogenèse, RPE et Natural Search disposent de profils d'intégration
explicites. Ce pilotage choisit la profondeur et les vérifications du graphe ;
il ne transforme pas une estimation ROI en preuve de qualité.

Le `modelRouter` transmet désormais ce plan au runtime Omega. Le MMU fourni par
le contexte de requête est utilisé par `READ` pour résoudre les défauts de page;
avec une base SQLite et un identifiant de session, le routeur peut construire
un working set et un ledger de visibilité persistants. La procéduralisation est
également raccordée au cycle : une procédure active et validée peut réutiliser
un résultat sans appel LLM, tandis qu'une exécution portant des références de
preuve peut enregistrer une trace et produire un candidat de compilation. Une
trace sans preuve ne peut pas être promue automatiquement.

L'interopérabilité Node/Rust utilise le schéma partagé
`spec/g-cir-omega.schema.json`, une enveloppe MessagePack positionnelle et les
vecteurs `spec/g-cir-omega-vectors.json`. Le test Node et le test `genos-mcp`
doivent produire le même octet-par-octet et le même digest; le payload binaire
est un JSON canonique UTF-8, tandis que le contrat logique expose un objet.

- Le compilateur universel de missions libres et l'ISA exécutable inter-langages
  restent hors périmètre ; les appels modèle applicatifs passent toutefois par
  la passerelle Omega commune, avec un wrapper de compatibilité pour les anciens
  contrats.
- Les vérificateurs spécialisés restent dépendants de leurs outils et de leurs
  configurations (tests, Lean, AEIS ou SHEV) ; une indisponibilité produit un
  état inconclusif et ne vaut pas preuve.
- `READ`, `CALL`, `CHECK` et `EMIT` décrivent le noyau cible ; leur simple nom
  ne donne aucune capacité, permission ou preuve au modèle.
- Le reçu de visibilité actuel atteste un rendu pour une invocation ; il ne
  prouve pas le contexte retenu dans une session ni la compréhension.
- Un modèle peut mal interpréter des champs malgré leur délimitation. La
  validation indépendante reste nécessaire avant tout effet.
- Le format textuel portable vise la compréhension de nombreux LLM ; il ne
  garantit pas qu'un modèle particulier possède la capacité de la tâche.
- Aucune compression latente ni fine-tuning ne sont revendiqués. La projection
  adaptative mesure et sélectionne les formats textuels disponibles ; elle ne
  fabrique pas une mesure de qualité à partir d'un succès de transport.

La prochaine étape est de relier les hypothèses retenues à des résultats
expérimentaux vérifiés, puis de comparer la qualité et le coût de bout en bout
avant d'élargir le déploiement. Ni le reçu d'inférence ni la sélection du
triplet ne sont des résultats de `CHECK`.
