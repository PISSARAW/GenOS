# Holobionte : Orchestration Intégrée Host-Symbionte avec Sécurité et Mémoire

## 1. Définition

Holobionte dans GenOS est le mécanisme d'orchestration qui structure une mission comme une **collectivité intégrée host-et-symbiontes** où un agent "hôte" (Host Orchestrator) remplit la fonction principale, tandis que trois symbiotes spécialisés fournissent des capacités complémentaires essentielles à la sécurité, à l'intégrité et à la mémoire.

Contrairement aux modèles précédents (Trinity = trois hypothèses, A-Team = domaines, Biocénose = communauté), Holobionte repose sur une **hiérarchie fonctionnelle avec autorité centrale** où :

1. **Host Orchestrator** : définit l'objectif, les limites d'autorité, et le contrat partagé ;
2. **Specialist Symbiont** : fournit une capacité spécialisée tout en préservant la mission du host ;
3. **Immune Symbiont** : défie les sorties non-sûres, non-supportées ou contradictoires avant qu'elles n'entrent dans le résultat du host ;
4. **Memory Symbiont** : consolide les leçons durables, la lignée et le contexte réutilisable pour le host.

Le modèle s'inspire de la **symbiogenèse** : une cellule hôte intègre des symbiotes (mitochondries, chloroplastes) qui deviennent essentiels à sa survie et à sa fonction. Dans GenOS, c'est une architecture de **délégation sécurisée avec intégrité garantie**.

Le cœur fonctionnel est réparti entre :

- [backend/src/services/biologicalModeService.js](../backend/src/services/biologicalModeService.js) : composition des quatre rôles intégrés.
- [backend/src/services/holobionteService.js](../backend/src/services/holobionteService.js) : analyse de mission et activation d'Holobionte.
- [backend/src/services/immuneSystem.js](../backend/src/services/immuneSystem.js) : système immunitaire pour validation de sortie.
- [backend/src/services/agentOrchestrationState.js](../backend/src/services/agentOrchestrationState.js) : état partagé, synchronisation intégrée, barrière d'intégrité.

Le principe est : une architecture host-symbiote bien structurée offre une robustesse et une auditabilité que aucun agent isolé ne peut atteindre.

---

## 2. Non une équipe égalitaire, mais une hiérarchie fonctionnelle

GenOS applique une logique d'intégration avec autorité centrale :

1. **le Host Orchestrator commande** : il pose l'objectif, les seuils et les décisions finales ;
2. **les Symbiontes servent** : ils fournissent des capacités sans déborder du contrat ;
3. **l'Immune Symbiont protège** : il agit comme un système immunitaire, refusant les sorties dangereuses ;
4. **le Memory Symbiont préserve** : il consolide l'apprentissage pour les futures incarnations du host ;
5. **la fusion exige l'approbation du Host** : aucun résultat n'est promu sans validation du host.

Les mécanismes de sécurité sont explicites :

- **autorité centrale** : le host décide, les symbiontes exécutent ;
- **contrat explicite** : chaque symbiote connaît ses limites et ses responsabilités ;
- **barrière immunitaire** : aucune sortie ne passe sans validation du Immune Symbiont ;
- **traçabilité** : le Memory Symbiont enregistre chaque étape pour auditabilité ;
- **escalade graduée** : si un symbiote ne peut pas résoudre son domaine, il escalade au host.

---

## 3. Définition mathématique de l'orchestration intégrée

L'orchestration Holobionte est un problème de **délégation sécurisée et d'intégrité garantie**.

Soit :

- $M$ : mission du host ;
- $H$ : état du host (objectif, limites, contrat) ;
- $S_i$ : output du symbiote $i$ ;
- $V_i$ : validité de $S_i$ (preuves, assertions) ;
- $I$ : système immunitaire (validations de sécurité) ;
- $M_h$ : mémoire du host (leçons consolidées).

Le host définit :

$$
H = (M, \text{authority\_boundary}, \text{contract})
$$

Chaque symbiote exécute dans les limites du contrat :

$$
S_i = \text{Execute}(M, H) \text{ s.t. } S_i \in \text{Boundary}(H)
$$

Le système immunitaire valide avant intégration :

$$
I(S_i) = 
\begin{cases}
1 & \text{si } S_i \text{ est sûr et cohérent avec } H \\
0 & \text{sinon (rejet)}
\end{cases}
$$

Le résultat final est accepté si :

$$
\text{canMerge} = \forall_i : I(S_i) = 1
$$

La mémoire du host est mise à jour :

$$
M_h^{t+1} = M_h^t + \text{Consolidate}(S_1, S_2, S_3, S_4)
$$

---

