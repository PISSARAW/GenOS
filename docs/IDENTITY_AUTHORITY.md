# Identité et autorité dans GenOS

## 1. Objet et périmètre

Cette documentation décrit le modèle d’identité, d’authentification et d’autorité déjà présent dans le dépôt GenOS. Elle ne décrit pas un futur IAM générique : elle reflète le comportement effectif du runtime backend, des routes REST, des services gRPC, de la CLI et des règles d’orchestration entre agents.

Le système actuel repose sur :

- des secrets d’accès et sessions stockés dans SQLite ;
- une validation par hachage SHA-256 plutôt qu’un stockage en clair ;
- des rôles hiérarchiques (`admin`, `operator`, `viewer`) ;
- des permissions explicites (`all`, `read`, `workspace:write`, `experiment:run`, etc.) ;
- un découpage tenant basé sur `organization_id` + `project_id` ;
- une hiérarchie stricte entre orchestrateurs et workers ;
- des garde-fous d’autorité pour arrêter, lancer, relancer, forker ou déléguer des agents.

Les références de code les plus importantes sont :

- [backend/src/middleware/auth.js](../backend/src/middleware/auth.js)
- [backend/src/middleware/tenant.js](../backend/src/middleware/tenant.js)
- [backend/src/services/agentAuthorityService.js](../backend/src/services/agentAuthorityService.js)
- [backend/src/controllers/authController.js](../backend/src/controllers/authController.js)
- [backend/src/grpc_services/grpcAuth.js](../backend/src/grpc_services/grpcAuth.js)
- [backend/src/db/schema-tables-core.js](../backend/src/db/schema-tables-core.js)
- [mcp/lease.js](../mcp/lease.js)

---

## 2. Définition du modèle

GenOS traite l’identité comme un couple :

- un principal authentifié : humain, service, clé d’API, session de navigateur ou agent système ;
- un contexte d’exécution : `organization_id`, `project_id`, `workspace_id`, `parent_agent_id`, `execution_mode`.

Le principal n’est pas seulement une “personne” ; c’est une entité avec :

- un rôle (`role`) ;
- un ensemble de permissions (`permissions`) ;
- un identifiant technique (`keyId`, `username`, `session.id`) ;
- un périmètre de référence (tenant / workspace / agent parent).

Le point clé est que l’authentification et le contexte d’autorité sont séparés.

- L’authentification valide que le principal existe et est actif.
- L’autorité vérifie ensuite si ce principal est autorisé à faire une action dans le bon tenant, la bonne workspace et à l’endroit correct de l’arbre d’agents.

Cela évite qu’un principal validé globalement puisse agir sans limite sur toute la plateforme.

---

## 3. Éléments concrets du dépôt

### 3.1 Authentification API

Le flux principal est dans [backend/src/middleware/auth.js](../backend/src/middleware/auth.js).

- `resolveUserFromHeaders(headers)` lit `Authorization` ou `x-access-key`.
- Si le jeton est un `Bearer ...`, il est nettoyé puis haché avec SHA-256.
- La clé est recherchée dans `access_keys` :
  - `key_hash`
  - `is_active = 1`
  - `expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP`
- Si la clé n’est pas trouvée, on teste `sessions` avec `token_hash` et `revoked = 0`.
- En cas de succès, le middleware retourne un objet utilisateur avec `role`, `permissions`, `isAuthenticated`, `keyId`.

L’API est doonnée par :

- `Authorization: Bearer <token>`
- ou `x-access-key: <token>`

### 3.2 Sessions et clés d’accès

Le schéma de base est dans [backend/src/db/schema-tables-core.js](../backend/src/db/schema-tables-core.js) :

```sql
CREATE TABLE IF NOT EXISTS access_keys (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'operator', 'viewer', 'commander', 'architect', 'node')),
  permissions TEXT NOT NULL DEFAULT '["read"]',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  last_used_at DATETIME,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'viewer',
  username TEXT NOT NULL DEFAULT 'operator',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  revoked INTEGER DEFAULT 0
);
```

