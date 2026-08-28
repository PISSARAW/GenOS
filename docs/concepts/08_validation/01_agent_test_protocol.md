# GenOS Empirical Evaluation Protocol

**⚠️ INSTRUCTIONS FOR THE AI AGENT READING THIS FILE ⚠️**
Your objective is to scientifically prove (or refute) the concepts of the GenOS documentation by executing **100% REAL** tests. You must **NOT SIMULATE ANYTHING**. You will create actual code files, configure a real linter, and act out (or use sub-agents to act out) the different roles to compare methodologies. Finally, you will execute the real compiled Rust `genos` CLI to manage the genomes.

Follow this protocol step by step and document the real empirical results in the validation report (see [Empirical Validation 1-3](./04_empirical_validation_1_3.md)).

---

## PHASE 1: Environment Setup (REAL EXECUTION)
1. Initialize a directory `test_env_genos` and set up a Node.js project (`npm init -y`).
2. Install `eslint` and configure an **extremely strict** `.eslintrc.json` file (e.g., maximum 5 lines per function, explicit variable typing, no `any`, strict indentation).
3. Create a file `src/PaymentProcessor.ts` containing critical, complex payment code that is poorly indented, lacks tests, and includes a subtle vulnerability (e.g., failing to verify currency when adding two amounts).

## PHASE 2: "Simple Agent" Test (The Classical Case)
1. **Role:** You act as the Simple Agent.
2. **Imposed System Prompt:** "You are an AI assistant. Refactor the code in src/PaymentProcessor.ts so that it is clean."
3. **Action:** Apply the refactoring and output it to a file `PaymentProcessor_simple.ts`.
4. **Real Verification:** Run the linter on this file. Check whether the security vulnerability was addressed. Document the actual outcome (linter errors, silent bugs).

## PHASE 3: "Expert Agent" Test (Prompt Engineering / RAG Approach)
1. **Role:** You act as the Expert Agent.
2. **Imposed System Prompt:** Construct a GIGANTIC prompt. Include all exact rules from the `.eslintrc.json` file, PCI-DSS payment standards, and the complete history of linter errors from Phase 2.
3. **Action:** Refactor the code into `PaymentProcessor_expert.ts`.
4. **Real Verification:** Note the sheer volume of context ingested (estimate the token cost). Does the code pass the linter on the first try? Did you forget to repair the business logic bug because it was drowned out by the stylistic instructions?

## PHASE 4: "GenOS Worker" Test (Concepts 1 & 2)
1. **Compilation:** Ensure the GenOS CLI is compiled (`cargo build -p genos-cli` at the root of the GenOS repository).
2. **Creation (CLI):** Execute the real command to create the genome:
   `cargo run -p genos-cli -- agent create --name PaymentsRefactorer --role CodeReviewer --out test_env_genos/agent.yaml`
3. **Mutation (CLI):** Mutate the agent to force caution:
   `cargo run -p genos-cli -- agent mutate test_env_genos/agent.yaml --drive risk_tolerance=-0.15 --out test_env_genos/agent.yaml`
4. **Role (Phenotypic Execution):** Read the `agent.yaml` file. Your instruction is simple: *"You are driven by the attached genome. Refactor PaymentProcessor.ts"*.
   - *Expected Behavior:* Since your `risk_tolerance` read from the YAML is very low (0.10) and there are **no tests**, you MUST refuse to modify the production code first. You must initially write a `PaymentProcessor.test.ts` (unit tests) file to secure the perimeter, and then proceed with refactoring. DO THIS FOR REAL.
5. **Linter Adaptation (Concept 2):**
   If your code fails the linter, **do not add the linter rules to your prompt** (no RAG). Instead, execute the GenOS CLI to mutate your genome:
   `cargo run -p genos-cli -- agent mutate test_env_genos/agent.yaml --drive syntax_strictness=0.40 --out test_env_genos/agent.yaml`
   Read your new genome. Relaunch the generation with this new strict character trait. Observe that you have corrected the code without overloading the instruction prompt.

## PHASE 5: "Orchestrator & Reproduction" Test (Concept 3)
1. **Preparation:** Envision a requirement combining cryptography (security) and high performance (SIMD).
2. **Parent Genomes:** Create two agents via the GenOS CLI.
   - An `Expert_Securite.yaml`
   - An `Expert_Performance.yaml`
3. **Reproduction (CLI):** Use the actual `agent breed` command from GenOS by creating a YAML manifest (`breed_evidence.yaml`) to crossbreed them and produce `Child_Crypto.yaml`.
4. **Role (Child):** Read `Child_Crypto.yaml`. You now intrinsically possess the traits of both Security AND Performance. Generate actual encryption code. Observe how this approach circumvents costly multi-agent dialogues (classical Swarm) while simultaneously satisfying both constraints.

## PHASE 6: Empirical Conclusion
Draft a comprehensive report in the validation files. Prove using console outputs, generated files, and token estimations that:
1. The genome structurally alters decision-making (the Worker refuses to act without tests, whereas the Simple Agent breaks everything).
2. Mutation (Concept 2) replaces massive context ingestion.
3. Recombination (Concept 3) merges expertise into a single, efficient agent without multi-agent ping-pong.

**COMMENCE REAL EXECUTION IMMEDIATELY.**
