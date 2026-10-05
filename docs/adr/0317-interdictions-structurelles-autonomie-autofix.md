# ADR 0286 : Interdictions structurelles — Autonomie illimitée, Auto-promotion, Autofix sans lease, Réécriture historique silencieuse

## Statut
Accepté — Coercitif (gate CI bloque toute violation)

## Date
2026-10-05

## Contexte
Le plan d'architecture (Lots C et E) identifie quatre patterns architecturaux **structurellement interdits** car ils violent les principes fondateurs de GenOS : bornes d'autorité, evidence gates, réversibilité, traçabilité. Ces interdictions doivent être codifiées en règles coercitives vérifiées au CI.

## Décision
Quatre **interdictions absolues** (statut **OUT** dans matrice ADR 0283) sont promues au rang de règles d'architecture coercitives. Toute violation détectée au CI (build, test, pre-commit) **bloque le merge**.

---

### 1. Autonomie illimitée de l'orchestrateur (OUT)
**Règle** : Aucun composant ne peut prendre de décision morphogénétique, de promotion, de redémarrage système ou d'allocation de budget sans passer par `GovernancePlane::validate()` ou équivalent.

**Implémentation de référence** : `crates/genos-orchestrator/src/kernel_governance.rs`
```rust
// TOUJOURS requis :
let decision = governance_plane.validate(&GovernanceInput {
    plan: &morphogenesis_plan,
    authority: "orchestrator_principal",  // ou autorité déléguée explicite
    risk_level: computed_risk,
    degraded_mode: is_degraded,
});
if !decision.allowed { return Err(decision.reason); }
```

**Patterns interdits** (détectés par grep CI) :
- `allow_unchecked` / `bypass_governance` / `force_promotion` / `unlimited_authority`
- Appel direct `execute_plan()` sans `validate()` préalable
- `principal_authority` contourné par variable d'env ou config

**Test de régression** : `crates/genos-orchestrator/tests/kernel_control.rs` — scénario escalade refusée.

---

### 2. Auto-autorisation d'une promotion (OUT)
**Règle** : Aucun agent, worker, orchestrateur ou daemon ne peut s'auto-promouvoir (changer son propre niveau d'autorité, ses permissions, son rôle, son budget) sans approbation externe tracée.

**Implémentation de référence** : `kernel_governance.rs:53-58`
```rust
if !input.plan.governance_requirements.is_empty() {
    return GovernanceDecision {
        allowed: false,
        reason: "approbation requise avant execution",
        required_approvals: input.plan.governance_requirements.clone(),
    };
}
```

**Patterns interdits** :
- `self.promote()` / `self.grant_permission()` / `self.elevate_privileges()`
- Modification `governance_requirements` à vide avant validation
- Lease MCP s'auto-attribuant des outils (`GENOS_MCP_LEASE` modifié par le processus lui-même)

**Test de régression** : `backend/tests/test_mcp_server_parity.js` — lease ne peut s'étendre lui-même.

---

### 3. Autofix / réparation sans lease (OUT)
**Règle** : Toute écriture sur le système de fichiers, le code, la configuration, l'historique Git, la base de données **doit** être couverte par un lease valide, émis par une autorité externe, avec expiration et portée bornée.

**Implémentation de référence** :
- `mcp/lease.js:39-50` — `toolIsLeased()` fail-closed
- `crates/genos-orchestrator/src/kernel_morphogenesis_lease.rs` — `MorphogenesisLease` avec `expires_at`, `scope`, `revocable`
- `backend/src/middleware/security.js` — validation workspace isolation

**Patterns interdits** :
- `fs.writeFile()` / `git commit` / `db.execute()` sans `lease_id` dans le contexte
- `GENOS_MCP_LEASE` absent ou expiré → écriture autorisée (fail-open)
- Worktree/snapshot non utilisé pour modification risquée
- Pas de `snapshot_before` + `snapshot_after` + diff vérifié

**Test de régression** :
- `backend/tests/test_agent_git_remote_ssrf.js` — écriture Git sans lease bloquée
- `crates/genos-orchestrator/tests/process_sandbox.rs` — isolation vérifiée

---