Le flux de création de clé est dans [backend/src/controllers/authController.js](../backend/src/controllers/authController.js), avec :

- `createKey()`
- `rotateKey()`
- `revokeKey()`
- `revokeSession()`

Le secret n’est jamais stocké en clair ; on stocke uniquement son hash.

### 3.3 RBAC et permissions

Le mapping des rôles est défini dans [backend/src/middleware/auth.js](../backend/src/middleware/auth.js) :

```js
const ROLE_PERMISSIONS = {
  admin: ['all', 'read', 'workspace:write', 'workspace:delete', ...],
  operator: ['read', 'workspace:write', 'experiment:write', ...],
  viewer: ['read', 'telemetry:read']
};
```

Les contrôles d’accès sont appliqués par :

- `requirePermission(permission)`
- `requireRole(allowedRoles)`
- `requireAuthentication()`

L’implémentation est simple et robuste :

- si le principal a `all`, il passe;
- sinon il doit posséder la permission demandée;
- s’il n’est pas authentifié, réponse `401`;
- s’il est authentifié mais sans droit, réponse `403`.

Donc, mathématiquement, le contrôle est :

$$
\text{allow}(p, a) = \big(p.isAuthenticated \land (\text{all} \in p.permissions \lor a \in p.permissions)\big)
$$

où :

- $p$ est le principal ;
- $a$ est la permission demandée.

---

## 4. Mathématiques du modèle d’autorité

GenOS applique un modèle d’autorisation composite à 3 dimensions :

1. identité du principal ;
2. scope tenant ;
3. relation d’autorité avec l’agent ou le workspace cible.

### 4.1 La règle de scope tenant

Le scope tenant est calculé dans [backend/src/middleware/tenant.js](../backend/src/middleware/tenant.js).

Le système exige que si un client fournit un `x-organization-id`, il fournisse aussi un `x-project-id` :

```js
if (!organizationId && !projectId) return null;
if (!organizationId || !projectId) {
  throw new Error('X-Organization-Id and X-Project-Id must be provided together');
}
```

Ensuite, il valide :

- que le `project_id` appartient à `organization_id` ;
- que l’utilisateur est membre de l’organisation / projet ;
- que le statut du projet n’est pas archivé pour les opérations d’écriture.

Formellement :

$$
\text{tenantValid}(u, o, p) = \text{membership}(u, o) \land \text{projectBelongsToOrg}(p, o)
$$

et

$$
\text{writeAllowed}(u, o, p) = \text{tenantValid}(u, o, p) \land (\text{role}(u) \in \{owner, admin, member\} \lor \text{all} \in permissions(u))
$$

### 4.2 Autorité d’agent

Dans [backend/src/services/agentAuthorityService.js](../backend/src/services/agentAuthorityService.js), trois fonctions cadrent la hiérarchie :

- `requireOrchestrator(db, agentId, workspaceId)`
- `authorizeMission(db, agentId, orchestratorAgentId, workspaceId)`
- `authorizeAgentControl(db, targetId, actorId, workspaceId)`

Les règles décisives sont :

- seul un agent en `execution_mode = 'orchestrator'` peut orchestrer d’autres agents ;
- un worker ne peut exécuter que si `parent_agent_id = orchestratorAgentId` ;
- le worker et l’orchestrateur doivent être dans la même `workspace_id` ;
- un agent ne peut contrôler un autre agent que s’il est lui-même l’agent cible ou son orchestrateur.

Cela peut être représenté comme :

$$
\text{canDispatch}(w, o) = [w.executionMode = worker] \land [w.parent = o] \land [w.workspace = o.workspace]
$$

et

$$
\text{canControl}(a, t) = [a=t] \lor [a.executionMode = orchestrator \land a.workspace = t.workspace] \lor [a.id = t.parentAgentId]
$$

---

## 5. Biologie du modèle d’autorité

GenOS exploite une métaphore biologique pour rendre la gouvernance compréhensible, sans l’absurde : la logique continue d’être une règle d’autorité et non une théorie biologique.