## 4. Les quatre rôles et hypothèses

Holobionte crée toujours exactement 4 agents intégrés, avec des rôles distincts et complémentaires :

### 4.1 Host Orchestrator (Frontier)

```
Role: host_orchestrator
ModelTier: frontier
Member Number: 1
Authority: Central
```

**Hypothèse :**
> "Define the host objective, authority boundary, and contract shared by the collective."

**Mission assignée :**
```
Holobionte shared mission: [shared mission]
Collective principle: An integrated host-and-symbiont collective combining complementary capabilities.
Role hypothesis: Define the host objective, authority boundary, and contract shared by the collective.

Your task (host_orchestrator):
1. Define the primary objective (mission of the host)
2. Define authority boundaries (what decisions belong to the host vs symbionts)
3. Define the contract (expectations, delivery, safety thresholds)
4. Delegate specialized work to symbionts while maintaining oversight
5. Review symbiont outputs and decide: accept, request refinement, or reject
6. Final authority rests with the host

Return: Mission definition, authority boundaries, contract, delegation plan, and final decision
```

**Rôle dans l'holobionte :**
- Pose l'objectif et les limites
- Délègue travail spécialisé
- Valide et accepte les résultats
- Décide escalade ou rejet
- Responsable du succès final

### 4.2 Specialist Symbiont (Standard)

```
Role: specialist_symbiont
ModelTier: standard
Member Number: 2
Authority: Delegated
```

**Hypothèse :**
> "Supply specialized capability while preserving the host mission and reporting evidence."

**Mission assignée :**
```
Holobionte shared mission: [shared mission]
Collective principle: An integrated host-and-symbiont collective combining complementary capabilities.
Role hypothesis: Supply specialized capability while preserving the host mission and reporting evidence.

Your task (specialist_symbiont):
1. Provide specialized technical capability within the domain delegated by the host
2. Preserve the host mission and authority boundaries
3. Report all evidence, assumptions, and constraints discovered
4. Do not exceed authority boundaries or redefine the mission
5. Escalate decisions back to the host if uncertain

Return: Specialized solution with evidence, assumptions, and integration constraints
```

**Rôle dans l'holobionte :**
- Exécute dans le domaine assigné
- Respecte les limites d'autorité du host
- Retourne preuves complètes
- Signale les dépendances sur autres symbiontes
- Escalade si sortie de domaine

### 4.3 Immune Symbiont (Frontier)

```
Role: immune_symbiont
ModelTier: frontier
Member Number: 3
Authority: Validation Gate
```

**Hypothèse :**
> "Challenge unsafe, unsupported, or contradictory outputs before they enter the host result."

**Mission assignée :**
```
Holobionte shared mission: [shared mission]
Collective principle: An integrated host-and-symbiont collective combining complementary capabilities.
Role hypothesis: Challenge unsafe, unsupported, or contradictory outputs before they enter the host result.

Your task (immune_symbiont):
1. Validate all outputs from the Specialist Symbiont
2. Check for safety violations, missing proofs, or logical contradictions
3. Check consistency with the host contract and authority boundaries
4. Identify risks, gaps, or unsupported claims
5. Act as a checkpoint: outputs do not reach the host without immune approval

Return: Validation report with approved/rejected outputs and reasoning
```

**Rôle dans l'holobionte :**
- Agit comme système immunitaire
- Valide toutes les sorties avant intégration
- Refuse les sorties dangereuses ou non-prouvées
- Protège l'intégrité du host
- Escale les décisions au host si besoin

### 4.4 Memory Symbiont (Standard)

```
Role: memory_symbiont
ModelTier: standard
Member Number: 4
Authority: Preservation & Learning
```

**Hypothèse :**
> "Consolidate durable lessons, lineage, and reusable context for the host."

**Mission assignée :**
```
Holobionte shared mission: [shared mission]
Collective principle: An integrated host-and-symbiont collective combining complementary capabilities.
Role hypothesis: Consolidate durable lessons, lineage, and reusable context for the host.

Your task (memory_symbiont):
1. Consolidate durable lessons from the mission (what worked, what failed)
2. Record lineage: how did we get to this result?
3. Capture reusable context (patterns, templates, anti-patterns)
4. Document decision rationale and trade-offs
5. Create artifacts for future host incarnations

Return: Consolidated memory, lineage report, reusable patterns, and future guidance
```

**Rôle dans l'holobionte :**
- Enregistre leçons durables
- Crée mémoire pour futures incarnations
- Documente rationale des décisions
- Préserve patterns et anti-patterns
- Augmente la sagesse collective du host

---

## 5. Architecture du système

