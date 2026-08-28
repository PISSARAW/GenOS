# Kuramoto Coupling

Kuramoto Coupling implements canonical pairwise phase synchronization for distributed multi-agent swarms (e.g., Firefly swarms). It replaces naive mean-phase synchronization by allowing each oscillator (agent) to advance based on its natural frequency, dynamically influenced by the weighted coupling sum of its neighbors.

## Architecture

Defined in `crates/genos-core/src/organization/kuramoto.rs`, the implementation ensures degree-normalized synchronization, preventing highly connected "hub" agents from overwhelmingly dominating the network.

### Core Structures

1. **`KuramotoOscillator`**: Represents an individual node in the swarm.
   - `id`: Unique identifier.
   - `phase`: Current phase angle in radians (wrapped to $[0, 2\pi)$).
   - `omega`: Natural angular frequency of the oscillator.

2. **Coherence Metric**:
   - The `order_parameter` function measures the global synchronization of the population ($R \in [0, 1]$), calculated as: $R = \left| \frac{1}{N} \sum_{j=1}^N e^{i\theta_j} \right|$. A value of $1$ indicates perfect synchrony.

### Pairwise Integration

The system uses an explicit-Euler step integration (`step_pairwise`) based on the following differential equation:

$$ \frac{d\theta_i}{dt} = \omega_i + \frac{K}{\text{deg}_i} \sum_{j \in \text{neighbors}(i)} \sin(\theta_j - \theta_i) $$

- **$K$**: Coupling strength.
- **$\text{deg}_i$**: Node degree, utilized to normalize the coupling force.

## Integration Flow

```mermaid
graph TD
    A[Oscillator i] -->|Natural Frequency ω_i| C(Phase Integration)
    B[Oscillator j] -->|Phase Difference sin(θ_j - θ_i)| C
    C --> D{Wrap to 0, 2π}
    D --> E[New Phase θ_i]
```

## Characteristics

- **Degree Normalization**: By dividing the coupling sum by the node's degree (`deg_i`), the network remains stable even in non-uniform topologies (e.g., scale-free networks).
- **Simultaneous Coupling**: Phase snapshots are taken prior to integration to ensure synchronous mathematical updates, preventing sequential bias during the Euler step.
