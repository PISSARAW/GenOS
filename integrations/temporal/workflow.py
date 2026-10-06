"""Temporal workflow facade for the GenOS external-operation ledger."""
from datetime import timedelta
from temporalio import activity, workflow
from temporalio.common import RetryPolicy
from reconciliation import prepare, state
import os
import sqlite3


@activity.defn
async def inspect_operation(operation_id: str) -> str:
    with sqlite3.connect(os.environ["GENOS_TEMPORAL_LEDGER"]) as connection:
        prepare(connection)
        return state(connection, operation_id) or "not_started"


@workflow.defn
class ReconcileWorkflow:
    @workflow.run
    async def run(self, operation_id: str) -> str:
        result = await workflow.execute_activity(
            inspect_operation, operation_id, start_to_close_timeout=timedelta(seconds=10),
            retry_policy=RetryPolicy(maximum_attempts=1))
        if result in {"in_flight", "uncertain"}:
            return "reconciliation_required"
        return result
