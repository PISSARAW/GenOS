# GenOS Python SDK Integration Guide

The GenOS Python SDK (`genos-sdk`) provides an asynchronous, strongly-typed interface for orchestrating counterfactual simulations, isolated workspaces, agent state checkpoints, and hypothesis-driven debugging.

---

## 1. Installation & Environment Setup

Install the SDK via pip or uv:

```bash
pip install genos-sdk pydantic httpx asyncio
```

Configure environment variables:
```bash
export GENOS_ROOT="/path/to/project/.genos"
export GENOS_BIN="/usr/local/bin/genos"
export GENOS_WORKSPACE_ROOT="/path/to/project"
```

---

## 2. Pydantic v2 Protocol Data Models

The SDK maps all wire representations into strict Pydantic v2 models:

```python
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ProtocolResult(BaseModel):
    """Encapsulates standard GenOS protocol response envelope."""

    protocol_version: str = Field(default="genos.protocol/v1alpha1")
    operation: str
    exit_code: int
    output: Optional[Dict[str, Any]] = None
    stdout: str
    stderr: str
    is_tainted: bool = False

    @property
    def is_success(self) -> bool:
        return self.exit_code == 0


class CapsuleState(BaseModel):
    """Tracks live agent capsule state and resource consumption."""

    capsule_id: str
    agent_id: str
    world_id: str
    status: str
    budget_remaining: int
    step_count: int


class HypothesisNode(BaseModel):
    """Falsification tree hypothesis element."""

    id: str
    claim: str
    confidence: float = Field(ge=0.0, le=1.0)
    status: str
    evidence_sources: List[str] = Field(default_factory=list)


class DecisionRecord(BaseModel):
    """Living Architecture Decision Record."""

    title: str
    alternatives: List[str] = Field(default_factory=list)
    evidence: List[str] = Field(default_factory=list)
    code_refs: List[str] = Field(default_factory=list)
```

---

## 3. Asynchronous Client Usage (`GenOSClient`)

The `GenOSClient` handles JSON-RPC 2.0 communication over STDIO or HTTP. All SDK methods strictly adhere to **max 3 parameters**:

```python
import asyncio
from genos import GenOSClient


async def run_diagnosis_workflow():
    async with GenOSClient(workspace_root=".") as client:
        # Step 1: Formulate hypotheses
        diagnosis = await client.dev.diagnose(
            problem="Worker deadlock under load",
            hypotheses=["Queue exhaustion", "Lock inversion"],
        )
        print(f"Created Diagnosis: {diagnosis.diagnosis_id}")

        # Step 2: Checkpoint current active capsule
        snapshot = await client.capsules.checkpoint(
            capsule_id="main-agent",
            label="pre-deadlock-fix",
        )
        print(f"Created Snapshot: {snapshot.snapshot_id}")

        # Step 3: Fork speculative branches
        branches = [
            {"label": "b1", "hypothesis": "Lock hierarchy fix"},
            {"label": "b2", "hypothesis": "Bounded channel queue"},
        ]
        fork_res = await client.capsules.fork(
            capsule_id="main-agent",
            branches=branches,
        )

        # Step 4: Run test inside isolated branch world
        test_run = await client.capsules.run(
            capsule_id=fork_res.forked_capsules[0],
            command="pytest tests/test_deadlock.py",
            allow_failure=True,
        )
        print(f"Branch test output:\n{test_run.stdout}")


if __name__ == "__main__":
    asyncio.run(run_diagnosis_workflow())
```

---

## 4. Context Managers for Counterfactual Sandboxes

The `CounterfactualSandbox` provides automated isolation, speculative execution, semantic diffing, and cleanup:

```python
from genos import CounterfactualSandbox


async def execute_safe_patch(repo_path: str, patch_content: str):
    async with CounterfactualSandbox(base_repo=repo_path) as sandbox:
        # Write patch file into isolated Git worktree
        await sandbox.write_file("src/config.py", patch_content)

        # Execute test suite in sandbox
        result = await sandbox.run("pytest tests/test_config.py")

        if not result.is_success:
            print("Patch failed verification. Sandbox world will be destroyed.")
            return

        diff = await sandbox.diff_against_parent()
        print(f"Verification passed! Semantic diff:\n{diff}")

        await sandbox.commit_decision(
            title="Update default client timeout",
            evidence=["tests/test_config.py"],
        )
```

---

## 5. Typed Event Streaming & Listeners

Subscribe to lifecycle and state evolution events emitted during simulation runs:

```python
from genos import GenOSClient
from genos.events import EventType, GenOSEvent


async def handle_snapshot_event(event: GenOSEvent):
    print(f"[{event.timestamp}] Snapshot created: {event.payload}")


async def handle_falsification_event(event: GenOSEvent):
    print(f"Hypothesis falsified in capsule: {event.capsule_id}")


async def monitor_simulation():
    async with GenOSClient() as client:
        client.events.subscribe(
            EventType.SNAPSHOT_CREATED,
            handle_snapshot_event,
        )
        client.events.subscribe(
            EventType.HYPOTHESIS_FALSIFIED,
            handle_falsification_event,
        )

        await client.experiments.run_workspace_experiment(
            manifest="experiments/refactor.yaml"
        )
```

---

## 6. Custom Exception Hierarchy

The SDK raises structured exceptions derived from GenOS domain error envelopes:

```python
from genos.exceptions import (
    BudgetExhaustedError,
    CircuitBreakerError,
    GenOSProtocolError,
    WorldExecutionError,
)


async def safe_execution_handler(client: GenOSClient, capsule_id: str):
    try:
        return await client.capsules.run(
            capsule_id=capsule_id,
            command="cargo build --release",
        )
    except WorldExecutionError as exc:
        print(f"Sandbox compiler error (exit {exc.exit_code}): {exc.stderr}")
    except CircuitBreakerError as exc:
        print(f"Circuit breaker OPEN: {exc.message}")
    except BudgetExhaustedError:
        print("Agent compute budget exhausted.")
    except GenOSProtocolError as exc:
        print(f"Protocol violation: {exc.message}")
```
