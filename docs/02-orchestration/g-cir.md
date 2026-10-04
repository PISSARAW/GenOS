# G-CIR : interface cognitive résiduelle de GenOS

- **Statut** : Partiel ; adaptateurs opérationnels dans le Signal Plane et la génération d'hypothèses Trinity
- **Portée** : contrats cognitifs, admission, projection vers un modèle, visibilité et validation
- **Dernière revue** : 2026-10-04
- **Décisions liées** : [ADR 0294](../adr/0294-contrat-residuel-cognitif-signal-plane.md), [ADR 0297](../adr/0297-g-cir-generation-hypotheses-trinity.md)

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
possède un état parmi `satisfaite`, `imposée`, `ouverte` et `bloquée`. Un
compilateur général devrait maintenir l'invariant :

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
| Admission | Aucune inférence sans autorisation explicite et résidu | `llmRequired` pour le signal ; `generateHypotheses` et budget pour Trinity |
| Type | Source et contexte cohérents | Signal validé ; mission et candidats Trinity contrôlés |
| Taille | Pas de troncature silencieuse | Projection supérieure à 16 Kio bloquée |
| Visibilité | Une référence seule n'est pas un contenu lu | Données du signal incluses ; reçu limité à l'invocation |
| Omission | Chaque suppression connue est justifiée hors prompt | Registre pour doublons et métadonnées de ce chemin |
| Épistémologie | Sortie neuronale = candidat | Signal : `candidate`, `need`, `unknown` ; Trinity : hypothèses `unverified` |
| Effets | Aucun effet accordé par le texte du modèle | Aucun exécuteur d'effet dans l'adaptateur |
| Fraîcheur | Connaissance expirée exclue | Lectures du common ground filtrées |
| Transport | Les octets internes ne sont pas du langage modèle | MessagePack existant hors de cet adaptateur |

L'invariant de visibilité ne devient une garantie multi-session que lorsqu'un
registre de session, une révision de contexte et des invalidations de compaction
seront effectivement branchés. Le reçu actuel porte `session: null` et
`contextRevision: null` pour éviter de suggérer cette garantie.

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

### 6.1 Noyau cible

Le noyau proposé comprend six opérations. Leurs noms désignent une sémantique
runtime, pas des tokens spéciaux universels pour les modèles.

| Opération | Contrat attendu | Implémentation G-CIR actuelle |
| --- | --- | --- |
| `READ` | Résoudre une référence autorisée et versionnée | Hors périmètre |
| `SELECT` | Construire la vue des dépendances utiles | Champs du signal ou mission et candidats Trinity |
| `CALL` | Exécuter un outil autorisé | Existant dans GenOS, sans IR G-CIR général |
| `INFER` | Soumettre un résidu admis au modèle | Signal Plane et génération d'hypothèses Trinity |
| `CHECK` | Vérifier le candidat avec méthode et périmètre | Non branché sur ce chemin |
| `EMIT` | Publier selon permissions et reçus | Non branché sur ce chemin |

Le graphe cible déclare les dépendances et les sorties de ces opérations.
Un nœud `INFER` n'est supprimé que si un résultat réutilisable encore valide
ou une voie non neuronale autorisée satisfait la même obligation. Ce mécanisme
général de suppression n'est pas encore livré.

### 6.2 Fichiers et responsabilités

| Composant | Responsabilité actuelle |
| --- | --- |
| [`cognitiveEscalationService.js`](../../backend/src/services/cognitiveEscalationService.js) | Porte VoI et contexte minimal du signal |
| [`cognitiveResidualCompiler.js`](../../backend/src/services/cognitiveResidualCompiler.js) | Validation, rendu portable, omissions, contrat et reçu |
| [`cognitiveInferenceReceiptService.js`](../../backend/src/services/cognitiveInferenceReceiptService.js) | Reçu SQLite, octets exacts du rendu et déduplication des appels |
| [`cognitiveSignalService.js`](../../backend/src/services/cognitiveSignalService.js) | Appel au routeur et classification consultative |
| [`trinityHypothesisGenerationService.js`](../../backend/src/services/trinityHypothesisGenerationService.js) | Admission budgétaire, candidats Trinity et repli fixe |
| [`signalPlaneSubscriber.js`](../../backend/src/services/signalPlaneSubscriber.js) | Déclenchement après routage, sans crédit de succès vérifié |
| [`commonGroundService.js`](../../backend/src/services/communication/commonGroundService.js) | Connaissance partagée et exclusion des entrées expirées |
| [`modelRouter.js`](../../backend/src/services/modelRouter.js) | Sélection et invocation du backend modèle existant |

