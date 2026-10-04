# SHEV — Système d'homéorhèse étendue vérifiée

- **Statut** : deux tranches opérationnelles ; qualification de terrain à mener
- **Portée** : responsabilité persistante, observations, initiatives, suivi des effets
- **Dernière revue** : 2026-10-04
- **Décision** : [ADR 0295](../adr/0295-responsabilite-persistante-shev.md)

## 1. Définition et frontière

SHEV relie une responsabilité durable envers un projet aux observations qui
justifient de nouvelles missions. Le projet peut rester responsable après la
clôture d'une tâche. Une initiative commence par une raison identifiable et
conserve son origine ; elle n'est pas produite par un appel périodique au modèle.

L'**homéorhèse** désigne ici une analogie de conception : préserver une trajectoire
de qualité tout en permettant son évolution. Le terme n'est ni une mesure
biologique ni la preuve que le runtime se développe seul.

| Circuit | Responsabilité |
| --- | --- |
| Homéostasie de l'agent | Réguler l'état interne et la viabilité de l'agent. |
| Continuité de mission | Respecter les invariants d'une mission bornée. |
| Ontogenèse | Conserver le projet, son backlog et le cycle d'exécution. |
| AGOW | Choisir un mode cognitif et contrôler ses propres mécanismes. |
| GVX | Proposer et évaluer une transformation de capacité. |
| Morphogenèse | Choisir une organisation adaptée à un travail autorisé. |
| SHEV | Relier mandat de qualité, perception et initiative au projet persistant. |

SHEV n'est pas un orchestrateur. La tâche produite entre dans le backlog
Ontogenèse et traverse ses contrôles d'autorisation, de budget, de preuve et
d'intégration. La présence de SHEV ne modifie pas les gates de promotion.

## 2. Modèle de contrôle

Le modèle conceptuel est :

```text
Délégation autorisée
  → mandat persistant et versionné
  → observation datée et qualifiée
  → initiative ou abstention
  → backlog Ontogenèse, ou proposition GVX
  → exécution et vérification par les circuits existants
  → observation postérieure
  → évaluation de l'effet par un adaptateur distinct
```

On peut représenter un état SHEV par
`S = (P, M_v, O, I, E, C)` : `P` est le projet Ontogenèse, `M_v` la version
du mandat, `O` les observations, `I` les initiatives, `E` les effets et `C`
le contrôle Ontogenèse. Une transition automatique n'est admissible que si
le mandat l'autorise, si l'observation correspond à sa dimension, si elle
n'est pas périmée et si le contrôle du projet reste `running`.

Cette condition est une **règle logicielle**, pas un score de qualité universel.
La priorité des tâches est une heuristique locale. Aucune moyenne de critères
ne peut compenser une violation de sécurité ou élargir une permission.

## 3. Ce qui existe dans le runtime

| Élément | Comportement implémenté | Limite |
| --- | --- | --- |
| Responsabilité | Rattachée à une identité de projet Ontogenèse, persistée dans SQLite ; révision signée par l'autorité inscrite. | Une délégation héritée sans clé ne peut pas être révisée par cet appel. |
| Mandat | Finalité, dimensions, critères immuables par version, permissions et stade signé. | Les préférences qualitatives restent liées à une grille externe. |
| Observation | Source, date, validité, domaine, dimension, statut, résumé et références de preuve. | La source est rapportée, sans certification automatique. |
| Adaptateurs | Contrôle de fraîcheur des données et contrat JSON applicatif, chacun avec relecture après tâche. | Deux sondes locales ne couvrent pas un système métier complet. |
| Initiative | Proposition déterministe ; risque et opportunité exigent approbation signée et budget borné. | Les lacunes restent un signal GVX, sans mutation automatique. |
| Reprise | Identifiants déterministes et reprise métier autorisée après régression surveillée. | Un effet externe interrompu exige une réconciliation manuelle. |
| Effet du projet | Observation postérieure et callback de vérification requis après une tâche `done`. | La qualité du vérificateur dépend de l'application. |
| Développement | Signal `skill_gap` rapporté au journal GVX et proposition du contrôleur GVX. | Aucun cycle GVX n'est lancé automatiquement par SHEV. |
| Progrès de l'agent | Reçu de transfert GVX sur contextes tenus à l'écart, distinct de l'effet projet. | L'absence de fuite de l'entraînement dépend de la provenance GVX. |
| Démonstrateur | Une tâche SHEV traverse l'exécution Ontogenèse, l'intégration Git, une lecture indépendante du fichier, une régression simulée et une seconde réparation. | Il s'agit d'un essai local contrôlé, pas d'une campagne longitudinale réelle. |

