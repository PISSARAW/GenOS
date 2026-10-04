# Relational Physiology Engine — RPE V1

**Statut : noyau intégré et raccord ciblé au routage ; intégration générale à effectuer.**
**Date : 4 octobre 2026.**
**Base auditée : `PISSARAW/GenOS@bcc7a31ea5dcfafcf3357d33993407f30a694570` (v3).**

## 1. Définition

Le RPE transforme des relations en **restrictions comportementales exécutables**.
Il ne crée ni nouveau chef, ni agent bavard, ni base de vérité concurrente.

`RPE(snapshot, action, autorisation existante) → décision + plan réduit + reçu`

Sa place est transversale : l'Ontogenèse conserve le projet ; l'orchestrateur
conduit la mission ; la morphogenèse organise les collectifs ; le daemon observe
son territoire ; le worker intervient. Le RPE limite certaines interactions entre
ces entités. La morphogenèse est un système de contrôle, pas nécessairement un
agent situé dans un étage hiérarchique distinct.

## 2. Règle de composition

Les relations ne s'ajoutent jamais comme des privilèges.

`capacités_effectives = capacités_runtime ∩ bail ∩ plafond_parent ∩ restrictions_RPE`

Une contrainte dure n'est pas compensée par un score social positif. Un ami qui
est aussi un vérificateur aveugle ne reçoit pas les conclusions cachées. Un
manager sans bail ne dispatche pas. Un mentor ne promeut pas la sortie de son élève
au nom d'une proximité relationnelle. L'indisponibilité d'une donnée obligatoire
entraîne un refus ou un état inconnu, pas un score rassurant par défaut.

Les entrées `context` et `authorization` sont des objets internes du plan de
contrôle de confiance. Elles ne doivent JAMAIS être acceptées telles quelles
comme arguments d'un worker, d'un prompt ou d'une requête non authentifiée.
`validated: true` signifie « reçu déjà vérifié par un adaptateur de confiance » ;
le moteur n'effectue pas cette vérification cryptographique lui-même.

## 3. Modules effectivement livrés

| Module | Effet exécuté | Limite |
|---|---|---|
| `catalog.js` | 29 types de relations, familles de rôles et de contrôles | Pas un nouveau registre d'agents |
| `validate.js` | Identités, scopes, versions, temps, bornes | Pas une authentification |
| `graph.js` | Composantes de filiation transitives | Regroupement conservateur, pas génétique mesurée |
| `authority.js` | Intersections, observateurs non écrivains, délégation plafonnée, tutelle admise | Réservations atomiques laissées au runtime |
| `communication.js` | Liste positive de références, aveuglement, déduplication, événements de contrôle | Le matérialisateur vérifie contenu, hash et ACL |
| `epistemics.js` | Cohortes de provenance, inconnu explicite, exclusion de l'auto-vérification | Pas d'indépendance statistique démontrée |
| `lifecycle.js` | Transitions pures et contrôle de version | Pas de persistance automatique |
| `learning.js` | Estimation consultative par domaine sur observations validées | Ne modifie aucun droit ni gate de preuve |
| `canonical.js` | Préimage typée bornée pour hash déterministe | Pas un codec de transport standard |
| `index.js` | Décision scellée, hash et rejeu | Le hash n'est pas une signature |
| `runtimeBoundary.js` | Refus effectif avant exécuteur ; contenu filtré effectivement transmis | Exige des ports d'hôte fiables |
| `legacyAudienceGate.js` | Lecture SQL scopée et exclusion de parenté indirecte | Raccord étroit, pas certification des survivants |

Le noyau n'ajoute aucune dépendance npm, aucune requête réseau, aucun timer,
aucun prompt et aucune nouvelle sérialisation JSON. Il manipule des structures
JavaScript typées par validation et des références ; le raccord lit SQLite.
La documentation reste en Markdown pour respecter l'organisation du dépôt.

## 4. Contrat d'entrée

### Snapshot

`context.scope` identifie exactement l'organisation et le projet. `revision`
identifie la version relationnelle ; `asOf` et `validUntil` bornent sa validité.
Une action qui présente une autre version est refusée et doit être replanifiée.