```text
Client / Mission
        |
        v
[holobionteService.analyzeMission]
        |
        +--> valide que Holobionte est appropriée
        +--> prépare le contexte partagé
        |
        v
[biologicalModeService.compose]
        |
        +--> crée 4 agents intégrés
        +--> 1 Host Orchestrator (frontier, autorité)
        +--> 1 Specialist Symbiont (standard, exécution)
        +--> 1 Immune Symbiont (frontier, validation)
        +--> 1 Memory Symbiont (standard, apprentissage)
        |
        v
[Exécution hiérarchisée]
        |
        +--> Host Orchestrator: définit objectif + limites
        +--> Specialist Symbiont: développe solution spécialisée
        +--> Immune Symbiont: valide la solution
        +--> Memory Symbiont: consolide leçons
        |
        v
[Barrière d'intégrité]
        |
        +--> collecte solution + validations + mémoire
        +--> Immune Symbiont bloque ou approuve
        +--> Host Orchestrator prend la décision finale
        |
        v
[Résultat intégré ou rejet]
        |
        +--> Approuvé: solution + mémoire consolidée
        +--> Rejeté: correction ou escalade
```

---

## 6. Activation et analyse de mission

Holobionte s'active par [backend/src/services/holobionteService.js](../backend/src/services/holobionteService.js) et [backend/src/services/biologicalModeService.js](../backend/src/services/biologicalModeService.js).

### Processus d'activation

Holobionte s'active quand :

1. **mission critique pour la sécurité** : intégrité et validation sont vitales ;
2. **besoin d'autorité centrale** : une autorité doit décider définitivement ;
3. **consolidation d'apprentissage** : on veut préserver le contexte pour le futur ;
4. **domaine spécialisé avec protection** : un expert avec un gardien de sécurité.

Exemple :

```javascript
const mission = "Déploie une mise à jour de sécurité critique dans la base de données de production.";
const analysis = biologicalModeService.compose('holobionte', mission);

// Résultat:
// [
//   {
//     role: "host_orchestrator",
//     modelTier: "frontier",
//     memberNumber: 1,
//     mission: "Holobionte shared mission: ... \nRole hypothesis: Define the host objective..."
//   },
//   {
//     role: "specialist_symbiont",
//     modelTier: "standard",
//     memberNumber: 2,
//     mission: "Holobionte shared mission: ... \nRole hypothesis: Supply specialized capability..."
//   },
//   {
//     role: "immune_symbiont",
//     modelTier: "frontier",
//     memberNumber: 3,
//     mission: "Holobionte shared mission: ... \nRole hypothesis: Challenge unsafe, unsupported..."
//   },
//   {
//     role: "memory_symbiont",
//     modelTier: "standard",
//     memberNumber: 4,
//     mission: "Holobionte shared mission: ... \nRole hypothesis: Consolidate durable lessons..."
//   }
// ]
```

### Conditions d'exclusion

Holobionte est **dégradée** si :

- **budget insuffisant** : moins de 4 workers ne peuvent être financés ;
- **mission non-critique** : pas besoin d'autorité centrale ;
- **priorité à autre mode** : A-Team, Trinity ou Biocénose activée.

---

## 7. Composition et allocation

La fonction `compose(mode, mission)` crée les quatre agents intégrés contextualisés.

### Contrat d'entrée

```javascript
biologicalModeService.compose('holobionte', "Déploie une mise à jour de sécurité critique.")
```

### Validation stricte

La composition valide :

1. **mission présente** : aucun Holobionte sans mission explicite ;
2. **mode reconnu** : 'holobionte' dans les 4 modes biologiques ;
3. **quatre agents générés** : toujours exactement 4 rôles intégrés.

Si validation échoue :

- `BIOLOGICAL_MISSION_REQUIRED` : pas de mission
- `BIOLOGICAL_MODE_UNKNOWN` : mode inconnu

### Sortie

La composition retourne un tableau de 4 agents intégrés :

```javascript
[
  { role: 'host_orchestrator', modelTier: 'frontier', memberNumber: 1, mission: '...' },
  { role: 'specialist_symbiont', modelTier: 'standard', memberNumber: 2, mission: '...' },
  { role: 'immune_symbiont', modelTier: 'frontier', memberNumber: 3, mission: '...' },
  { role: 'memory_symbiont', modelTier: 'standard', memberNumber: 4, mission: '...' }
]
```

---

## 8. Allocation de budget et modèles

Le budget est réparti équitablement entre les quatre rôles :

$$
T_{\text{per\_agent}} = \frac{T_{\text{worker}} \times s}{4}
$$

où :
- $T_{\text{worker}}$ est le budget alloué aux workers
- $s$ est le ratio d'allocation (typiquement 0.6–0.8)
- 4 est le nombre de rôles Holobionte

