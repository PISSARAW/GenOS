# A-Team : Orchestration Multidisciplinaire d'Agents Autonomes

## 1. Définition

La A-Team dans GenOS est le mécanisme de composition, d'activation et de coordination d'une équipe multidisciplinaire d'agents autonomes, chacun spécialisé dans un domaine de compétence distinct et borné. Contrairement à l'orchestration générale qui fragmente une mission en phases et en gates, l'A-Team fragmente une mission en *domaines d'expertise* et assigne un agent à chacun.

L'A-Team n'est pas une simple distribution de tâches : c'est une allocation de responsabilité avec preuves d'intégration. Chaque membre doit :

- posséder une hypothèse claire sur son domaine ;
- retourner des preuves et des contraintes d'intégration ;
- reconnaître ses limites de domaine ;
- valider l'interopérabilité avec les autres branches.

Le cœur fonctionnel est réparti entre :

- [backend/src/services/aTeamService.js](../backend/src/services/aTeamService.js) : analyse de mission, détection de domaines, composition de l'équipe.
- [backend/src/services/agentAutonomyPlanService.js](../backend/src/services/agentAutonomyPlanService.js) : activation conditionnelle de l'A-Team selon le budget et la recommandation d'analyse.
- [backend/src/services/agentFleetService.js](../backend/src/services/agentFleetService.js) : création des workers multidisciplinaires avec prompts contextualisés.
- [backend/src/services/agentOrchestrationState.js](../backend/src/services/agentOrchestrationState.js) : état partagé, barrières d'évidence, continuations.
- [backend/src/services/workerGarageService.js](../backend/src/services/workerGarageService.js) : gestion des slots de workers, allocation des capacités.

Le principe est strict : aucun domaine ne peut être ignoré sans justification, aucun agent ne peut dépasser ses bornes sans escalade, et la fusion finale exige des preuves d'interopérabilité.

---

## 2. Non une équipe générique, mais une équipe cohérente

GenOS applique une logique de détection et de validation multidisciplinaire :

1. **analyser la mission** pour détecter les domaines implicites ;
2. **valider la multidisciplinarité** (au moins 2 domaines, au maximum 3) ;
3. **allouer des agents spécialisés** avec des modèles adaptés ;
4. **définir des hypothèses contextualisées** pour chaque branche ;
5. **exécuter en isolation de domaine** ;
6. **mesurer les preuves d'intégration** ;
7. **fusionner avec validation de cohérence** ;
8. **escalader les incohérences** sans forcer la fusion.

Les mécanismes de sécurité et de cohérence sont explicites :

- **capacité maximale** : 3 domaines actifs simultanément ;
- **slots de workers** : limite globale sur les agents autonomes ;
- **modèles recommandés** : différenciation frontier/standard selon le domaine ;
- **dépendances de pipeline** : certains domaines peuvent dépendre d'autres (ex: intégrateur dépend des implémenteurs) ;
- **preuve d'intégrabilité** : chaque agent doit retourner les contraintes de son domaine ;
- **arrêt sur incohérence** : fusion refusée si les contraintes ne peuvent être réconciliées.

---

## 3. Définition mathématique de la composition

La composition d'une A-Team est un problème d'allocation de responsabilité et de couverture de capacités.

Soit :

- $D$ : ensemble des domaines détectés dans la mission,
- $k$ : capacité maximale de l'A-Team (typiquement 3),
- $|D|$ : nombre de domaines détectés,
- $S$ : score de pertinence par domaine,
- $C_i$ : ensemble des capacités requises du domaine $i$,
- $M_i$ : ensemble des capacités fournies par l'agent assigné au domaine $i$.

La recommandation d'activation de l'A-Team suit :

$$
\text{recommended} = |D| \ge 2
$$

et la composition est valide si :

$$
2 \le |D| \le k
$$

La sélection des domaines pour former l'équipe active suit un classement par score :

$$
D_{\text{active}} = \text{topK}(D, k, \text{score})
$$

où les domaines sont triés en ordre décroissant de pertinence.

La couverture de capacités globales est mesurée par :

$$
\text{coverage} = \frac{\sum_{d \in D_{\text{active}}} |C_d \cap M_d|}{\sum_{d \in D_{\text{active}}} |C_d|}
$$

Une couverture < 0.8 indique une équipe sous-dotée. Le système refuse l'activation si la couverture tombe en dessous du seuil critique.

