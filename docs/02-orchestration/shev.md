# SHEV — Système d'homéorhèse étendue vérifiée

- **Statut** : première tranche opérationnelle ; architecture complète non qualifiée
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

## 3. Ce qui existe dans cette tranche

| Élément | Comportement implémenté | Limite |
| --- | --- | --- |
| Responsabilité | Rattachée à une identité de projet Ontogenèse, persistée dans SQLite. | Pas de cycle de révision de mandat. |
| Mandat | Finalité, dimensions, attentes, critères d'acceptation, permissions explicites ; version 1 immuable. | Pas de modèle complet de maturité ni de préférences qualitatives. |
| Observation | Source, date, validité, domaine, dimension, statut, résumé et références de preuve. | La source est rapportée, sans certification automatique. |
| Adaptateur de données | Contrôle local de fraîcheur d'un fichier confiné au projet, sans appel modèle. | La métadonnée du fichier ne prouve pas la qualité de son contenu. |
| Initiative | Une proposition déterministe par observation ; certaines deviennent une tâche. | Risque, opportunité et lacune restent proposés. |
| Reprise | Identifiants déterministes pour tâches et initiatives ; réveil reconstruit si nécessaire. | La reprise d'un effet externe relève encore de l'adaptateur métier. |
| Effet du projet | Observation postérieure et callback de vérification requis après une tâche `done`. | La qualité du vérificateur dépend de l'application. |
| Développement | Signal `skill_gap` rapporté au journal GVX et proposition du contrôleur GVX. | Aucun cycle GVX n'est lancé automatiquement par SHEV. |
| Progrès de l'agent | `not_tested` persiste séparément du progrès du projet. | Pas de certificat de transfert dans cette tranche. |
| Démonstrateur | Une tâche SHEV traverse l'exécution Ontogenèse, l'intégration Git, une lecture indépendante du fichier, une régression simulée et une seconde réparation. | Il s'agit d'un essai local contrôlé, pas d'une campagne longitudinale réelle. |

Le chemin principal se trouve dans
`backend/src/services/shev/`. La migration `099-shev-project-loop` ajoute les
tables `shev_responsibilities`, `shev_mandates`, `shev_observations`,
`shev_initiatives` et `shev_effects`. Le tick de l'Ontogenèse appelle le
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

Le mandat actuel ne décrit pas encore explicitement les stades de maturité,
les contraintes éliminatoires ou les préférences accompagnées d'exemples et
de contre-exemples. Une extension future devra garder ces champs versionnés
et placer leur autorité hors du candidat évalué.

## 5. Observation, incertitude et angles morts

`recordObservation(db, input)` requiert un identifiant stable fourni par
l'adaptateur de perception. Un rejeu identique retourne `replayed: true` ;
la même paire `(projectId, id)` avec un autre contenu est refusée. Le domaine
est libre, mais la dimension doit figurer dans le mandat du projet.

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
Cette tranche ne fournit pas d'API publique d'approbation des propositions.
Une application doit continuer à utiliser ses chemins de contrôle
authentifiés et les gates Ontogenèse pour toute initiative supplémentaire.

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
3. une observation postérieure `state`, `observed`, sur la même dimension ;
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
vérificateur. Le champ distinct `agent_result` vaut `not_tested` dans cette
tranche. Une correction du projet ne certifie pas un transfert de compétence.
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
n'applique pas de mutation. Un futur adaptateur de domaine devra fournir les
expériences, les reçus de vérification indépendants, l'application autorisée
et les observations de transfert sur des cas distincts.

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
hash du contenu ni un certificat de qualité du pipeline. La vérification
aval doit être fournie par un adaptateur métier distinct.

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

Pour compléter l'architecture de la proposition initiale, il reste à :

1. développer un protocole authentifié de révision de mandat et de stade,
   sans auto-abaissement des critères ;
2. fournir des adaptateurs de perception et de vérification sur au moins
   deux domaines distincts ;
3. ajouter l'approbation des initiatives de risque et d'opportunité, avec
   budget, arrêt et alternative explicites ;
4. relier une vérification post-application à la surveillance et à une
   récupération métier contrôlée ;
5. mesurer le transfert GVX hors des cas d'entraînement et créer un reçu
   de progrès de l'agent distinct du résultat du projet ;
6. calibrer les évaluations qualitatives, conserver les désaccords et
   comparer la boucle à des références longitudinales solides.

La propriété visée est une responsabilité utile et vérifiable entre deux
missions. Cette tranche rend cette responsabilité persistante et capable
de produire certaines initiatives sûres ; elle n'établit pas encore une
autonomie de bout en bout sur un projet réel.