Le chemin principal se trouve dans
`backend/src/services/shev/`. La migration `101-shev-project-loop` ajoute les
tables `shev_responsibilities`, `shev_mandates`, `shev_observations`,
`shev_initiatives` et `shev_effects`. La migration `102-shev-protocols`
ajoute les autorisations, surveillances et reçus. Le tick de l'Ontogenèse appelle le
compilateur sous son claim existant avant de choisir une tâche.

## 4. Mandat et champ de développement

Une application autorisée appelle `registerResponsibility(db, input)` sur un
projet Ontogenèse existant. L'appel exige `projectId`, `authorityRef` et un
mandat. `authorityRef` est une référence de provenance ; ce service interne
n'authentifie pas l'utilisateur. L'application qui l'expose doit contrôler
l'identité et la délégation avant l'appel.

```js
const mandate = {
  purpose: 'Maintenir un parcours de réservation compréhensible',
  dimensions: [{
    name: 'parcours',
    expected: 'Un nouveau client termine la réservation',
    acceptance: ['Le parcours est testé avec un cas novice documenté.']
  }],
  autoDiagnose: true,
  autoInstrument: false
};
```

Les dimensions sont nommées, uniques et dotées d'une attente et d'au moins
un critère d'acceptation. Les deux permissions automatiques sont obligatoires
et booléennes. Un second `registerResponsibility` sur le même projet échoue.
Une autre version ne peut pas être substituée par l'agent ou un worker.

Le stade est désormais versionné et signé (section 13). Les contraintes
éliminatoires propres à un domaine et les exemples de préférence restent
à fournir par les applications et leurs grilles d'évaluation.

## 5. Observation, incertitude et angles morts

`recordObservation(db, input)` requiert un identifiant stable fourni par
l'adaptateur de perception. Un rejeu identique retourne `replayed: true` ;
la même paire `(projectId, id)` avec un autre contenu est refusée. Le domaine
est libre, mais la dimension doit figurer dans le mandat du projet.
L'identifiant est limité à 128 caractères alphanumériques ou `._:-` ; le
résumé, la source et les références de preuve sont bornés en taille. Cela
empêche un identifiant externe d'injecter un texte d'instruction dans le
titre de la tâche Ontogenèse.

| Champ | Sens |
| --- | --- |
| `kind` | `state`, `degradation`, `risk`, `opportunity`, `capability_gap`, `blind_spot`. |
| `epistemicStatus` | `observed`, `unknown`, `stale`, `invalid`, `inconclusive`. |
| `source` | Capteur, essai ou témoignage qui rapporte le fait. |
| `observedAt`, `validUntil` | Instant du constat et expiration éventuelle. |
| `summary` | Description à traiter comme donnée non fiable. |
| `evidenceRefs` | Références d'artefacts, non certificats de vérité. |

`observed` exige au moins une référence de preuve. Ce statut signifie que
la source a fourni un résultat ; il ne démontre pas son exactitude.
`unknown` signifie que la dimension n'est pas mesurée. `stale` concerne une
preuve périmée ; le compilateur traite aussi comme périmée une date
`validUntil` dépassée, sans réécrire le constat historique. `invalid` et
`inconclusive` restent visibles sans autoriser un diagnostic automatique.

Une observation `state` décrit un état observé après une intervention. Elle
n'engendre pas d'initiative : elle sert notamment à comparer un avant et un
après. L'absence d'observation n'est jamais convertie en état vert.

### Exemple : dégradation

```js
{
  id: 'probe-2026-10-04-17', projectId: 'projet-a', domain: 'application',
  dimension: 'parcours', kind: 'degradation', epistemicStatus: 'observed',
  source: 'sonde-reservation', observedAt: '2026-10-04T10:00:00Z',
  validUntil: '2026-10-05T10:00:00Z', summary: 'Le paiement échoue au retour',
  evidenceRefs: ['artefact:execution-17']
}
```

L'artefact cité doit être lisible et évalué par l'application. SHEV conserve
sa référence ; il ne lit pas ce contenu lors de la compilation.

### Exemple : angle mort

Une application peut enregistrer `kind: 'blind_spot'` et
`epistemicStatus: 'unknown'` lorsque l'abandon d'un parcours n'est pas mesuré.
Si `autoInstrument` est autorisé, une tâche d'instrumentation est créée.
Le système ne déduit pas que le parcours fonctionne correctement.