## 3.1 Quality Gate CI/CD

Le point d'entrée `backend/bin/genos-ateam-audit.js` transforme cette barrière en contrôle bloquant pour les pipelines. Il accepte `--mission` ou `--mission-file`, écrit une preuve JSON avec le schéma `genos.ateam-quality-gate/v1`, et accepte le rapport optionnel de l'observateur via `--observer-report`.

Le processus retourne `0` si la couverture est au moins `0.8` et qu'aucun échec d'intégration n'est signalé. Il retourne intentionnellement `2` dans les autres cas, afin que GitHub Actions, GitLab CI ou un ordonnanceur industriel puisse bloquer la livraison. L'action locale `.github/actions/genos-ateam-audit` et le workflow `.github/workflows/genos-ateam-audit.yml` exécutent ce contrôle sur chaque Pull Request.

---

## 4. Domaines reconnus et rôles

Le service d'analyse détecte les domaines suivants par signaux textuels :

| Domaine | Rôle | Modèle | Signaux clés |
|---------|------|--------|-------------|
| `frontend` | frontend_engineer | standard | React, Vue, Angular, UI, CSS, design system |
| `backend` | backend_engineer | standard | API, serveur, Express, Node.js, microservice |
| `data` | data_engineer | standard | database, SQL, SQLite, Postgres, ETL, analytics |
| `security` | security_reviewer | **frontier** | OAuth, permissions, vulnérabilités, authentification |
| `quality` | quality_engineer | standard | tests, QA, vérification, benchmark, évaluation |
| `operations` | operations_engineer | standard | DevOps, déploiement, Docker, Kubernetes, CI/CD |
| `ai` | ai_engineer | **frontier** | IA, Machine Learning, modèles, prompts, agents, RAG, LLM |
| `product` | product_specialist | standard | produit, business, accessibilité, user research |
| `science` | research_scientist | **frontier** | découverte, recherche, hypothèse, falsification, académie |
| `integration` | integration_observer | standard | intégration, fusion, interopérabilité, dépendances |

Les domaines marqués **frontier** reçoivent des modèles premium pour des décisions critiques.

Le domaine `integration` joue un rôle spécial : c'est un observateur qui dépend des autres domaines et valide la cohérence globale.

---

## 5. Architecture du système

```text
Client / Mission
        |
        v
[aTeamService.analyzeMission]
        |
        +--> détecte domaines implicites
        +--> valide multidisciplinarité
        +--> retourne recommandation + members
        |
        v
[agentAutonomyPlanService]
        |
        +--> teste budget et capacité
        +--> active l'A-Team si recommandée
        +--> configure ateam.activated, workers count
        |
        v
[agentFleetService.createAutonomousWorkers]
        |
        +--> instancie agents spécialisés
        +--> injecte prompt contextualisé par domaine
        +--> assigne budget initial
        |
        v
[Exécution isolée par domaine]
        |
        +--> frontend_engineer : UI/UX, composants
        +--> backend_engineer : logique métier, API
        +--> data_engineer : persistance, requêtes
        +--> security_reviewer : preuves de sécurité
        +--> quality_engineer : tests, validation
        +--> ... autres domaines
        |
        v
[agentFleetService.evidence barrier]
        |
        +--> collecte preuves par domaine
        +--> valide intégrabilité
        +--> décide fusion ou escalade
        |
        v
[Synthèse et fusion]
        |
        +--> merge_domain_solutions
        +--> record_integration_constraints
        +--> return unified_evidence
```

Les composants interagissent via l'état partagé dans [backend/src/services/agentOrchestrationState.js](../backend/src/services/agentOrchestrationState.js), ce qui permet un contrôle centralisé des missions parallèles, des barrières d'évidence, et des décisions de fusion.

---

## 6. Analyse et détection de domaines

L'analyse de mission est effectuée par [backend/src/services/aTeamService.js](../backend/src/services/aTeamService.js).

### Processus de détection

La fonction `analyzeMission(text)` :

1. **teste les artefacts spécialisés** (ex: fiction, créativité littéraire) ;
2. **applique les règles de domaines techniques** via signaux regex ;
3. **compte les correspondances par domaine** ;
4. **classe les domaines par score de pertinence** ;
5. **retourne une analyse complète avec recommandation**.

Exemple de détection pour :

```
"Construire une interface React, une API Express et sécuriser OAuth avec des tests."
```

Résultat attendu :

