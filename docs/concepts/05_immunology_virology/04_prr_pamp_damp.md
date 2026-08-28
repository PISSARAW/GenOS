# 04. Pattern Recognition Receptors (PRRs, PAMPs, DAMPs)

This biomimetic concept is deeply integrated into the Artificial Immune System (AIS) of GenOS, specifically located in `crates/genos-core/src/resilience/ais/prr.rs`. It serves as a foundational layer, complementing clonal selection and Danger Theory, and works alongside adaptive mechanisms described in [02_immunology.md](02_immunology.md) and [03_advanced_immunology.md](03_advanced_immunology.md).

## 4.1 Target Identification: What Does the System Look For?

**PRRs (Pattern Recognition Receptors)** are hardcoded algorithmic sensors designed to recognize universal characteristics of danger, completely independent of a specific microbe, payload, or nuanced attack vector (unlike highly specific antibodies).

They scan for two primary categories of molecular patterns:

### Pathogen-Associated Molecular Patterns (PAMPs)

These are structural motifs that possess an intrinsic, unmistakable danger, typically originating from external intruders or malicious inputs.
* **In Biology:** Free-floating bacterial DNA, lipopolysaccharides (LPS).
* **In GenOS:** Signatures of "Prompt Injection," unauthorized access attempts, executable viral payloads, or known exploitation strings. Essentially, any structural motif that is clearly malicious and originates from outside the trusted perimeter.

### Damage-Associated Molecular Patterns (DAMPs)

These are danger signals originating from the host's own body (the GenOS agent) when it is severely damaged, stressed, or entering a critical failure state.
* **In Biology:** Intracellular proteins exposed to the extracellular space following trauma or sudden cell death.
* **In GenOS:** Consecutive tool execution failures (`ConsecutiveFailures`), severe semantic drift (`SemanticDivergence`), context memory pollution (`ContextPollution`), or the violation of critical system invariants.

## 4.2 Operational Mechanics: Triggering the Response

PRRs act as software "sensors" continuously patrolling the agent's execution environment.

1. **Scanning (Detection):** The PRR scans the stream of incoming events and state changes, classifying them into a `MolecularPattern`.
2. **Signal Amplification:** Encountering a PAMP results in an instantaneous, binary response (100% activation). In contrast, a DAMP triggers a proportional response measured against the severity of the damage (e.g., a threshold of 5 consecutive errors may saturate the signal).
3. **Orchestrating the Defense:** If the cumulative activation surpasses the PRR's `activation_threshold`, a systemic alert is triggered. This alert isolates the threat, often initiating an inflammatory response (such as agent isolation, context purging, or restricted execution mode) without waiting to identify the specific nature of the "virus" at work.

## 4.3 The Efficiency of the "Generalist"

The major advantage of the PRR model in GenOS is its **temporal efficiency**. Instead of invoking an expensive and slow LLM evaluation to semantically analyze the intention of an attacking prompt, or attempting a deep root-cause analysis of an emerging failure, the PRR triggers an immediate "total emergency" mode upon recognizing a crude, undeniable pattern of danger. This provides an optimal, highly resilient evolutionary strategy to protect the agent swarm immediately, allowing adaptive immunity (like CRISPR spacers) to refine the analysis later.