## 6. Compilation des initiatives

Le compilateur `compilePending(db, { projectId, nowMs })` examine les
observations nouvelles pendant le tick Ontogenèse. Il n'appelle aucun LLM.
Il ne crée rien si le projet n'a pas de responsabilité active ou si le
contrôle Ontogenèse n'est pas `running`.

| Constat courant | Initiative | Dispatch automatique |
| --- | --- | --- |
| Dégradation `observed` | `diagnose` | Oui, si `autoDiagnose`. |
| Angle mort `unknown` | `instrument` | Oui, si `autoInstrument`. |
| Risque `observed` | `investigate` | Non, proposition. |
| Opportunité `observed` | `experiment` | Non, proposition. |
| Lacune `observed` | `learn` | Non, proposition ; pont GVX explicite. |
| Preuve périmée | Type selon le constat | Non, motif `preuve-perimee`. |
| Autre statut insuffisant | Type selon le constat | Non, motif `preuve-insuffisante`. |

La tâche produite porte une priorité locale, la dimension du mandat et les
critères d'acceptation. Le résumé brut de l'observation n'est pas injecté
dans le titre du backlog. Le worker est invité à consulter les références
comme **données non fiables**. Il ne peut pas utiliser un texte observé pour
modifier le mandat, les permissions ou les critères de réussite.

Les propositions non dispatchées sont conservées pour une décision future.
Les risques et opportunités peuvent être approuvés par le service signé de
la section 15. L'application doit toujours protéger l'accès à ce service et
aux gates Ontogenèse ; la signature ne remplace pas son contrôle d'accès.

## 7. Transaction, reprise et quiescence

SHEV ne lance aucun processus autonome. Le déclencheur est un tick existant,
qui prend le claim Ontogenèse. Le compilateur parcourt au plus vingt
observations nouvelles par tick. Les identifiants de l'initiative et de la
tâche sont dérivés du projet et de l'observation. Les insertions de tâche
utilisent `INSERT OR IGNORE`, puis mettent l'initiative en état `queued`.

Si le processus s'arrête après l'insertion de tâche et avant la mise à jour
de l'initiative, `reconcileQueued` retrouve cette tâche au tick suivant.
S'il s'arrête après l'initiative et avant la tâche, le tick reprend cette
initiative automatique si l'observation reste actuelle et autorisée.
Si le projet est `IDLE` avec une tâche SHEV encore ouverte, `ensureWake`
crée un événement de réveil. Le tick consomme cet événement et repasse
par la planification normale. Une pause ou un arrêt opérateur empêche la
compilation ; le projet ne se réveille pas pour contourner cette décision.

Ces garanties portent sur les écritures SQLite et sur le backlog. Elles ne
constituent pas un protocole général « exactement une fois » pour les
déploiements, messages ou systèmes physiques. Un adaptateur qui produit un
effet externe doit déclarer comment relire l'état réel et réconcilier un
résultat inconnu avant de réessayer. L'Ontogenèse fournit déjà une reprise
spécifique à l'intégration Git ; SHEV ne la remplace pas.

Quand aucune observation nouvelle n'existe et qu'aucune tâche ne réclame un
réveil, SHEV ne produit ni tâche ni appel modèle. La responsabilité et les
conditions de reprise restent persistées.

## 8. Vérifier le bénéfice du projet

Une tâche `done` signifie que l'intégration Ontogenèse s'est terminée. Elle
ne prouve pas que la dimension du projet s'est améliorée. La fonction
`recordProjectEffect(db, input)` exige :

1. une initiative effectivement `queued` ;
2. sa tâche Ontogenèse en état `done` ;
3. une observation postérieure `state` ou `degradation`, `observed`, sur la même dimension ;
4. un adaptateur `verify` qui examine l'avant, l'après et les critères du mandat ;
5. un résultat `confirmed`, `regressed` ou `inconclusive`, avec identifiant de
   vérificateur et références de preuve.

L'évaluation est rejouable par identifiant d'initiative. Le code ne déclare
pas l'indépendance du callback à la place de l'application : le propriétaire
du domaine doit fournir un vérificateur qui n'est pas contrôlé par le
candidat et documenter son protocole. Une opinion esthétique reste un
jugement préférentiel avec son public et ses désaccords, même si un reçu
atteste l'identité de l'évaluateur.