### Modèles utilisés

- **Host Orchestrator** : modèle `frontier` (décision complexe, autorité) ;
- **Specialist Symbiont** : modèle `standard` (exécution rapide) ;
- **Immune Symbiont** : modèle `frontier` (validation complexe, sécurité) ;
- **Memory Symbiont** : modèle `standard` (consolidation et documentation) ;

Cette alternance frontier/standard équilibre coût et réflexion, avec fronts aux deux postes critiques (command et validation).

---

## 9. Exécution hiérarchisée et délégation

Les quatre rôles s'exécutent en **hiérarchie fonctionnelle** :

### Phase 1 : Définition du contrat par le Host

Le Host Orchestrator commence :

1. **définit l'objectif** : la mission claire du host ;
2. **pose les limites d'autorité** : quels domaines relèvent du host vs symbiontes ;
3. **établit le contrat** : seuils de sécurité, critères de succès, escalades ;
4. **délègue** : assigne travail spécialisé au Specialist Symbiont ;
5. **attend résultats** : attend la validation du Immune Symbiont.

Exemple de contrat :

```
## Host Orchestrator Directive

### Mission
Deploy critical security patch to production database without data loss or service interruption.

### Authority Boundaries
- Host retains: decision to go/no-go, final approval
- Specialist owns: technical implementation, rollback plan
- Immune owns: validation, safety checks
- Memory owns: documentation and lessons

### Safety Thresholds
- Data integrity verification: mandatory (100% check required)
- Rollback capability: mandatory (tested before deploy)
- Performance degradation: < 5% acceptable
- User-facing downtime: 0 seconds acceptable

### Escalation Rules
- If Specialist cannot guarantee safety: escalate
- If Immune finds critical flaw: escalate
- If Memory finds historical precedent: surface for host decision
```

### Phase 2 : Exécution spécialisée

Le Specialist Symbiont s'exécute dans les limites du contrat :

1. **technique d'implémentation** : déploiement du patch ;
2. **plan de rollback** : comment revenir en arrière ;
3. **données de validation** : tests, vérifications, métriques ;
4. **dépendances** : quels systèmes dépendent de ce changement ;
5. **publication** : retourne preuves au host et Immune Symbiont.

Exemple de résultat :

```
## Specialist Symbiont Report

### Implementation
- Security patch applied to 5 database instances
- Rollback script tested successfully
- Data integrity verified (100% match)

### Validation Data
- Pre-patch checksum: abc123
- Post-patch checksum: abc123 (data unchanged)
- Performance test: baseline 100ms, after patch 102ms (+2%)

### Dependencies Identified
- User authentication service depends on this DB
- Analytics pipeline depends on this DB
- Backup system must complete before deploy

### Assumptions
- Assume single-region deployment acceptable
- Assume 2-hour maintenance window acceptable
```

### Phase 3 : Validation immunitaire

Le Immune Symbiont valide avant intégration :

1. **sécurité** : le patch introduit-il de nouvelles vulnérabilités ? ;
2. **intégrité** : les données sont-elles cohérentes ? ;
3. **cohérence du contrat** : la solution respecte-t-elle les limites du host ? ;
4. **preuves suffisantes** : toutes les validations sont-elles présentes ? ;
5. **rejet ou approbation** : la solution peut-elle entrer dans le résultat du host ?

Exemple de rapport immunitaire :

```
## Immune Symbiont Validation Report

### Safety Checks
✓ Patch verified against vulnerability database
✓ No new CVEs introduced
✓ Rollback tested and working
✓ No privilege escalation detected

### Integrity Checks
✓ Data checksum matches before/after
✓ Foreign key constraints validated
✓ No orphaned records detected

### Contract Compliance
✓ < 5% performance degradation (actual: +2%)
✓ 0 seconds user-facing downtime (actual: 0s)
✓ Rollback capability confirmed

### Evidence Quality
✓ All tests present and passing
✓ Metrics collected and baseline provided
✓ Dependencies identified and verified

### Decision
APPROVED: Solution meets all safety thresholds and contract requirements.
Ready for host deployment decision.
```

### Phase 4 : Consolidation par la Mémoire

Le Memory Symbiont consolide pendant et après exécution :

1. **leçons durables** : qu'avons-nous appris ? ;
2. **patterns** : quels patterns se répètent ? ;
3. **anti-patterns** : quels dangers avons-nous esquivés ? ;
4. **lineage** : comment en sommes-nous arrivés là ? ;
5. **reusable artifacts** : quoi peut être réutilisé dans le futur ?

Exemple de rapport mémoire :