### 5.1 Orchestrateur = noyau de décision

L’orchestrateur est le “noyau décisionnel” d’un groupe d’agents. Dans les tables SQLite, il se distingue par :

- `execution_mode = 'orchestrator'`
- éventuellement `parent_agent_id` nul ou absent
- rôle de superviseur de workers

Un worker est un sous-agent :

- `execution_mode = 'worker'`
- `parent_agent_id = orchestrator.id`

### 5.2 Lien entre l’arbre agent et la sécurité

Le dépôt s’appuie sur la relation hiérarchique :

- les workers ne peuvent pas se lancer eux-mêmes ;
- ils ne peuvent pas se “déclencher” hors de leur orchestrateur;
- ils ne peuvent pas réécrire le scope d’un workspace sans vérification ;
- l’orchestration devient une “cellule mère” contrôlant des sous-cellules.

Cela fait de cette hiérarchie un mécanisme de confinement et de séparation des responsabilités.

### 5.3 Immunité / contournement de l’usurpation

Le projet porte des concepts en bio-sécurité — chaperones, apoptosis, quarantine —, mais le code explicite que ce n’est pas une certification de sécurité absolue. L’important est l’application de la politique de contrôle et du verrouillage de scope.

Le système protège notamment :

- contre la fuite de scope tenant ;
- contre les workers hors_workspace ;
- contre les parties qui n’ont pas la permission de lancer, stopper ou forker ;
- contre les agents qui prétendent être l’orchestrateur sans être assignés à la même workspace.

---

## 6. Autorité de lancement, arrêt, fork et délégation

### 6.1 Lancement de mission

Le lancement de mission passe par le service d’adaptation runtime : [backend/src/services/agentRuntimeAdapter.js](../backend/src/services/agentRuntimeAdapter.js).

Avant de démarrer, le runtime vérifie :

- `agentId` est valide ;
- le worker/orchestrateur est autorisé ;
- le workspace est valide ;
- le budget de mission est cohérent ;
- le contrat de stratégie existe ;
- le workspace d’exécution est provisionné.

Le point clé : `authorizeMission()` fait le contrôle hiérarchique avant exécution.

### 6.2 Arrêt d’une mission

Le backend expose des opérations de fin de mission via [backend/src/controllers/commandController.js](../backend/src/controllers/commandController.js) et [backend/src/services/agentRuntimeAdapter.js](../backend/src/services/agentRuntimeAdapter.js).

Un arrêt peut être :

- un `stopMission` ciblé ;
- un `stopAllMissions` global ;
- un `kill_agent` avec confirmation explicite.

Le code exige souvent une confirmation (`confirmed: true`) pour les actions destructrices.

### 6.3 Fork / création d’agent

Le dépôt implémente le fork de ligne de vie via la notion de `parent_agent_id` et le clone d’éléments de lineage.

Le `Command Palette` et les services de ligne de vie peuvent déclencher un fork avec un parent donné, mais ils vérifient que l’agent existe et est disponible dans le bon scope.

### 6.4 Délégation / workers autonomes

Le runtime crée des workers autonomes dans un orchestrateur. Cela est visible dans [backend/src/services/agentRuntimeAdapter.js](../backend/src/services/agentRuntimeAdapter.js) :

- l’orchestrateur construit un plan d’autonomie ;
- il crée les workers ;
- il leur attribue un `parent_agent_id` ;
- il impose une barrière de preuve avant synthèse finale.

Cela signifie que la délégation n’est pas un “agent libre” : c’est un fil d’exécution autorisé, enraciné dans un orchestrateur légitime.

---

## 7. Appartenance tenant

### 7.1 Scope global vs tenant-scoped

Le système présente un modèle bidimensionnel :

- global / non-tenant : objets sans `organization_id` / `project_id` ;
- tenant-scoped : objets associés à un couple `organization_id` + `project_id`.