Le champ `project_result` mesure seulement l'effet local déclaré par ce
vérificateur. Le champ `agent_result` de ce reçu reste `not_tested` : le
transfert dispose maintenant d'un reçu séparé (section 17). Une correction
du projet ne certifie pas un transfert de compétence.
Un exercice GVX ne certifie pas non plus une amélioration du projet réel.

## 9. Pont vers GVX

`requestDevelopment(db, input)` accepte une observation actuelle
`capability_gap`, déjà compilée en initiative `learn`. L'appel exige un
`organizationId`, un `projectId` cohérent et l'`entityId` de l'agent cible.
Il écrit un événement de provenance `developmental_signal` dans le journal
GVX, puis demande une décision à `gvxDevelopmentController.processSignal`.
L'identifiant du signal est stable ; un rejeu n'ajoute pas une seconde cause.

Le signal a le statut `reported` et l'action GVX conserve
`promotionAllowed: false`. Le contrôleur peut proposer de planifier une
expérience. SHEV ne lance pas `runCycle`, ne crédite pas la plasticité et
n'applique pas de mutation. Le reçu de transfert de la section 17 consomme
des fenêtres GVX vérifiées ; la conduite d'expériences et l'application de
mutations restent du ressort du cycle GVX et de ses gates.

## 10. Adaptateurs de domaine

Le noyau de cette tranche accepte des observations sans connaître le web.
Un adaptateur responsable doit définir quatre contrats concrets :

| Contrat | Question vérifiable |
| --- | --- |
| Perception | Quelle situation réelle est mesurée, par quel capteur, à quelle date ? |
| Action | Quelle opération est permise, avec quel budget et quelle portée ? |
| Vérification | Quelles preuves établissent ou réfutent l'amélioration ? |
| Reprise | Comment distinguer un effet déjà appliqué d'une tentative à refaire ? |

L'adaptateur exécutable `inspectDataFreshness` couvre un premier cas de
pipeline de données local. Il lit les métadonnées d'un fichier régulier
dans le répertoire du projet, refuse les chemins traversants, les liens
symboliques et les chemins sensibles de la politique d'intégration, puis
compare sa date de modification à un seuil positif fourni par l'application.
Il produit `degradation` si le fichier est trop ancien, `state` s'il est
assez récent et `blind_spot` avec statut `unknown` s'il manque. Son identifiant
dépend du projet, du chemin, du seuil et de l'état du fichier : des ticks
répétés sur un état inchangé ne créent pas de nouvelle tâche. La référence
`file-metadata:sha256:…` lie les métadonnées observées ; elle n'est pas un
hash du contenu ni un certificat de qualité du pipeline. La relecture après
tâche est fournie par `verifyDataFreshness` ; les invariants métier du pipeline
restent à vérifier séparément.

Pour une application, la perception pourrait être un parcours réellement
exécuté et la vérification une comparaison de résultats et de rendus. Pour
un pipeline de données plus riche, elle devra aussi couvrir distributions,
schémas, fraîcheur de la sortie et invariants aval. Ces contrats restent à
développer ; le contrôle de fraîcheur actuel ne prouve pas qu'un pipeline
complet fonctionne correctement.

Une source externe, une page, un document ou une sortie d'outil ne reçoit
jamais l'autorité du mandat par sa seule présence dans une observation.
L'adaptateur doit contraindre ses chemins et vérifier les artefacts selon
les politiques de sécurité du domaine.

## 11. Cas de refus et défaillances

| Situation | Réponse actuelle |
| --- | --- |
| Projet absent | Refus d'enregistrer une responsabilité. |
| Dimension inconnue | Refus de l'observation. |
| Même identifiant, contenu changé | Conflit d'idempotence. |
| Observation sans preuve rapportée | Refus du statut `observed`. |
| Preuve périmée | Initiative proposée sans tâche automatique. |
| Contrôle `paused` ou `stopped` | Aucune compilation ni tâche nouvelle. |
| Tâche non terminée | Aucun effet de projet enregistré. |
| Après absent ou incomparable | Aucun effet de projet enregistré. |
| Vérificateur sans preuve | Aucun effet de projet enregistré. |
| Lacune sans scope GVX cohérent | Refus de la demande développementale. |