```
## Memory Symbiont Consolidation Report

### Durable Lessons
1. Security patches for databases require full data verification
2. Rollback testing is as important as forward testing
3. Multi-system dependencies need explicit coordination

### Patterns Identified
- Pattern: "Safe Database Patch Process" (apply, verify, rollback-test, deploy, monitor)
- Template: "Pre-deployment checklist" (data backup, rollback plan, monitoring setup)
- Risk: "Cascading service failures" (deploy without checking dependencies)

### Anti-Patterns to Avoid
- Never assume data integrity without verification
- Never skip rollback testing (even for "simple" patches)
- Never deploy without understanding dependent services

### Lineage
- Task initiated at 2024-01-15 10:00 UTC
- Host decided on deployment scope at 10:15 UTC
- Specialist completed implementation at 10:45 UTC
- Immune validated at 10:50 UTC
- Host approved final deployment at 10:55 UTC
- Deployment completed at 11:05 UTC

### Reusable Artifacts
- Patch validation checklist (can be reused for future security updates)
- Rollback verification script (tested, can be templated)
- Performance baseline for this database (for future comparisons)
```

---

## 10. Barrière d'intégrité et fusion

La fusion d'un Holobionte exige une **validation d'intégrité stricte par le Immune Symbiont** et une **approbation finale du Host**.

### Processus de fusion

1. **collecte solution du Specialist** ;
2. **Immune Symbiont valide** ;
3. **Host Orchestrator revoit et décide** ;
4. **Memory Symbiont consolide** ;
5. **décision finale** : approuvé, rejeté, ou demande de refinement.

### Critères de validation

Le Immune Symbiont valide :