Les routes réutilisent `requireTenantScope()` dans [backend/src/middleware/tenant.js](../backend/src/middleware/tenant.js). Cela force le périmètre :

- si un tenant est fourni, toutes les entités cibles doivent appartenir à ce tenant ;
- sinon, une erreur `TENANT_SCOPE_REQUIRED` est renvoyée.

### 7.2 Membership et project scope

Le model de résolution :

```js
const membership = await db.get(
  `SELECT COALESCE(pm.role, om.role) AS role
   FROM organization_memberships om
   LEFT JOIN project_memberships pm ON pm.project_id = ? AND pm.principal_id = om.principal_id
   WHERE om.principal_id = ? AND om.organization_id = ?
     AND pm.project_id IS NOT NULL`,
  projectId, principalId(user), organizationId
);
```

Ainsi :

- l’appartenance à l’organisation est obligatoire ;
- l’appartenance au projet est vérifiée avant écriture ;
- les permissions `all` permettent un bypass global, mais c’est un mécanisme d’administrateur explicite.

---

## 8. Rotation et révocation des credentials

### 8.1 Révocation

Dans [backend/src/controllers/authController.js](../backend/src/controllers/authController.js) :

```js
UPDATE access_keys SET is_active = 0 WHERE id = ? AND is_active = 1
```

et

```js
UPDATE sessions SET revoked = 1 WHERE id = ? AND revoked = 0
```

Après révocation :

- la clé ou la session ne peut plus être utilisée ;
- le système enregistre un événement de télémétrie ;
- les routes auth se comportent comme si la référence n’existait plus.

### 8.2 Rotation

`rotateKey()` :

1. lit la clé existante ;
2. crée un nouveau secret généré ;
3. désactive la clé précédente ;
4. insère la nouvelle clé avec le même label / rôle / permissions ;
5. enregistre un événement `AUTH_KEY_ROTATED`.

Cela évite la persistance du même secret sur des périodes indéfinies.

### 8.3 Expiration

Les accès sont généralement validés comme :

```sql
(expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
```

Cela permet des secrets temporaires, notamment dans des déploiements ou pipelines de CI.

---

## 9. Authentification REST, gRPC, MCP et CLI

### 9.1 REST

Le backend utilise des headers d’authentification standard :

- `Authorization: Bearer <token>`
- `x-access-key: <token>`

Les routes de type API sécurité et tenant sont protégées par `requirePermission`, `requireRole` et `requireTenantScope`.

### 9.2 gRPC

Le contrôle gRPC est dans [backend/src/grpc_services/grpcAuth.js](../backend/src/grpc_services/grpcAuth.js).

Les services acceptent :

- metadata `x-genos-grpc-key`
- ou `authorization: Bearer ...`

Le code rejette la connexion si la clé n’est pas fournie ou si elle ne correspond pas au secret partagé configuré par `GENOS_GRPC_SHARED_SECRET`.

### 9.3 MCP

Le MCP est géré par un système de leasing de tools dans [mcp/lease.js](../mcp/lease.js).

Le modèle n’est pas un SSO sur tous les outils : c’est un contrôle d’exposition des outils. Une tool est exposée seulement si elle est dans la liste de leasing ou si l’environnement autorise une exposition par défaut explicite.

Le système applique :

- `GENOS_MCP_LEASE`
- `GENOS_MCP_DISABLED_TOOLS`
- `GENOS_MCP_EXPOSE_ALL`
- `GENOS_MCP_ALLOW_UNSAFE_EXPOSE_ALL`

C’est important pour un principe de moindre privilège : l’outil ne doit pas être accessible simplement parce qu’un agent est connecté.

### 9.4 CLI

Dans [crates/genos-simple-cli/src/main.rs](../crates/genos-simple-cli/src/main.rs), la CLI envoie automatiquement le token via `Authorization: Bearer` si `GENOS_API_KEY` ou `GENOS_API_TOKEN` est défini.

La CLI natif de Rust et le backend utilisent donc le même principe d’authentification de transport, mais dans un contexte de script / automation.