- Domaines détectés : `frontend` (score=2), `backend` (score=2), `security` (score=1), `quality` (score=1)
- Sélection : `frontend`, `backend`, `security` (3 domaines, max atteint)
- Recommandation : `true` (au moins 2 domaines) ✓
- Members : 3 agents avec rôles, hypothèses et missions contextualisées

### Cas spéciaux : Artefacts créatifs

Si la mission implique une création littéraire ou narrative (signaux : `histoire`, `roman`, `fiction`, `écriture créative`), l'analyse bascule vers une équipe dédiée :

```javascript
const FICTION_TEAM = [
  {
    label: 'literary_creation',
    role: 'literary_author',
    modelTier: 'frontier',
    capabilities: ['literary_voice', 'character_psychology'],
    hypothesis: 'Créer la fiction avec une voix distinctive et des personnages psychologiquement spécifiques.',
    pipelineStage: 0,
    dependsOn: []
  },
  {
    label: 'dramaturgy',
    role: 'dramaturg',
    modelTier: 'frontier',
    capabilities: ['dramaturgy', 'twist_design'],
    hypothesis: 'Valider le conflit, le rythme et l\'architecture narrative.',
    pipelineStage: 1,
    dependsOn: ['literary_creation']
  },
  {
    label: 'literary_criticism',
    role: 'literary_critic',
    modelTier: 'standard',
    capabilities: ['literary_criticism'],
    hypothesis: 'Évaluer la prose, la profondeur et la crédibilité émotionnelle.',
    pipelineStage: 2,
    dependsOn: ['literary_creation', 'dramaturgy']
  }
];
```

Cette équipe est activée automatiquement si la mission porte sur la création littéraire.

---

## 7. Composition et allocation

La fonction `compose()` dans [backend/src/services/aTeamService.js](../backend/src/services/aTeamService.js) construit l'équipe à partir de paramètres explicites.

### Contrat d'entrée

```javascript
compose({
  projectGoal: "string",           // objectif du projet
  subSystems: ["domain1", "domain2", ...],  // domaines requis
  assignedRoles: ["role1", "role2", ...],   // rôles (optionnel)
  modelTiers: ["standard", "frontier", ...], // modèles (optionnel)
  available: 3                     // slots libres dans le garage
})
```

### Validation stricte

La composition valide :

1. **objectif présent** : aucune A-Team sans mission explicite ;
2. **multidisciplinarité minimale** : au moins 2 domaines distincts ;
3. **capacité respektée** : au maximum 3 domaines ;
4. **slots disponibles** : l'orchestre doit avoir des places libres dans le garage de workers.

Si une validation échoue, une exception est levée avec code d'erreur précis :

- `A_TEAM_GOAL_REQUIRED` : pas d'objectif
- `A_TEAM_MULTIDISCIPLINARY_REQUIRED` : moins de 2 domaines
- `A_TEAM_CAPACITY_EXCEEDED` : plus de 3 domaines
- `WORKER_GARAGE_FULL` : pas de slots libres

### Sortie

La composition retourne un tableau d'agents contextualisés :

```javascript
[
  {
    subSystem: "frontend",
    role: "frontend_engineer",
    modelTier: "standard",
    mission: "Project goal: ...\nOwned competency domain: frontend\nWork only on this bounded domain and return evidence plus integration constraints to the orchestrator."
  },
  { subSystem: "backend", ... },
  { subSystem: "security", ... }
]
```

Chaque agent reçoit une mission explicite qui borne son domaine et l'invite à retourner des preuves d'intégration.

---

## 8. Activation et allocation de budget

L'A-Team est activée conditionnellement par [backend/src/services/agentAutonomyPlanService.js](../backend/src/services/agentAutonomyPlanService.js).

### Décision d'activation

```javascript
autonomyPlan.aTeam = aTeamService.analyzeMission(mission);
const aTeamWorkerCount = autonomyPlan.aTeam.members.length;
const affordableAteamMembers = Math.floor(
  (tokenBudget * workerAllocationRatio) / minTokensPerWorker
);

autonomyPlan.aTeam.activated = 
  !autonomyPlan.trinity.activated  // A-Team et Trinity s'excluent mutuellement
  && autonomyPlan.aTeam.recommended // Au moins 2 domaines détectés
  && affordableAteamMembers >= aTeamWorkerCount; // Budget suffisant
```

### Conditions d'exclusion

