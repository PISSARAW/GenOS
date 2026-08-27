# GenOS SDK Missing Features Documentation

This document describes the three major features added to the GenOS SDK: **Cost Accounting**, **Conditional Merge**, and **Audit Bundles**.

## 1. Cost Accounting (`python/genos_sdk/cost_accounting.py`)
Provides deterministic budget tracking for agent operations.
- **`budget_limit`**: Initializes the allowed maximum budget.
- **`add_cost(amount, description)`**: Registers an expense. Raises `ValueError` for negative costs and `RuntimeError` if the budget limit is exceeded.
- **`get_remaining_budget()`**: Returns the remaining budget.
- **`generate_report()`**: Outputs a complete accounting report with all transaction details.

## 2. Conditional Merge (`python/genos_sdk/conditional_merge.py`)
Enables strict, rule-based merging of agent states based on confidence thresholds.
- **`confidence_threshold`**: The minimum required score to accept a merge (0.0 to 1.0).
- **`evaluate_merge(source_branch, target_branch, confidence_score)`**: Assesses if a merge should proceed. Returns `merged` if the score meets the threshold, otherwise `rejected`.
- **`update_threshold(new_threshold)`**: Dynamically adjusts the confidence requirement.

## 3. Audit Bundles (`python/genos_sdk/audit_bundle.py`)
Provides verifiable, immutable logging of agent events using cryptographic signatures.
- **`run_id` & `environment`**: Context metadata for the audit trail.
- **`add_event(event_type, details)`**: Logs a specific action with a precise UTC timestamp.
- **`seal_bundle()`**: Compiles all events and generates a SHA-256 signature for verification.
- **`export(filepath)`**: Saves the sealed bundle to a local JSON file.
