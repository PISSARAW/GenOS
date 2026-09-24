# Dynamic Garage Capacity Pattern

## Problem

The orchestrator's worker garage was a static `config.maxActiveWorkers()` for all missions. This caused two failures:
- Trinity (needs 3 workers) would silently fail if max was < 3
- Mission needing more branches than max would hit `WORKER_GARAG_FULL` instead of getting a proper sizing decision

## Solution: `garageCapacityService.js`

Decides garage capacity per mission based on three signals:
1. **Contract branches** — `contract.branches.length` (parallel strategy hypotheses)
2. **Topology** — fixed requirements: `dispatch_trinity` = 3, `dispatch_team` = N members, `dispatch_biological` = N, `dispatch_worker` = 1
3. **Team members** — `teamMembers.length` (for A-Team with explicit composition)

### Algorithm

```
required = max(branches, topologyWorkerCount, teamMembers)
capacity = clamp(required, 1, systemMax)
adapted = (required > systemMax)
```

### Trinity invariant

Trinity **always** requires exactly 3 workers. Even if `systemMax < 3`, the capacity is forced to 3 and `adapted` remains false — the system must be reconfigured rather than silently degrade the topology.

### Output shape

```js
{
  required: 5,
  systemMax: 8,
  sufficient: true,       // false when required > systemMax
  topology: 'dispatch_team',
  contractBranches: 1,
  teamMembers: 5,
  capacity: 5,            // final decision
  adapted: false,         // true when capped at systemMax
  rationale: 'Capacity matches requirement.'
}
```

## Wiring

### `workerGarageService.js`

Dynamic capacity is per-orchestrator via `Map<orchestratorId, capacity>`:

| Function | Role |
|----------|------|
| `setDynamicCapacity(id, capacity)` | Called from `genos-orchestrate.cjs` before `startMission()` |
| `getDynamicCapacity(id)` | Used by `state()`, `requireAvailableSlot()`, `reserveSlot()` |
| `releaseDynamicCapacity(id)` | Cleanup on mission end (optional) |

Default fallback: if no dynamic capacity set for the orchestrator, returns `config.maxActiveWorkers()` (preserves backward compatibility).

### `orchestratorMissionHelpers.cjs` → `prepareMission()`

```js
const strategyContract = await contracts.saveContract(db, { ... });
const garageDecision = decideGarageCapacity({
  contract: strategyContract.contract,
  topology: request.action
});
// Persist in metadata_json for audit trail
const metadataJson = mergeMetadataJson(existing?.metadata_json, {
  nceMetadata,
  garageCapacity: garageDecision.capacity,
  garageDecision
});
// Return garageDecision to caller
return { strategyContract, missionBudget, useLocalRuntime, requestTimeoutMs, garageDecision };
```

### `genos-orchestrate.cjs`

```js
const { strategyContract, missionBudget, useLocalRuntime, requestTimeoutMs, garageDecision } = await prepareMission({ ... });
const workerGarage = require('../src/services/workerGarageService');
workerGarage.setDynamicCapacity(id, garageDecision.capacity);
await startOrchestratorMission({ ... });
```

### `topologyHandlers.cjs`

Uses `workerGarage.getDynamicCapacity(context.orchestratorId)` in output payloads instead of static `workerGarage.MAX_ACTIVE_WORKERS`.

## Test scenarios (validated)

| Scenario | Required | Max | Capacity | Adapted |
|----------|----------|-----|----------|---------|
| Single worker, no contract | 1 | 8 | 1 | false |
| Trinity | 3 | 8 | 3 | false |
| Team, 2 members | 2 | 8 | 2 | false |
| Contract with 4 branches | 4 | 8 | 4 | false |
| Contract with 12 branches | 12 | 8 | 8 | **true** |
| Team with 5 members | 5 | 8 | 5 | false |

## Pitfall: do NOT persist dynamic capacity

Dynamic capacity is process-local (`Map`). Do not store it in SQLite — it resets on backend restart. The `metadata_json` field on the agent is an audit record, not the live source. On restart, the next `setDynamicCapacity` call re-establishes it.