- **Trinity activée** : Trinity (pipeline spécialisé) et A-Team ne s'activent jamais ensemble.
- **Pas assez de budget** : si le budget ne peut pas supporter le nombre d'agents, l'A-Team est dégradée ou bloquée.
- **Pas de multidisciplinarité** : si moins de 2 domaines sont détectés, l'analyse ne recommande pas l'A-Team.

### Allocation de budget par agent

Le budget est réparti équitablement entre les agents actifs :

$$
T_{\text{per\_agent}} = \frac{T_{\text{worker}} \times s}{|D_{\text{active}}|}
$$

où :
- $T_{\text{worker}}$ est le budget alloué aux workers
- $s$ est le ratio d'allocation (typiquement 0.6–0.8)
- $|D_{\text{active}}|$ est le nombre de domaines actifs

Chaque agent doit atteindre un minimum viable de tokens pour effectuer une exploration significative dans son domaine.

---

## 9. Exécution isolée et preuves d'intégration

Les agents de l'A-Team s'exécutent en isolation stricte de domaine. Le prompt injecté pour chaque agent impose :

- **une hypothèse claire** : ce que l'agent doit accomplir et prouver dans son domaine
- **des contraintes de domaine** : quelles sont les limites de sa responsabilité
- **un contrat de preuve** : quels types de preuves doivent être retournées (code, tests, métriques, audit)
- **des contraintes d'intégration** : quelles dépendances vis-à-vis d'autres domaines existent

Exemple pour un agent `backend_engineer` :

```
Project goal: Construire une interface React, une API Express et sécuriser OAuth avec des tests.
Owned competency domain: backend
Work only on this bounded domain and return evidence plus integration constraints to the orchestrator.

Hypothesis: Own the backend competency for the shared mission and return evidence to the orchestrator.

Deliverables:
1. API design compliant with frontend expectations
2. Authentication hooks for OAuth integration (delegate implementation to security agent)
3. Database schema and query patterns (coordinate with data agent)
4. Test suite for backend logic
5. Integration constraints: list what the frontend must provide, what security must implement, etc.
```

### Barrière d'évidence

Avant fusion, chaque agent doit franchir une barrière d'évidence :

1. **évidence collectée** : preuves, tests, rapports ;
2. **validité du domaine** : les preuves correspondent-elles au domaine assigné ? ;
3. **contraintes d'intégration explicites** : quels problèmes ou dépendances doivent être adressés ? ;
4. **absence de débordement** : l'agent n'a-t-il pas colonisé d'autres domaines ? ;
5. **complétude** : a-t-on raisonnablement couvert le domaine assigné ?

Si l'évidence est insuffisante, le runtime émet :
- `WORKER_EVIDENCE_INSUFFICIENT` : preuve manquante ou fragile
- `WORKER_DOMAIN_CONTAMINATION` : débordement hors du domaine assigné
- `WORKER_INTEGRATION_CONSTRAINT_MISSING` : pas de contraintes d'intégration explicitées

---

## 10. Intégration et fusion

La fusion d'une A-Team n'est pas une concaténation. C'est une validation d'interopérabilité multidisciplinaire.

### Processus de fusion

1. **collecter les dossiers d'évidence** de tous les agents
2. **valider la cohérence** : les contraintes d'intégration déclarées par chaque domaine sont-elles satisfaites par les solutions proposées ?
3. **détecter les conflits** : y a-t-il des exigences incompatibles ?
4. **mesurer la couverture** : tous les domaines requis sont-ils couverts ?
5. **décider** : fusionner, escalader ou bifurquer

### Matrice de fusion

Pour chaque paire de domaines $(d_i, d_j)$, on valide :

$$
\text{compatible}(d_i, d_j) = 
\begin{cases}
1 & \text{si } \text{constraints}(d_i) \cap \text{solutions}(d_j) \text{ satisfait} \\
0 & \text{sinon (escalade requise)}
\end{cases}
$$

Si toutes les paires sont compatibles :

$$
\text{canMerge} = \prod_{i<j} \text{compatible}(d_i, d_j) = 1
$$

Sinon, le système génère un rapport de conflits et demande l'escalade humaine ou l'orchestration secondaire.

### Exemple d'incohérence

**Frontend propose :** API doit retourner un objet User avec `id`, `name`, `email`, `roles`

**Backend propose :** API retourne minimalement `id`, `name`