### 4. Réécriture historique silencieuse / Autofix historique (OUT)
**Règle** : Aucune modification de l'historique partagé (Git history, event log, fossil record, biological receipts, lineage archive) n'est permise sans :
1. Lease explicite `history_rewrite` (niveau critique)
2. Approbation humaine tracée (multi-sig si possible)
3. Conservation de l'état antérieur accessible (snapshot/fossil)
4. Justification documentée + rollback testé

**Implémentation de référence** :
- `crates/genos-store/src/fossil.rs` — `verify_integrity()` détecte toute altération
- `crates/genos-store/src/biological_receipt.rs` — reçus immuables, hash chain
- `crates/genos-store/src/continuation_wal.rs` — WAL append-only
- `crates/genos-orchestrator/src/clinical_therapy.rs` / `authorized_therapy.rs` — thérapie = réparation réversible, pas réécriture

**Patterns interdits** :
- `git rebase --force` / `git push --force` sans lease `history_rewrite` + approval
- `event_store.rewrite()` / `fossil_registry.alter()` / `receipt.chain.modify()`
- `autofix_historical()` / `rewrite_history()` / `silent_correction()`
- Suppression `soft_parts_lost` sans trace dans nouveau stratum

**Test de régression** :
- `crates/genos-store/tests/fossil_tampering_detection.rs` (existant : `test_fossilization_detects_tampering`)
- `backend/tests/test_biological_receipt_ingestion.js` — chaîne immuable vérifiée

---

## Mécanisme d'enforcement CI

### Script de vérification : `scripts/ci/check_structural_prohibitions.py`
À créer (voir Item 3 infrastructure). Vérifie :
1. **Grep patterns interdits** sur codebase (liste maintenue dans `scripts/ci/prohibited_patterns.yaml`)
2. **Analyse AST Rust/JS** : détection appels directs `execute_plan`, `write_file`, `git_commit` sans garde `lease`/`governance`
3. **Vérification tests de régression** : chaque interdiction a au moins un test `test_<interdiction>_blocked` passant
4. **Validation schemas** : `capability-contract.json`, `lease` format, `morphogenesis_plan` require `governance_requirements`

### Pre-commit hook (`.githooks/pre-commit`)
```bash
#!/bin/bash
python scripts/ci/check_structural_prohibitions.py --staged || exit 1
```

### Liste patterns surveillés (extensible)
```yaml
# scripts/ci/prohibited_patterns.yaml
rust:
  - "bypass_governance"
  - "force_promotion"
  - "unlimited_authority"
  - "self\\.promote\\("
  - "self\\.grant_permission\\("
  - "fs::write\\("      # sans lease context
  - "git::commit\\("    # sans lease context
javascript:
  - "bypassGovernance"
  - "forcePromotion"
  - "unlimitedAuthority"
  - "self.promote("
  - "fs.writeFile("     # sans lease
  - "execSync("         # sans sandbox check
```

---

## Processus d'exception (rare, tracée)
Une exception **temporaire** (max 1 release) peut être accordée par :
1. ADR dédié (ex: `0286-exception-<concept>-<date>.md`)
2. Vote unanime 3 maintainers
3. Plan de remédiation avec deadline
4. Test de régression ajouté **avant** l'exception
5. Marqueur `// ALLOWED_EXCEPTION: ADR-XXXX` dans le code (grep-able)

Aucune exception permanente n'est acceptée.

---

## Conséquences
- **Sécurité** : Élimine classes entières de vulnérabilités (privilege escalation, silent corruption, supply chain)
- **Auditabilité** : Toute action sensible tracée à un lease + approbation
- **Réversibilité** : Snapshot avant/après obligatoire → rollback toujours possible
- **Confiance** : Tierces parties peuvent vérifier l'absence de backdoors architecturaux

## Références
- Plan architecture GenOS V3, Lots C (étapes 2,4,5) et E (étapes 1,3,5,7)
- ADR 0044 (matrice autorité), ADR 0045 (noyau contrôle morphogenèse)
- ADR 0058 (niveaux veto), ADR 0197 (HGT sous lease)
- ADR 0145 (rollout contrôlé réversible), ADR 0253 (monitoring somatique GVX)
- `kernel_governance.rs`, `kernel_morphogenesis_lease.rs`, `mcp/lease.js`
- `crates/genos-store/` (fossil, receipt, continuation_wal — append-only par design)