`agents` contient les identifiants, rôles runtime et états réellement résolus.
`relations` contient des arêtes `{id, sourceId, targetId, type, state, scope,
validFrom, validUntil}`. `origins` contient la provenance attestée spécifique à
la conclusion examinée ; `groundings` contient des accusés de références précis.

Limites V1 : 256 agents, 2 048 relations, 1 024 origines, 4 096 accusés, 256
références par message et 64 vérificateurs. Dépassement = erreur explicite.
L'arbre de hash est également borné en profondeur, nombre de valeurs et octets.
Ces plafonds sont des choix de protection, pas des optimums scientifiques.

### Demande

Champs communs : `kind`, `operationId`, `scope`, `actorId`, `at`,
`expectedRevision`. Types : `action`, `delegate`, `communicate`, `verify`.

Le temps d'exécution réel doit venir de `ports.now()`, pas d'un worker.
Les budgets emploient des entiers : tokens, millisecondes et micro-dollars.
Les ressources sont des identifiants exacts déjà validés, pas des chemins/globs
interprétés par le RPE.

### Autorisation

L'autorisation est issue des contrôles existants et liée à l'acteur, l'opération,
la demande complète et une expiration. Elle porte les plafonds applicables et,
selon le cas, les références lisibles, destinataires, exigences d'accusé,
réservations disponibles et reçus d'approbation.

L'appel direct de `evaluate` n'autorise aucun outil. Le résultat `permitted`
signifie « aucune restriction RPE supplémentaire n'interdit cette demande dans
le snapshot fourni, sous l'autorisation existante », pas « résultat correct ».

## 5. Sémantique des 29 relations

| Relations | Sens utile | Effet V1 / extension |
|---|---|---|
| `parent`, `child`, `ancestor`, `descendant` | Dérivation orientée | Regroupement de dépendance transitive ; pas d'héritage de droits |
| `sibling`, `twin` | Origine partagée | Ne constituent pas plusieurs groupes de provenance indépendants |
| `chimera`, `plasmid`, `graft` | Fusion ou transfert | Dépendance potentielle conservée ; pas de validation du contenu transféré |
| `manager`, `subordinate` | Organisation | Ne confèrent aucun droit ; contrats runtime inchangés |
| `colleague`, `coworker`, `collaborator` | Travail commun | Pas d'accord ni de confiance inventés ; optimisation future sur observations |
| `mentor` | Transmission de méthode | Aucun pouvoir de promotion implicite ; canal pédagogique futur |
| `client`, `supplier` | Handoff contractuel | Exigence minimale d'accusé d'action ; contrat d'acceptation reste externe |
| `partner`, `friend`, `bonded_partner` | Proximité durable | Aucun privilège ni terrain commun déduit de l'étiquette |
| `stranger`, `neighbor` | Connaissance limitée | Aucune indépendance déduite de l'absence d'histoire |
| `rival`, `adversary` | Contradiction | Canal aveugle aux conclusions par défaut ; pas de sabotage autorisé |
| `temporary_ally` | Coopération bornée | Intervalle et transitions ; expiration durable à raccorder |
| `guardian`, `dependent` | Tutelle | Signature seulement lorsque le plan d'autorité exige la tutelle |
| `verifier` | Vérification aveugle | Masquage des conclusions ; preuve/provenance restent nécessaires |
| `reviewer` | Relecture | Accusé requis ; aveuglement activable par la politique de tâche |

Plusieurs relations peuvent coexister. Aucun « lien principal » choisi sur la
familiarité ne doit effacer une restriction plus sévère. Toutes les relations
n'ont pas encore une physiologie spécialisée : les types sociaux sont surtout
soumis aux invariants communs dans cette V1, sans comportement émotionnel simulé.

## 6. Indépendance : ce qui est calculé et ce qui ne l'est pas

Le moteur distingue : **dépendance connue/déclarée**, **provenance inconnue** et
**provenances séparées dans les données disponibles**. Il n'utilise pas les
presets numériques de `stranger`, `twin` ou `verifier` comme mesures.