**Security propose :** l'email ne doit pas être exposé directement (utiliser une clé de déréférence)

**Résultat :** Conflit détecté. L'orchestrateur demande à backend et security de se coordonner via une continuation.

---

## 11. Continuations et adaptations

Après la première barrière d'évidence, si la fusion détecte des conflits mineurs, l'orchestrateur peut lancer des **continuation workers** dans les domaines critiques.

### Allocation de continuation

Le budget de continuation est réparti entre les domaines qui doivent se resynchroniser :

$$
T_{\text{cont}} = T_{\text{worker}} - T_{\text{initial}}
$$

Les agents reçoivent une continuation contextualisée :

```
Previous evidence summary from all domains:
- Frontend: expects [ ... ]
- Backend: proposes [ ... ]
- Security: requires [ ... ]

Detected inconsistency: [ ... ]

Your task (backend_engineer): resolve the inconsistency by adapting your solution to satisfy:
1. Frontend's expectations
2. Security's constraints
Integration constraint: coordinate with security on OAuth implementation.
Return updated evidence.
```

### Critères d'arrêt de continuation

Une continuation s'arrête si :

- la cohérence est atteinte (compatible = 1) ;
- le budget est épuisé ;
- un cycle de rejet est détecté (même domaine relancé 3 fois sans progression) ;
- une escalade humaine est demandée.

---

## 12. Gestion des slots et du garage de workers

La capacité globale de workers autonomes est limitée par [backend/src/services/workerGarageService.js](../backend/src/services/workerGarageService.js).

### Limite de slots

```javascript
const DEFAULT_MAX_ACTIVE_WORKERS = 6;
const MAX_ATEAM_MEMBERS = 3;
```

L'A-Team réserve jusqu'à 3 slots. Les autres slots sont partagés avec Trinity et les workers génériques.

### Remplissage du garage

Avant d'activer l'A-Team :

```javascript
const freeSlots = totalSlots - (activeWorkers + activeTrinity + reservedContinuations);
if (freeSlots < ateamMemberCount) {
  throw new Error('WORKER_GARAGE_FULL: insufficient free slots for A-Team activation');
}
```