$$
\text{safe}(S) = 
\begin{cases}
1 & \text{si } S \text{ passe tous les tests de sécurité et d'intégrité} \\
0 & \text{sinon}
\end{cases}
$$

$$
\text{consistent}(S, H) = 
\begin{cases}
1 & \text{si } S \text{ respecte le contrat du host } H \\
0 & \text{sinon}
\end{cases}
$$

$$
\text{evidenced}(S) = 
\begin{cases}
1 & \text{si toutes les preuves sont présentes et valides} \\
0 & \text{sinon}
\end{cases}
$$

Fusion possible si :

$$
\text{canMerge} = \text{safe}(S) = 1 \text{ AND } \text{consistent}(S, H) = 1 \text{ AND } \text{evidenced}(S) = 1
$$

### Décision du Host

Le Host Orchestrator, après validation du Immune Symbiont :

```javascript
if (immuneValidation.approved) {
  // Tous les critères de sécurité sont satisfaits
  return {
    hostDecision: 'APPROVED',
    rationale: 'Solution meets contract and safety thresholds',
    authority: 'host_orchestrator',
    effective_immediately: true
  };
} else if (immuneValidation.issues.count < 3 && immuneValidation.issues.severity === 'minor') {
  // Quelques problèmes mineurs, demander refinement
  return {
    hostDecision: 'REFINE',
    refinement_focus: immuneValidation.issues,
    authority: 'host_orchestrator'
  };
} else {
  // Problèmes majeurs, rejet
  return {
    hostDecision: 'REJECTED',
    reason: immuneValidation.critical_issue,
    escalation: 'requires_human_review',
    authority: 'host_orchestrator'
  };
}
```

---

## 11. Continuations et adaptations

Si le Immune Symbiont détecte des failles mineures, le Holobionte peut lancer des **continuation rounds** ciblés.

### Allocation de continuation

Le budget de continuation est alloué à :

- **Specialist Symbiont** : affiner la solution pour résoudre les problèmes mineurs ;
- **Immune Symbiont** : revalider après refinement ;
- **Memory Symbiont** : documenter la correction et l'apprentissage.

Le Host Orchestrator ne relance pas directement (il reste en attente d'approbation).

### Exemple de continuation

**Round 1 Result:**
- Immune Symbiont finds: "Performance degradation is 6%, exceeds threshold of 5%"
- Host Decision: REFINE

**Continuation Prompt (Specialist):**
```
The Immune Symbiont identified 1 issue:
- Performance degradation exceeds 5% threshold (actual: 6%)

Your refinement task:
1. Optimize the patch implementation to reduce performance impact
2. Target: < 5% performance degradation
3. Maintain full data integrity and security guarantees
4. Return updated solution and re-run validation tests

Perform refinement and return updated solution.
```

**Continuation (Immune Symbiont):**
```
Specialist has refined the patch.
Your re-validation task:
1. Test the optimized patch for performance
2. Verify all security and integrity checks still pass
3. Confirm data consistency maintained
4. Approve or identify remaining issues

Return updated validation report.
```

**Host Decision After Continuation:**
```
If Immune Symbiont approves optimized patch:
  → APPROVED (final)
Else if issues remain but minor:
  → REFINE again or escalate
Else:
  → REJECTED (solution cannot meet threshold)
```

### Critères d'arrêt

Une continuation s'arrête si :

- l'Immune Symbiont approuve ;
- le budget est épuisé ;
- le Host escalade ;
- un cycle s'initie (même problème relancé 2x sans progression).

---

## 12. Cas d'usage typiques

### Cas 1 : Déploiement critique de production

**Mission :** "Déploie une mise à jour de sécurité critique dans la base de données sans interruption de service."

**Holobionte activé :** 4 rôles hiérarchisés

**Exécution :**
- **Host** : définit scope (5 databases), seuils (0s downtime, 5% perf impact acceptable), autorité (go/no-go) ;
- **Specialist** : implémente patch, teste rollback, vérifie data integrity ;
- **Immune** : valide sécurité (patch audit + vulnerability check), intégrité (data checksum), performance (baseline test) ;
- **Memory** : documente processus, crée template de déploiement pour futur.

**Résultat :** APPROVED. Patch deployed safely. Template saved for future security updates.

### Cas 2 : Décision algorithmique critique

**Mission :** "Entraîne et déploie un modèle de ML pour décisions de crédit, avec garanties de non-discrimination."

**Holobionte activé :** 4 rôles

**Exécution :**
- **Host** : définit objectif (model pour décisions crédit), limites (sans discrimination légale), contrat (bias < 5%, fairness audit obligatoire) ;
- **Specialist** : entraîne model, valide accuracy, documente architecture ;
- **Immune** : vérifie fairness metrics (différence de taux d'acceptation par groupe < 5%), audite pour biais caché, teste adversarial examples ;
- **Memory** : documente rationale du model, patterns de discrimination trouvés et évités, anti-patterns à éviter.

**Résultat :** APPROVED with monitoring. Model deployed. Fairness checklist saved. Anti-bias patterns documented.

### Cas 3 : Modification de architecture sécurité

**Mission :** "Modifie la policy de authentification OAuth pour ajouter multi-factor authentication."

**Holobionte activé :** 4 rôles

**Exécution :**
- **Host** : définit scope (OAuth flow), exigences (tous les utilisateurs MFA, backward compatibility 90 jours), autorité (timeline) ;
- **Specialist** : implémente MFA, crée migration script, teste compatibility ;
- **Immune** : valide sécurité (session tokens, CSRF tokens toujours présents), backward compat (legacy clients still work), data safety (aucune perte de session) ;
- **Memory** : documente patterns de MFA implementation, lessons sur migration de auth, anti-patterns.

**Résultat :** APPROVED. Migration plan in place. MFA template created for future applications.

---

## 13. Cas d'erreur et escalade

### Erreur 1 : Budget insuffisant

```
HOLOBIONTE_BUDGET_INSUFFICIENT:
  Holobionte requires 4 agents (160,000 tokens total)
  but the budget permits only 1 agent (20,000 tokens)
  Action: Holobionte is not activated. Falling back to single-agent orchestration.
```

### Erreur 2 : Specialist viole le contrat

```
SPECIALIST_AUTHORITY_VIOLATION:
  Specialist proposed to change authentication policy
  But Host authority boundary restricts auth decisions to Host only
  Action: Immune Symbiont REJECTS output. Host decides: refine or escalate.
```

### Erreur 3 : Immune détecte risque critique

```
IMMUNE_CRITICAL_REJECTION:
  Specialist solution passes technical tests
  But Immune Symbiont detects: "Data rollback cannot be guaranteed"
  This violates Host contract requirement: "Rollback capability: mandatory"
  Action: Host decision = REJECTED. Specialist must redesign.
```

### Erreur 4 : Aucune solution n'est sûre

```
HOLOBIONTE_SAFETY_IMPOSSIBLE:
  After 2 continuation rounds, Specialist cannot design solution
  that meets Host safety thresholds
  Immune confirms: This problem cannot be solved safely with current constraints
  Action: Escalate to human. Host, Specialist, Immune reports forwarded.
```

---

## 14. Système immunitaire : Mécanismes de validation

L'Immune Symbiont met en œuvre un système immunitaire logique, inspiré par [backend/src/services/immuneSystem.js](../backend/src/services/immuneSystem.js).

### Checks automatisés

```
1. SAFETY_CHECKS
   - Is the output logically consistent?
   - Are there undeclared assumptions?
   - Does it introduce new vulnerabilities?

2. INTEGRITY_CHECKS
   - Are all proofs present?
   - Is the evidence chain complete?
   - Do test results support claims?

3. CONTRACT_CHECKS
   - Does the output respect Host authority boundaries?
   - Does it meet the agreed thresholds?
   - Are dependencies on other symbionts documented?

4. COHERENCE_CHECKS
   - Does this output contradict prior outputs?
   - Is the lineage documented?
   - Are failure modes identified?
```

### Levels de rejection

| Level | Example | Action |
|-------|---------|--------|
| **Critical** | "Violates data integrity guarantee" | REJECT immediately, escalate to Host |
| **Major** | "Missing rollback capability" | REJECT, request redesign from Specialist |
| **Minor** | "Performance 6% instead of <5%" | CONDITIONAL APPROVE, request refinement |
| **Informational** | "New pattern identified" | APPROVE, surface to Memory Symbiont |

---

## 15. Télémétrie et observabilité

Le système enregistre pour chaque mission Holobionte :

- **roleCompleteness** : chaque rôle a-t-il produit ?
- **hostDecisions** : combien de go/no-go, rejets, refinements ?
- **immuneValidations** : statistiques de rejet et approbation ;
- **continuationRounds** : nombre de refinements nécessaires ;
- **contractViolations** : cas où Specialist a violé limites d'autorité ;
- **memoryConsolidation** : patterns et templates créés ;
- **totalCycleTime** : temps du zygote à fusion finale.

Ces métriques aident à :

- **valider l'efficacité** : Holobionte réduit-il risques vs agent isolé ?
- **détecter la déviation** : y a-t-il des violations de contrat fréquentes ?
- **mesurer l'apprentissage** : combien de patterns réutilisables créés ?
- **optimiser** : quelles phases prennent le plus de budget ?

---

## 16. Configuration et paramètres

### Variables d'environnement

```bash
# Nombre de rôles Holobionte (toujours 4, non configurable)
export GENOS_HOLOBIONTE_ROLES=4

# Nombre maximal de workers autonomes (partagé avec Trinity, A-Team)
export GENOS_MAX_AUTONOMOUS_WORKERS=6

# Budget alloué aux workers
export GENOS_WORKER_ALLOCATION_RATIO=0.6

# Tokens minimum par agent Holobionte
export GENOS_MIN_TOKENS_PER_WORKER=8000

# Nombre maximal de continuations avant escalade
export GENOS_HOLOBIONTE_MAX_REFINEMENTS=2

# Sévérité minimale pour rejet immunitaire
export GENOS_IMMUNE_MIN_SEVERITY=critical
```

---

## 17. Limitations et design notes

### Pourquoi 4 rôles et pas 3 ou 5 ?

- **1 Host** : autorité centrale, pas de consensus (décision claire) ;
- **1 Specialist** : exécution, pas plusieurs specialists (évite conflit d'autorité) ;
- **1 Immune** : validation unique, pas plusieurs (évite contradiction de sécurité) ;
- **1 Memory** : apprentissage, pas plusieurs (évite fragmentation de mémoire).

Total : 4 rôles complémentaires et non-redondants.

### Pourquoi hiérarchie centralisée vs consensus ?

Holobionte est **autoritaire par design** parce que :

- certaines missions (sécurité critique, production) exigent autorité claire ;
- consensus ralentit quand la sécurité est en jeu ;
- un seul Host élimine la possibilité de vote bloqué.

Biocénose offre consensus ; Holobionte offre autorité.

### Pourquoi Immune Symbiont est-il frontier ?

L'Immune Symbiont reçoit modèle frontier parce que :

- la validation de sécurité est complexe (pas de simple check-list) ;
- falsification sophistiquée exige réflexion profonde ;
- erreur immunitaire (approval d'output dangereux) est catastrophique.

---

## 18. Comparaison avec Trinity, A-Team, Biocénose

| Aspect | Trinity | A-Team | Biocénose | Holobionte |
|--------|---------|--------|-----------|------------|
| **Décomposition** | Hypothèses (3) | Domaines (N) | Communauté (4) | Hiérarchie (4) |
| **Autorité** | Orchest. central | Domaines isolés | Protocole/consensus | Host central |
| **Sécurité** | Implicite | Par domaine | Antagoniste | Explicite immunité |
| **Apprentissage** | Non | Non | Minimal | Maximal (Memory) |
| **Meilleur pour** | Explorer hypothèses | Multidisciplinaire | Robustesse critique | Production sécurisée |

---

## 19. SymbioteRuntime : orchestration hybride Cloud + Local (faible latence)

Le concept de satellites (Symbiotes) gravitant autour d'un noyau massif (Host) exige une différenciation stricte des moteurs d'inférence : un Host connecté à un modèle lourd, et des Symbiotes qui ne doivent jamais payer la latence réseau ni le coût par jeton de leurs tâches à haute fréquence.

### Principe : deux moteurs, une seule collectivité

- **Host Orchestrator** → moteur `cloud` : modèle frontier (GPT-4 / Claude 3.5 ou équivalent), pour l'autorité et la décision complexe.
- **Specialist Symbiont**, **Immune Symbiont**, **Memory Symbiont** → moteur `local` : runtime d'inférence local (Ollama, ou MLX via son serveur compatible OpenAI sur Apple Silicon), pour les tâches rapides et répétées.

Cette asymétrie est portée par [backend/src/services/symbioteRuntimeService.js](../backend/src/services/symbioteRuntimeService.js) :

- `engineFor(role)` retourne `'cloud'` pour `host_orchestrator` et `'local'` pour les trois Symbiotes ;
- `embedForSymbiote(role, text)` calcule un embedding **local uniquement** (jamais de repli cloud, donc jamais de coût API) en quelques millisecondes, utilisé par les Symbiotes pour indexer contexte, mémoire ou évidence avant de les transmettre au Host ;
- `validateSchemaLocally(value, schema)` valide un schéma JSON entièrement en process (aucun aller-retour réseau), utilisé typiquement par l'Immune Symbiont pour rejeter une sortie malformée avant qu'elle n'atteigne le Host ;
- `localRouteFor(db, { role, agentId })` calcule la politique de routage vers les modèles de chat locaux découverts (Ollama/MLX) pour les propres appels d'un Symbiote.

`biologicalModeService.compose('holobionte', mission)` expose désormais ce choix de moteur directement dans chaque membre composé :

```javascript
biologicalModeService.compose('holobionte', 'Deploy a critical security patch.');
// [
//   { role: 'host_orchestrator',   modelTier: 'frontier', engine: 'cloud', ... },
//   { role: 'specialist_symbiont', modelTier: 'standard', engine: 'local', ... },
//   { role: 'immune_symbiont',     modelTier: 'frontier', engine: 'local', ... },
//   { role: 'memory_symbiont',     modelTier: 'standard', engine: 'local', ... }
// ]
```

### Pourquoi Ollama ou MLX

- **Ollama** est déjà le runtime local de référence de GenOS (voir [MODELES_PROVIDERS.md](MODELES_PROVIDERS.md)) : `ollama://model-name`, découverte automatique via [localModelDiscovery.js](../backend/src/services/localModelDiscovery.js).
- **MLX** (Apple Silicon) expose typiquement un serveur compatible OpenAI (`mlx_lm.server`) ; il est donc joignable sans code supplémentaire via le provider générique `openai-compatible://`, en pointant `GENOS_OPENAI_COMPATIBLE_ENDPOINT` vers ce serveur — tirant pleinement parti de l'accélération matérielle unifiée sans dépendance native additionnelle.

### Valeur ajoutée

- **Coût** : les Symbiotes ne consomment aucun jeton d'API pour l'embedding et la validation, qui représentent la majorité de leurs appels ;
- **Latence** : embedding et validation de schéma s'exécutent en quelques millisecondes, contre des centaines de millisecondes pour un aller-retour cloud ;
- **Autorité préservée** : le Host reste seul décideur sur un modèle frontier ; le passage au local ne concerne que les tâches mécaniques des Symbiotes, jamais le jugement final.

---

## Références internes

- [ORCHESTRATION.md](ORCHESTRATION.md) : orchestration générale, gates et phases
- [A_TEAM.md](A_TEAM.md) : orchestration multidisciplinaire
- [TRINITY.md](TRINITY.md) : orchestration comparative
- [BIOCENOSE.md](BIOCENOSE.md) : orchestration communautaire
- [BIOLOGIE_COMPUTATIONNELLE.md](BIOLOGIE_COMPUTATIONNELLE.md) : cadre biologique général
- [MODELES_PROVIDERS.md](MODELES_PROVIDERS.md) : routage de modèles, providers locaux et cloud
- [biologicalModeService.js](../backend/src/services/biologicalModeService.js) : implémentation des quatre modes
- [symbioteRuntimeService.js](../backend/src/services/symbioteRuntimeService.js) : routage d'inférence asymétrique Cloud + Local des Symbiotes
- [holobionteService.js](../backend/src/services/holobionteService.js) : service Holobionte
- [immuneSystem.js](../backend/src/services/immuneSystem.js) : système immunitaire logique
- [agentOrchestrationState.js](../backend/src/services/agentOrchestrationState.js) : état partagé
- Commandes CLI : `genos-cli biological deploy --mode holobionte`