Une origine doit être attestée, actuelle, aveuglée et liée au même `claimHash`.
Le moteur considère comme facteurs conservateurs de dépendance : une filiation
commune, une même famille de modèle, des racines de mémoire ou de preuve partagées.
Les candidats reliés sont regroupés ; le quorum porte sur les groupes, pas sur
le nombre de processus.

La fermeture transitive peut sur-regrouper. Deux exécutions d'un même modèle ne
sont pas automatiquement statistiquement dépendantes dans toutes leurs erreurs ;
la V1 choisit délibérément de ne pas les comptabiliser comme plusieurs origines
fortement séparées. Ce choix doit être comparé à des mesures de covariance réelles.

Des familles de modèles différentes ne suffisent pas non plus à démontrer une
indépendance statistique. Une demande explicite de cette garantie est refusée
avec `STATISTICAL_INDEPENDENCE_NOT_ESTABLISHED`.

La politique dépend du type de preuve : une preuve formelle vérifiée par un noyau
ne doit pas être remplacée par un vote de modèles. Le gate formel de GenOS reste
l'autorité appropriée ; le RPE ne transforme jamais un consensus en théorème.

La révocation d'une relation termine son activité, pas son histoire causale.
Les lignées révoquées ou expirées demeurent conservatrices pour la vérification.
Une réfutation d'origine doit être traitée et attestée par le collecteur canonique,
pas simulée en effaçant simplement une arête du snapshot.

## 7. Communication sans bavardage

Le moteur émet des identifiants/hashs de références, pas de nouvelles conversations.
Une référence est supprimée uniquement si un accusé validé porte sur exactement
la même version et le même destinataire. Une forte familiarité ne suffit pas.

Un canal aveugle n'autorise que `problem` et `evidence`. Les conclusions et plans
sont supprimés du plan transmis à l'exécuteur, pas seulement marqués dans un log.
Cela ne garantit pas l'absence de fuite dans une preuve mal classifiée, un fichier
partagé ou une mémoire commune : le matérialisateur et la provenance doivent
contrôler ces canaux latéraux.

`stop`, `pause`, `revoke`, `lease_expired`, `failure` et `blocked` échappent à la
suppression pour redondance et demandent au minimum un accusé d'action. Le contrôle
d'accès demeure requis. Un worker non autorisé ne peut pas arrêter un autre agent
en nommant simplement son événement `stop`.

## 8. Frontière d'exécution et concurrence

`runGuarded(request, ports)` exige six ports :

| Port | Responsabilité de l'hôte |
|---|---|
| `withBoundary` | Sérialiser révocation/admission, fencing, idempotence et réservation atomique |
| `loadContext` | Snapshot complet pour le périmètre, état réel et provenance validée |
| `authorize` | Contrats, baux, ACL, budgets, approbations, hash de demande |
| `recordDecision` | Journal canonique durable ; erreur bloquante |
| `execute` | N'exécuter que le plan réduit ; appliquer les gates métier restants |
| `now` | Horloge du plan de contrôle |

L'ordre est : frontière → snapshot → autorisation → évaluation → reçu → dispatch.
Un refus ne parvient pas à l'exécuteur. Une erreur d'audit ne devient pas un succès.

La réservation et le traitement de la reprise ne sont pas implémentés par cette
fonction. Il n'y a aucune promesse d'« exactly once » pour un outil externe. Une
opération déjà engagée peut nécessiter annulation ou compensation même après
révocation. Ne pas confondre le verrou de test simulé avec un verrou distribué.

## 9. Raccord GenOS fourni

Le patch appelle `excludeKnownDependentAudience` depuis la fonction réelle
`relationshipCommunicationRoutingService.profileAudience` après le filtrage
existant. Une requête demandant l'indépendance charge les arêtes de son scope et
exclut les candidats reliés au sender par une filiation, même indirecte.

Lecture sur `agent_relations` avec `organization_id IS ? AND project_id IS ?`,
tri sur `id` et limite +1 afin de détecter un chargement incomplet. Aucune
hypothèse sur la présence de `created_at`. Les échanges ordinaires n'ajoutent
aucune requête. Erreur de DB ou dépassement = refus explicite du chemin concerné.