Les tests couvrent ces contrats dans
`backend/tests/test_shev_project_loop.js` et réexécutent la suite
Ontogenèse avec la nouvelle migration. Le cas non web est exercé dans
`backend/tests/test_shev_data_freshness.js`. Le scénario
`backend/tests/test_shev_runtime_demo.js` exerce un projet Git temporaire :
constat d'échec, création de tâche, candidat vérifié, intégration, constat
postérieur, régression externe simulée et réparation par une nouvelle tâche.
Il lit le fichier intégré pour évaluer l'effet sans se fier au rapport du
worker. Les résultats d'un test local
n'établissent ni la qualité d'un vrai capteur ni l'indépendance réelle
d'un évaluateur de domaine.

## 12. Qualification et étapes suivantes

La première tranche se reproduit avec :

```bash
node backend/tests/test_shev_project_loop.js
node backend/tests/test_shev_data_freshness.js
node backend/tests/test_shev_runtime_demo.js
npm --prefix backend run test:ontogenesis
npm test
```

Une qualification d'autonomie devra suivre une campagne plus forte : même
modèle, mêmes outils, permissions et budgets pour un agent généraliste,
une boucle d'audit planifiée, GenOS sans SHEV et GenOS avec SHEV. Les
perturbations devront être inconnues du décideur : preuve expirée,
régression après application, capteur défaillant, faux positif esthétique,
instruction malveillante dans une source et interruption après effet externe.
Les mesures pertinentes sont les problèmes manqués, initiatives inutiles,
régressions, coûts complets, temps de récupération et interventions humaines.

La tranche suivante met en oeuvre ces six prolongements, détaillés ci-dessous.
La qualification sur des projets réels reste distincte de leur présence dans
le runtime.

## 13. Révision authentifiée du mandat et du stade

La délégation initiale peut enregistrer une clé publique Ed25519 avec
`registerResponsibility({ authorityPublicKey })`. Les anciennes délégations
sans clé continuent à fonctionner, mais aucune révision ni approbation signée
ne peut leur être ajoutée en inventant une autorité. Le propriétaire doit
établir une nouvelle délégation par une voie administrative vérifiée.

`reviseResponsibility` exige la version courante, le nouveau mandat, le stade
`observing`, `assisted` ou `delegated`, et une signature de l'autorité inscrite.
Le message signé est l'objet canonique produit par `authorizationPayload` :
opération, projet, sujet, version attendue, détails, nonce et expiration.
Le nonce est consommé une fois et la version est avancée par comparaison
atomique. Chaque version du mandat demeure immuable dans `shev_mandates`.
La révision conserve toutes les dimensions existantes, leurs attentes exactes
et tous leurs critères d'acceptation. Elle peut ajouter des critères et des
dimensions. Un changement d'attente ou un retrait n'est pas traité comme une
simple progression de stade et est refusé. Aucune observation ni initiative
ne peut signer sa propre extension de mandat.
Une tâche SHEV mise en file sous une ancienne version est bloquée au dispatch
après révision ; il faut constater à nouveau le besoin sous le mandat courant.

Le stade `observing` interdit l'approbation d'initiatives de risque et
d'opportunité. Les stades supérieurs sont également signés ; ils ne sont pas
inférés d'un succès de tâche ou d'une estimation d'agent. Les permissions
automatiques de diagnostic et d'instrumentation restent des champs du mandat.

## 14. Deux domaines observés et vérifiés

Le domaine `data-pipeline` garde l'adaptateur de fraîcheur : fichier régulier,
chemin contenu dans le projet, pas de lien symbolique ni de chemin sensible,
seuil temporel explicite. `verifyDataFreshness` relit le fichier après la
tâche, inscrit l'observation et transmet un verdict à `recordProjectEffect`.

Le domaine distinct `application-contract` ajoute `inspectJsonContract` et
`verifyJsonContract`. L'application fournit un chemin JSON confiné, un pointeur
et le SHA-256 de la valeur attendue. L'adaptateur borne le fichier à 1 Mio,
ne publie ni la valeur lue ni la valeur attendue, et lie sa preuve au hash du
fichier. Un document absent est `unknown`; un JSON illisible ou une valeur
différente est une dégradation observée. Après la tâche, la vérification
relit le contrat. Ces adaptateurs sont des sondes locales déterministes : leur
indépendance organisationnelle dépend de la propriété des fichiers et de la
chaîne de collecte, que le dépôt ne peut pas établir seul.

## 15. Risques, opportunités et enveloppe d'exécution

Les observations `risk` et `opportunity` restent `proposed` après compilation.
`approveInitiative` exige une observation actuelle, un mandat de même
version, un stade au moins `assisted`, et une signature Ed25519 liée à
l'initiative. L'approbation contient des limites de jetons, dollars, durée,
tentatives et échéance ; un arrêt `on-failed-check` ou `on-regression` ; et une
alternative métier explicite. Un rejeu du nonce échoue.

