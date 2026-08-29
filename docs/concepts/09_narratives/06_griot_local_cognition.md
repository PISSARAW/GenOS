# Local Cognition and Privacy (Cognitive Routing)

Griot and its spawned subagents possess a unique trait in the GenOS ecosystem: **they are the ONLY agents that depend exclusively on local LLMs** (such as Ollama, LM Studio, or vLLM). While other orchestrators or workers might leverage cloud models via API keys, Griot is strictly confined to local-first inference to guarantee absolute privacy and system autonomy without external network dependencies.

## Cognitive Routing

To manage resource constraints inherent to local inference, Griot employs **Cognitive Routing**. When a task is generated, the backend (`modelRouter.js`) analyzes the requested `complexity` (low, medium, high) and dynamically interrogates the host machine for available local models via `localModelDiscovery`.

- **Low Complexity** (e.g., simple text parsing, pings, heartbeat checks): Routed to the smallest available model (e.g., `Llama 3 8B` or `Qwen 7B`) to ensure near-instantaneous execution and low VRAM footprint.
- **Medium Complexity** (e.g., standard code generation): Routed to mid-sized models.
- **High Complexity** (e.g., deep architectural refactors, adversarial security reviews): Routed to the largest, most capable model available on the host (e.g., `Command R+`, `Llama 3 70B`).

If no models are explicitly configured, Griot will sort all discovered models by parameter size and seamlessly select the one best suited for the immediate cognitive load.