---

## 10. Protection contre l’usurpation d’agent ou d’organisation

GenOS met en place plusieurs garde-fous :

### 10.1 Vérification d’identité de l’agent

`authorizeMission()` vérifie :

- le worker appartient bien à l’orchestrateur ;
- le worker est dans la même workspace ;
- l’orchestrateur est bien un orchestrateur, pas un worker ;
- la mission n’est pas lancée dans un état “quarantined”.

### 10.2 Vérification de scope tenant

`requireTenantScope()` refuse toute opération si le couple `organization_id` + `project_id` est absent ou invalide.

### 10.3 Vérification d’autorité de contrôle

`authorizeAgentControl()` interdit qu’un agent non parent ou non orchestrateur contrôle un autre agent.

### 10.4 Quarantaine et protection du runtime

Dans [backend/src/services/agentAuthorityService.js](../backend/src/services/agentAuthorityService.js) :

```js
if (agent.status === 'quarantined' || agent.isolation_mode === 'Quarantine') {
  throw authorityError('AGENT_QUARANTINED', ...);
}
```

C’est une forme de “containment” fonctionnelle : un agent mis en quarantaine ne peut pas exécuter de nouvelle mission.

### 10.5 Chiffrement des secrets au repos

Le dépôt stocke les secrets hachés et non lisibles en clair. C’est une première couche importante, même si le projet n’expose pas un système HSM ou un PKI complet.

---

## 11. Exemple d’usage

### 11.1 Exemple REST

```bash
curl -H "Authorization: Bearer genos_sk_operator_abc123" \
  -H "x-organization-id: org-42" \
  -H "x-project-id: proj-99" \
  http://localhost:3000/api/workspaces
```

Cela ne fonctionnera que si :

- la clé existe et est active ;
- elle n’est pas expirée ;
- le principal appartient au tenant `org-42 / proj-99` ;
- le rôle a la permission nécessaire.

### 11.2 Exemple d’orchestration

```text
Orchestrateur O1
  ├─ Worker W1 (parent_agent_id = O1)
  ├─ Worker W2 (parent_agent_id = O1)
  └─ Worker W3 (parent_agent_id = O1)
```

Règles :

- `W1` ne peut pas démarrer une mission sans `O1` ;
- `W1` ne peut pas être dans une workspace différente de `O1` ;
- `W1` ne peut pas agir comme orchestrateur sur un autre worker ;
- `O1` ne peut pas utiliser les worker d’un autre tenant.

### 11.3 Exemple de rotation

```text
createKey() -> rawKey = genos_sk_operator_xxx
rotateKey() -> old key disabled, new key generated
revokeKey() -> key inactive, any request rejected
```

---

## 12. Schéma d’architecture

```mermaid
flowchart TD
    U[User / Service / Agent] --> A[REST / gRPC / MCP / CLI]
    A --> M1[Auth Middleware]
    M1 --> V1{Valid credential?}
    V1 -- no --> REJECT[401 Unauthorized]
    V1 -- yes --> RBAC{Has required permission?}
    RBAC -- no --> FORBID[403 Forbidden]
    RBAC -- yes --> T[Tenant Scope Resolver]
    T --> TS{organization + project valid?}
    TS -- no --> TFAIL[403 / 409]
    TS -- yes --> H[Agent Authority Service]
    H --> O{Is orchestrator / worker relation valid?}
    O -- no --> CTRLFAIL[AGENT_CONTROL_FORBIDDEN]
    O -- yes --> R[Runtime / Workspace / MCP / Strategy]
    R --> E[Telemetry + audit events]
```

---

## 13. Processus d’autorisation complet

1. Le client envoie un jeton ou une clé dans le header.
2. Le middleware hache la valeur et vérifie `access_keys` puis `sessions`.
3. Si authentifié, il construit le principal avec `role` et `permissions`.
4. `requireTenantScope()` applique le périmètre `organization + project`.
5. `requirePermission()` ou `requireRole()` applique la règle de privilège.
6. `authorizeMission()` ou `authorizeAgentControl()` valide la hiérarchie agent/workspace.
7. L’action est exécutée.
8. Les événements sont écrits en télémétrie / audit.