La tâche n'entre dans le backlog qu'après cette approbation. Au dispatch,
`initiativeEnvelope` refuse une approbation absente, expirée ou dont les
tentatives sont épuisées. `clampBudget` borne les trois budgets transmis au
worker à la valeur la plus stricte entre le projet et l'initiative. La
condition d'arrêt et l'alternative sont conservées dans le reçu d'approbation.
Les opérations externes doivent encore respecter leurs propres baux et
contrôles d'annulation ; la borne du dispatch ne prétend pas annuler une
action déjà exécutée hors de GenOS.

## 16. Surveillance et récupération métier

Chaque effet projet inscrit par `recordProjectEffect` crée une surveillance
persistante, par défaut quotidienne. `dueWatches` expose les contrôles dus.
`monitorProjectEffect` exige une observation ultérieure comparable et un
vérificateur avec preuve ; il ajoute un reçu immuable. Une régression place
la surveillance en alerte. Une reprise ne se déclenche pas directement à
partir du verdict : `proposeRecovery` fixe l'action métier, le budget,
l'échéance, l'arrêt et l'alternative ; `approveRecovery` exige la signature
de l'autorité ; `executeRecovery` remet le plan à un adaptateur externe.

La reprise passe à `executing` avant l'appel externe. Un crash dans cet état
demande une réconciliation humaine avec le système métier : le runtime ne
réessaie pas aveuglément une opération à effets externes. Un reçu valide
atteste une référence d'effet externe, des preuves et des coûts sous les
limites approuvées. Une erreur, un dépassement ou un reçu incomplet produit
`halted`. Le retour à la surveillance active après `applied` n'est pas une
preuve que la qualité métier est rétablie : une nouvelle observation doit
encore le démontrer.

## 17. Transfert GVX et reçu propre à l'agent

`recordAgentProgress` lit un événement GVX `transfer_recorded` dans sa portée
organisation/projet/agent, avec vérification de la chaîne du journal. Le
transfert doit avoir atteint `monitored` ou `consolidated`, disposer d'au
moins deux fenêtres de surveillance vérifiées, et utiliser des contextes
SHA-256 distincts du contexte source et des contextes d'essai connus. Un
vérificateur fournit pour chaque contexte tenu à l'écart le score de base,
le score candidat, le sens attendu, le statut de régression et une preuve.
Le reçu SHEV mesure le nombre de cas, les améliorations, les régressions et
le taux de réussite ; il conclut `confirmed`, `regressed` ou `inconclusive`.

Ce reçu est stocké dans `shev_agent_progress`, séparément de `shev_effects`.
Un effet projet confirmé ne devient donc jamais une compétence certifiée par
copie de statut. Le caractère réellement inédit d'un contexte dépend de la
provenance de l'ensemble d'entraînement et du vérificateur GVX ; des hashes
distincts ne suffisent pas à prouver l'absence de fuite de données.

## 18. Jugements qualitatifs et comparaison longitudinale

`calibrateEvaluator` exige au moins trois cas de référence avec scores et
preuves, validés par un vérificateur distinct de l'évaluateur. L'erreur
absolue moyenne et les références sont conservées. Chaque jugement porte
une version de grille, un public, une justification et des preuves.
`qualitativeDisagreement` rend les jugements individuels, le nombre
d'évaluateurs calibrés et l'étendue de leurs notes. Moins de deux évaluateurs
calibrés ou une étendue d'au moins deux points sur cinq laisse le résultat
`disputed`. Le désaccord n'est ni moyenné ni effacé pour fabriquer un succès.

`recordLongitudinalComparison` impose un protocole préenregistré avant les
reçus traités, quatre fenêtres appariées au minimum, les reçus de surveillance
SHEV correspondants et deux séries de référence validées par un vérificateur
distinct avec leurs preuves. Il compare les
régressions, le temps de récupération et le coût par unité d'exposition.
Les facteurs de confusion déclarés restent dans le protocole et le résultat
porte explicitement `causalClaim: false`. L'outil produit une comparaison
traçable ; il ne remplace pas une campagne indépendante sur des projets
réels, avec répartition, instrumentation et contrôle des différences de
charge entre groupes.

La tranche se vérifie avec `npm --prefix backend run test:shev`. Les tests
emploient des projets temporaires et des références synthétiques pour éprouver
les portes du runtime ; ils ne démontrent pas un gain longitudinal réel.
