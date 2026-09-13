const fs = require('fs');
const path = require('path');
const { buildAutonomyPlan } = require('../services/autonomousOrchestrationService.js');

class GenOSEvalHarness {
    constructor(benchmarkName, maxSamples = null) {
        this.benchmarkName = benchmarkName;
        this.maxSamples = maxSamples;
        this.scorecard = { total: 0, passed: 0, failed: 0 };
    }

    async run() {
        console.log(`[HARNESS] Booting GenOS Evaluation Harness for: ${this.benchmarkName}`);
        const dataset = await this.loadDataset();

        for (const item of dataset) {
            console.log(`\n[HARNESS] Processing Item: ${item.id}`);
            const contract = this.buildMissionContract(item);
            
            // Build the plan using the native autonomous Orchestrator Service
            const plan = buildAutonomyPlan(contract, { initial: 100000, margin: 20000 });
            
            // 3. Register the Orchestrator Mission in the Database
            console.log(`[HARNESS] Registering Mission in GenOS Database...`);
            const orchestrator = {
                id: contract.mission_id,
                agent_type: 'evaluator',
                state: 'running',
                cognitive_budget: 100000,
                memory_address: contract.mission_id,
                autonomy_plan: JSON.stringify(plan)
            };
            // Note: DB insertion goes here using src/db.js
            
            // 4. Dispatch the Mission to the Fleet
            console.log(`[HARNESS] Dispatching to Fleet Service...`);
            try {
                // Call the actual GenOS fleet dispatcher
                // const { createAutonomousWorkers } = require('../services/agentFleetWorkers.js');
                // const { waitForAutonomousWorkerQuiescence } = require('../services/workerEvidenceBarrierQuiescence.js');
                
                // await createAutonomousWorkers(db, orchestrator, { plan });
                // const finalResult = await waitForAutonomousWorkerQuiescence(db, orchestrator.id);
                console.log(`[HARNESS] [Simulated Dispatch] Mission is now running asynchronously on local LLM router.`);
            } catch (err) {
                console.error(`[HARNESS] Fleet dispatch failed:`, err);
            }
        }
        console.log(`\n[HARNESS] Evaluation Complete. Score: ${this.scorecard.passed}/${this.scorecard.total}`);
    }

    async loadDataset() {
        if (this.benchmarkName === 'swe-bench-lite') {
            return [{ id: 'django-11001', problem_statement: 'Fix SQL compilation error in QuerySet', type: 'bug' }];
        }
        return [];
    }

    buildMissionContract(item) {
        const { listStrategies } = require('../strategies/strategyRegistry.js');
        const allStrategies = listStrategies();

        return {
            mission_id: `eval_${this.benchmarkName}_${item.id}`,
            description: item.problem_statement,
            problem_profile: { risk: item.type === 'bug' ? 'high' : 'medium', complexity: 0.8, uncertainty: 0.7, type: item.type },
            strategy_portfolio: allStrategies,
            branches: [
                { label: 'Hypothesis A', hypothesis: 'Direct code mutation' },
                { label: 'Hypothesis B', hypothesis: 'Skeptical alternative approach' },
                { label: 'Hypothesis C', hypothesis: 'Edge case verification' }
            ]
        };
    }
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const benchmark = args.includes('--benchmark') ? args[args.indexOf('--benchmark') + 1] : 'swe-bench-lite';
    const harness = new GenOSEvalHarness(benchmark, 1);
    harness.run().catch(console.error);
}

module.exports = { GenOSEvalHarness };