Ce modélisme rend les décisions explicites et traçables.

---

## 14. Comparaison avec ce qui existe sur le marché

### 14.1 Comparaison rapide

| Domaine | GenOS | Systèmes du marché | Commentaire |
|---|---|---|---|
| Auth API | Clés d’accès + sessions + permissions | OAuth2 / OIDC / API keys / JWT | GenOS est plus simple, plus centré runtime que sur le standard IdP |
| RBAC | admin / operator / viewer + permissions | RBAC/ABAC/Policy-as-Code | GenOS met l’accent sur le runtime et le tenant, pas sur la fédération OAuth |
| Tenant | `organization_id` + `project_id` | tenant / account / org | Aligné sur le besoin multi-projet et multi-workspace |
| Autorité agent | orchestrator/worker + `parent_agent_id` | Kubernetes RBAC, service accounts, job controllers | GenOS a une hiérarchie d’agents plus “runtime native” |
| Revocation | `is_active = 0`, `revoked = 1` | token revocation, cert rotation | Similaire mais plus léger et plus local |
| gRPC auth | shared secret + metadata | mTLS / JWT / OIDC | Cohérent avec un interne service-to-service minimal |
| MCP governance | leasing de tools | tool allowlists, policy engines | GenOS gère les permissions via `GENOS_MCP_LEASE` et `toolIsLeased()` |

### 14.2 Ce que GenOS fait bien

- identifie clairement les tenants projets et workspaces ;
- sépare authentification et scope ;
- maintient une hiérarchie explicite entre agents ;
- autorise la rotation et la révocation sans surprise ;
- protège les actions de lancement / arrêt / fork ;
- intègre les flux REST, gRPC, MCP et CLI de manière cohérente.

### 14.3 Ce qu’il n’a pas encore

- pas de système d’identité fédéré OIDC/Entra/Azure AD ;
- pas d’ABAC avancé ou d’IDP multi-tenant de niveau enterprise ;
- pas de mTLS avancée par défaut pour le transport gRPC ;
- pas d’interface de “policy engine” à la façon des solutions IAM commerciales ;
- pas de stockage de secrets sur une KMS / vault externe.

Autrement dit : GenOS est un système d’autorité “opérationnelle pour agents” plus qu’un IAM multi-entreprise complet.

---

## 15. Points d’attention / limites

1. Le stockage des secrets est hashé, mais pas injecté dans un système de sécurité matériel avancé.
2. Le modèle se base sur des règles de code et une base SQLite, pas sur un cadre d’authorization centralisé.
3. Les contrôles d’autorité agent sont forts dans les cas de runtime local, mais dépendent aussi de la rigueur des appels de service et de la cohérence du workspace.
4. L’usurpation d’organisation est contenue par le tenant scope, mais ne remplace pas unauthenticated external trust, mTLS ou un IAM fédéré.
5. Les rôles sont simples et lisibles, mais restent limités à un modèle RBAC chargé d’exécution, pas à une politique de “least-privilege” extrêmement dynamique.

---

## 16. Synthèse

Le cœur de l’identité et de l’autorité dans GenOS est un modèle de gouvernance de runtime :

- authentifier le principal ;
- vérifier son scope tenant ;
- vérifier ses permissions ;
- vérifier la relation parent / orchestrateur / workspace ;
- autoriser seulement les actions nécessaires ;
- créer des traces à travers la télémétrie.

Ce n’est ni un simple token-check, ni un système de sécurité “biologique”; c’est un système d’autorité explicite pour un écosystème d’agents. Sa force est sa clarté de concept : chaque action doit être valable à la fois pour le principal, le tenant et l’arbre d’autorité.

C’est précisément ce qui permet de protéger les opérations critiques : lancement, arrêt, fork, délégation, rotation de credential, ou exécution de tooling MCP.