Ce raccord ne constitue pas le pare-feu intégral : il ne filtre pas lui-même les
contenus, ne valide pas les origines des candidats restants et n'est pas une
transaction de révocation. Les fonctions générales ci-dessus doivent être
raccordées aux points d'exécution pour ces garanties supplémentaires.

## 10. Développement relationnel proposé

Ne pas ajouter un « chef du graphe ». Les données restent fédérées : registre des
relations, contrats/baux, morphologie, communications/accusés et provenance gardent
leurs propriétaires. Un snapshot identifie leurs versions et bloque si une vue
requise est absente, incomplète ou périmée.

Les futurs événements relationnels devraient distinguer existence d'un lien,
histoire de dépendance, état opérationnel et exposition d'information. Une relation
suspendue n'efface pas ce qu'un agent a déjà appris.

La plasticité doit être alimentée par des résultats externes vérifiés, par domaine,
avec nombres d'observations, incertitude et provenance. L'estimateur beta-binomial
V1 ne fait que résumer ces observations. Il ne constitue ni un score calibré de
fiabilité future ni un mécanisme automatique de modification des relations.

## 11. Raccordements restant à réaliser

| Composant | Point de contrôle proposé | Condition avant activation |
|---|---|---|
| Ontogenèse | Admission d'une mission ; intégration ; pause/révocation | Claim/fencing, budget atomique et reçus existants |
| Orchestrator | Affectation et délégation | Identité et contrat réellement résolus |
| Daemon | Handoff et RepairEpisode séparé | Aucune mutation depuis le résident observateur |
| Trinity | Sélection des branches/jurés et barrière de preuve | Origines, isolation et politique de preuve |
| A-Team | Handoffs et sous-délégation | Contrats d'entrée/sortie et plafonds |
| Biocénose | Formation du jury et décompte | Cohortes de provenance + calibration existante |
| Biome | Allocation et coopération | Coût réel, utilité observée ; aucune confiance égale à vérité |
| Holobionte | Admission/sortie des symbiontes | Contrat hôte et décontamination/état |
| Syncytium | Admission à l'état partagé ; vérification externe | Traçage des expositions, contexte partagé non indépendant |
| Rhizome | Propagation et références stigmergiques | Sources distinctes, anti-amplification et TTL |
| Métapopulation | Migration et échange de capacités | Préserver la généalogie et les contaminations traversant les niches |
| AGOW / GVX | Priorité d'attention et mémoire sociale | Avis consultatif ; pas de nouveau chemin de privilèges |

Aucun de ces raccordements n'est revendiqué comme effectué par la seule présence
du noyau. Le patch de communication est l'unique modification ciblée d'un fichier
existant dans cette livraison.

## 12. Validation et critères de recherche

Les tests locaux démontrent des invariants sur des cas contrôlés. L'essai SQLite
emploie un sous-schéma réel et la fonction de routage patchée, mais simule le
résolveur de profils et ne lance pas le backend complet.

La suite dédiée se lance depuis la racine avec
`node backend/tests/run_validation_suite.js relationalPhysiology` ; elle fait aussi
partie du profil `all` de la suite de validation backend.

Pour une évaluation de GenOS : même modèle, mêmes tâches, outils, budgets et seeds ;
comparer sans RPE, RPE complet, sans filiation, sans aveuglement, sans terrain
commun et sans adaptation. Mesurer correction vérifiée, faux accords, refus
justifiés/injustifiés, contamination, messages, tokens totaux, latence, coût du
RPE, ressources réservées et échecs de reprise.

Un test décisif consiste à injecter plusieurs copies d'une même solution : leur
multiplication ne doit pas gonfler le niveau de preuve. Un autre consiste à garder
les compétences constantes mais à changer les liens/expositions : seuls les
comportements justifiés doivent changer. Le demo livré illustre cette seconde
ablation au niveau du moteur, pas au niveau d'une mission LLM.

Exiger des gains mesurés avant toute qualification « supérieur », « inédit » ou
« scientifiquement démontré ». Aucun benchmark comparatif externe n'est fourni.
