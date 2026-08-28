# GenOS Empirical Evaluation Protocol (Concepts 7 to 9) - Double Blind Test

**⚠️ INSTRUCTIONS FOR THE AI AGENT READING THIS FILE ⚠️**
Your objective is to conduct a strict experimentation on Concepts 7 to 9.
**To guarantee scientific rigor, the expected results of these tests have been masked.** You must not presume or hallucinate anything. You must execute the tasks exactly as requested, using real CLI commands, and purely objectively document the outcomes.

---

## PHASE 1: Arena Setup
1. In a `test_env_genos_7_9` directory, create a complex React/TypeScript component (e.g., a virtualized Data Table component with sorting and filtering).
2. Set up a straightforward evaluation script (`eval_script.js`) that measures execution time (performance) and the number of lines/tokens (cognitive cost).

---

## PHASE 2: Evaluation of Optimization Models
**Objective:** Compare two methods of code selection.
1. **Method A (Naive Approach):**
   - Give yourself the prompt: "Optimize this Table component so that it is as fast as possible."
   - Refactor the code. Record the result and the metrics from `eval_script.js`.
2. **Method B (GenOS Mechanics):**
   - Create 3 GenOS Workers with distinct parameters via the CLI.
   - Ask each to propose an implementation.
   - Subject the 3 proposals to a **Pareto Front** criterion (plot the 3 points on the axes: Performance vs Code Size).
   - Note which agent is selected by the system.
3. **Observation:** Simply compare the final code chosen by Method A with the final code chosen by Method B.

---

## PHASE 3: Flakiness Testing (Quantitative Genetics)
**Objective:** Test the reaction of both systems when faced with uncertain success.
1. **Context:** Create a unit test designed to pass randomly 1 out of 3 times (e.g., a flaky network test).
2. **Method A:** Ask the agent to fix an imaginary bug. Run the test. If it happens to be green by chance, note the agent's reaction (does it declare the task accomplished?).
3. **Method B (GenOS Mechanics):**
   - The agent proposes a solution and the test passes (by chance).
   - Use the GenOS commands to evaluate the **Heritability ($h^2$)**: clone the victorious agent 5 times (or replay its execution 5 times in isolation).
   - Execute `cargo run -p genos-cli -- agent infer-traits` on the results.
4. **Observation:** How does the GenOS system react after these 5 attempts compared to the Method A Agent?

---

## PHASE 4: Chaos Engineering and Isolation
**Objective:** Observe the structural behavior under stress/constraints.
1. **Bottleneck:**
   - Simulate a fleet of 10 capsules/agents (`cargo run -p genos-cli -- capsule fork`).
   - Randomly delete 8 of them.
   - Allow the remaining 2 to generate the subsequent agents.
   - **Observation:** Analyze the parameters of the new agents. Is there measurable genetic drift?
2. **Compartmentalization vs Migration:**
   - Create a "UI Agents" group and a "DB Agents" group working on two separate files without communicating. Note whether they manage to resolve an "N+1 query" issue affecting the UI.
   - Apply a "Migration" (physically move the generated data or the genome of a DB agent into the UI directory).
   - **Observation:** What happens during the subsequent generation in the UI directory?

---

## PHASE 5: Drafting the Report
Document purely raw console outputs, generated files, and factual observations. No theoretical conclusions are expected, only empirical facts.
