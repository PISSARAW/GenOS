# ADR 0285 : Terminologie — Contrôleur multi-application sous contrat de capacités

## Statut
Accepté

## Date
2026-10-05

## Contexte
Le plan d'architecture (Lot D, étape 7) exige de remplacer le terme « contrôleur universel de bureau » par « contrôleur multi-application sous contrat de capacités ». Le terme « universel » implique une généralité non bornée, incompatible avec le principe de permissions explicites, allowlists, sandbox et leases de GenOS.

## Décision
**Terminologie officielle :**
- **Contrôleur multi-application sous contrat de capacités** (ou *Capability-Contracted Multi-Application Controller* — CCMAC)

**Termes interdits :**
- Contrôleur universel
- Contrôleur de bureau universel
- Universal desktop controller
- Agent tout-puissant / omnipotent
- Accès illimité au bureau / au système

## Définition opérationnelle du CCMAC
Un **CCMAC** est un composant logiciel qui :
1. **Expose une surface d'API bornée** : liste explicite d'actions (mouse_move, click, type, key, capture_screen)
2. **Exige un contrat de capacités signé** : lease MCP valide + allowlist domaines/applications autorisés
3. **S'exécute en sandbox** : isolation processus (Branch/VFS_Branch/Snapshot), pas d'accès direct FS/réseau hors contrat
4. **Produit des traces reproductibles** : captures d'écran, événements UI, états avant/après, hash d'intégrité
5. **Supporte la vérification différentielle** : comparaison intention → action → état final (test oracle)
6. **Possède un interrupteur d'urgence** : circuit breaker (ADR 0195) + autotomie (ADR 0041) + kill switch opérateur

## Mapping codebase actuel → CCMAC

| Composant | Rôle dans CCMAC | Fichier |
|-----------|-----------------|---------|
| Capture écran | Perception visuelle (entrée) | `crates/genos-sensorimotor/src/lib.rs:8-22` |
| Exécution actions | Effecteurs souris/clavier | `crates/genos-sensorimotor/src/lib.rs:34-144` |
| UIAutomation fallback | Interaction sémantique (boutons, champs) | `crates/genos-sensorimotor/src/lib.rs:81-97` |
| Lease MCP | Autorisation d'exécution | `mcp/lease.js`, `mcp/index.js` |
| Sandbox backend | Isolation exécution | `backend/src/middleware/security.js`, `orchestratorService.js` |
| Vérification Web Journey | Oracle intention/action/état | `backend/tests/test_web_journey_verifier.js` |
| Vision fovéale | Perception ciblée (réduit surface) | `backend/tests/test_foveal_vision.js`, ADR 0182a/0185 |

## Contrat de capacités (Capability Contract)
Tout déploiement CCMAC **doit** inclure un fichier `capability-contract.json` :
```json
{
  "version": "1.0",
  "controller": "genos-sensorimotor",
  "allowed_actions": ["mouse_move", "click", "type", "key", "capture_screen"],
  "allowed_domains": ["localhost:3000", "test-app.example.com"],
  "allowed_applications": ["notepad.exe", "code.exe", "chrome.exe --test-mode"],
  "max_session_duration_ms": 300000,
  "require_human_confirmation": ["click", "type"],
  "audit_level": "full",
  "emergency_stop": true
}
```
Le contrat est validé au démarrage par `mcp/lease.js` et `backend/src/middleware/auth.js`.

## Règles d'écriture
1. **Code** : Types nommés `CapabilityContract`, `MultiAppController`, `ActionTrace`
2. **Tests** : `test_ccmac_contract_enforcement`, `test_ccmac_sandbox_isolation`
3. **Documentation** : « Le CCMAC opère sous contrat explicite » — jamais « contrôle total »
4. **Logs** : Toute action préfixée `[CCMAC]` avec `contract_id`, `action`, `allowed: true/false`

## Enforcement
- **Gate CI** : Détection terme « universel » dans docs/commentaires user-facing
- **Schema validation** : `capability-contract.json` validé au build (JSON Schema)
- **Runtime** : `genos-sensorimotor` refuse toute action hors contrat (retourne erreur `CONTRACT_VIOLATION`)

## Conséquences
- Élimine l'ambiguïté « universel = tout pouvoir ».
- Force la spécification explicite des capacités (principe moindre privilège).
- Aligne avec architecture leases/sandbox/evidence gates (Lots C, E).
- Rend le système auditable : chaque action tracée à un contrat signé.

## Références
- Plan architecture GenOS V3, Lot D, étape 7
- ADR 0182a/0185 (navigation web session explicite)
- ADR 0146 (substrat perceptif)
- ADR 0044 (matrice autorité, gates double runtime)
- ADR 0195 (enforcement métabolique cellule de garde)
- `crates/genos-sensorimotor/src/lib.rs`
- `mcp/lease.js`