Les contrats retournés par `compileSignal` et `compileHypotheses` portent
`version`, `operation`, `source`,
`recipient`, `output` et `check`. Ce n'est pas encore un schéma d'interopérabilité
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

Le reçu actuel comprend un destinataire, la source, un hash SHA-256 du prompt
exact, le mode `materialized_in_this_invocation`, et le modèle rapporté par le
routeur. Le rendu exact et les métadonnées du reçu sont persistés dans SQLite,
avec les objets structurés encodés en MessagePack. Le reçu n'est pas signé
ni lié à un registre de session. Il ne peut
donc pas être utilisé pour déduire qu'un appel ultérieur verra encore ce contenu.
Une livraison répétée du même signal, ou une génération Trinity répétée pour
la même mission, au même destinataire, pour la même version et le même hash de
rendu, réutilise une réponse terminée. Une invocation en
cours ou échouée ne déclenche pas automatiquement une nouvelle inférence.
Le hash des octets stockés est revérifié lors de la réutilisation.

Le contrat cible étend le reçu avec la session, le backend et sa version,
la révision du contexte, les fragments réellement matérialisés, leur portée,
leur expiration et les événements d'invalidation. Un artefact seulement
accessible par outil n'est pas « déjà lu ». Une compaction, un changement de
modèle ou une reprise après crash invalide toute hypothèse de visibilité non
reconfirmée.

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

Le test [`test_cognitive_residual_compiler.js`](../../backend/tests/test_cognitive_residual_compiler.js)
couvre l'admission, le blocage avant appel, la projection de la contrainte,
le registre d'omissions, le hash du rendu, la réutilisation, la concurrence,
la corruption du reçu, les réponses typées et l'expiration
du common ground. Il appartient au profil `signalPlane`.
Le test [`test_gcir_trinity_hypothesis_generation.js`](../../backend/tests/test_gcir_trinity_hypothesis_generation.js)
couvre la projection Trinity, son reçu, la réutilisation, le repli fixe et
l'absence d'appel après échec ou dépassement de taille.

```powershell
node backend/tests/test_cognitive_residual_compiler.js
node backend/tests/test_gcir_trinity_hypothesis_generation.js
npm --prefix backend run test:signal-plane
```

Ces tests n'établissent ni un gain de coût, ni une généralisation aux modèles
réels. Le test du routeur utilise un stub pour vérifier la frontière d'appel.

### 9.2 Gates requis pour l'extension

1. Cartographier tous les points d'entrée modèle, leurs permissions et leurs
   contrats de sortie ; ne pas supposer que `cognitiveSignalService` les couvre.
2. Définir un registre d'obligations versionné et un graphe de dépendances ;
   tester la conservation des négations, unités, contraintes et provenances.
3. Ajouter un vrai registre de visibilité par invocation et session, avec
   cold start, reset, compaction, changement de modèle, expiration et reprise.
4. Lier `CHECK` et `EMIT` aux vérificateurs et gates déjà autorisés ; rejeter
   les auto-déclarations de preuve et les effets répétés après redelivery.
5. Définir des vecteurs binaires Node/Rust avant tout transport G-CIR canonique.
6. Comparer sur des jeux figés le système courant, une prose courte, un rendu
   fixe et la résidualisation complète ; mesurer erreurs, tokens, coût et
   latence p50/p95 avec intervalles d'incertitude.

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

- Les adaptateurs livrés couvrent deux points d'entrée précis ; il n'existe pas de
  compilateur universel de missions libres ni d'ISA exécutable inter-langages.
- `READ`, `CALL`, `CHECK` et `EMIT` décrivent le noyau cible ; leur simple nom
  ne donne aucune capacité, permission ou preuve au modèle.
- Le reçu de visibilité actuel atteste un rendu pour une invocation ; il ne
  prouve pas le contexte retenu dans une session ni la compréhension.
- Un modèle peut mal interpréter des champs malgré leur délimitation. La
  validation indépendante reste nécessaire avant tout effet.
- Le format textuel portable vise la compréhension de nombreux LLM ; il ne
  garantit pas qu'un modèle particulier possède la capacité de la tâche.
- Aucune compression latente, aucun fine-tuning, aucune optimisation de coûts
  mesurée et aucune migration du digest des enveloppes n'ont été livrés.

La prochaine étape est de relier les hypothèses retenues à des résultats
expérimentaux vérifiés, puis de comparer la qualité et le coût de bout en bout
avant d'élargir le déploiement. Ni le reçu d'inférence ni la sélection du
triplet ne sont des résultats de `CHECK`.