Si le garage est plein, l'activation est reportée ou l'A-Team est dégradée (nombre réduit d'agents).

---

## 13. Télémétrie et observabilité

Le système enregistre pour chaque mission A-Team :

- **analysisFit** : score d'adéquation de la mission à l'A-Team
- **memberActivationOrder** : ordre d'activation des domaines
- **evidenceCollectionTime** : temps avant barrière d'évidence
- **fusionDecision** : résultat (merged, escalated, bifurcated)
- **integrationConstraintViolations** : nombre de conflits détectés
- **continuationRounds** : nombre de relances de synchronisation

Ces métriques aident à :

- **valider l'efficacité** : l'A-Team résout-elle les missions multidisciplinaires plus vite qu'un orchestrateur générique ?
- **détecter les domaines problématiques** : quels domaines produisent le plus d'incohérences ?
- **optimiser l'allocation** : peut-on prédire le succès avant d'allouer le budget ?

---

## 14. Cas d'usage typiques

### Cas 1 : Développement d'application full-stack

**Mission :** Construire un système de gestion de tâches collaborative avec authentification sécurisée et tests complets.

**A-Team activée :**
- `frontend_engineer` : interface réactive, gestion d'état
- `backend_engineer` : API RESTful, persistence
- `security_reviewer` : audit OAuth, validation des permissions
- `quality_engineer` : tests e2e, couverture de code

**Barrière d'évidence :**
- Frontend propose des maquettes + composants React
- Backend propose des endpoints + schéma DB
- Security certifie OAuth + CSRF mitigation
- Quality rapporte couverture de tests > 80%

**Fusion :** Cohérent. Tous les agents acceptent de converger.

### Cas 2 : Recherche et développement d'algorithme

**Mission :** Implémenter une pipeline de machine learning avec découverte automatique d'hyperparamètres et audit de biais.

**A-Team activée :**
- `ai_engineer` : architecture du modèle, entraînement
- `data_engineer` : ETL, validation des données
- `science_reviewer` : falsification d'hypothèses, reproductibilité
- `quality_engineer` : benchmarks, ablation studies

**Barrière d'évidence :**
- AI Engineer propose modèle + code d'entraînement
- Data Engineer valide la qualité du dataset
- Science Reviewer demande : "Quelle est la null hypothesis ?"
- Quality Engineer propose ablation matrix

**Fusion :** Avec escalade science. La falsification de l'hypothèse doit être explicite.

### Cas 3 : Simplification (pas d'A-Team)

**Mission :** Écrire une fonction de tri en TypeScript.

**Analyse :** 1 domaine détecté (`backend`). A-Team non recommandée.

**Résultat :** Orchestrateur générique ou worker unique.

---

## 15. Cas d'erreur et escalade

### Erreur 1 : Garage plein

```
WORKER_GARAGE_FULL: A-Team requires 3 free slots but only 1 is available.
Action: wait for current workers to complete or escalate to queue.
```

### Erreur 2 : Incohérence de fusion

```
INTEGRATION_CONSTRAINT_VIOLATED:
  - Backend promises email field in User API
  - Security forbids exposing email
  - Action: dispatch continuation to backend + security or escalade.
```

### Erreur 3 : Domaine contaminé

```
WORKER_DOMAIN_CONTAMINATION:
  - Backend agent proposed database schema (valid: backend domain)
  - BUT ALSO proposed API authentication logic (invalid: security domain)
  - Action: reject backend evidence, request re-focus.
```

### Erreur 4 : Preuve insuffisante

```
WORKER_EVIDENCE_INSUFFICIENT:
  - Frontend agent returned UI components
  - BUT no accessibility audit (expected for quality assurance)
  - Action: dispatch quality_engineer for supplementary audit.
```

---

## 16. Configuration et paramètres

### Variables d'environnement

```bash
# Nombre maximal de membres de l'A-Team
export GENOS_MAX_ATEAM_MEMBERS=3

# Nombre maximal de workers autonomes (partagé avec Trinity)
export GENOS_MAX_AUTONOMOUS_WORKERS=6

# Budget alloué aux workers (ratio du budget total)
export GENOS_WORKER_ALLOCATION_RATIO=0.6

# Tokens minimum par worker
export GENOS_MIN_TOKENS_PER_WORKER=8000
```

### Configuration de domaines personnalisés

Pour ajouter un domaine personnalisé, modifier [backend/src/services/aTeamService.js](../backend/src/services/aTeamService.js) :

```javascript
TECHNICAL_DOMAIN_RULES.push({
  domain: 'custom_domain',
  role: 'custom_specialist',
  modelTier: 'standard',
  signals: [/your regex patterns/i]
});
```

---

## 17. Limitations et design notes

### Limitation de capacité (3 domaines max)

Pourquoi 3 et pas plus ?

- **Explosion combinatoire** : fusionner $n$ domaines exige $O(n^2)$ validations de compatibilité.
- **Complexité cognitive** : au-delà de 3, les orchestrateurs humains perdent le contexte.
- **Efficacité de preuve** : avec 3 agents dédiés, la couverture et la qualité surpassent les generic workers.

### Exclusion mutuelle Trinity/A-Team

Pourquoi pas les deux ?

- Trinity est un pipeline d'orchestration *temporelle* (séquence de phases).
- A-Team est une décomposition *spatiale* (domaines parallèles).
- Les deux interfèrent sur la gestion du budget et les décisions de gate.
- Empiriquement, activer les deux produit des cycles de synchronisation inefficaces.

### Pas de vraie "intelligence d'équipe"

La A-Team ne négocie pas, ne débat pas, ne vote pas. Elle :

- exécute en parallèle dans les domaines assignés ;
- retourne des preuves et des contraintes ;
- accepte ou refuse la fusion selon une logique de satisfaction de contraintes.

Toute négociation ou dépassement est une escalade vers l'orchestrateur ou l'humain.

---

## Références internes

- [ORCHESTRATION.md](ORCHESTRATION.md) : orchestration générale, gates et phases
- [RUNTIME_AGENTIQUE.md](RUNTIME_AGENTIQUE.md) : runtime des agents autonomes
- [PRIMITIVES_EXECUTABLES.md](PRIMITIVES_EXECUTABLES.md) : outils d'exécution et isolation
- [aTeamService.js](../backend/src/services/aTeamService.js) : implémentation de l'analyse
- [agentAutonomyPlanService.js](../backend/src/services/agentAutonomyPlanService.js) : activation et allocation
- [agentFleetService.js](../backend/src/services/agentFleetService.js) : création et gestion des workers
- Tests : [backend/tests/test_a_team.js](../backend/tests/test_a_team.js)
