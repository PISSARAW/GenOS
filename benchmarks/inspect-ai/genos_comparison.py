"""Inspect AI task for paired GenOS execution arms and independent scoring."""

import json
from pathlib import Path

from inspect_ai import Task, task
from inspect_ai.dataset import MemoryDataset, Sample
from inspect_ai.model import ModelOutput
from inspect_ai.scorer import CORRECT, INCORRECT, Score, accuracy, scorer
from inspect_ai.solver import solver

from protocol import ARMS, load_config, make_request, run_oracle, run_runner


TASK_SET = Path(__file__).resolve().parents[1] / "topology-morphogenesis/comparison-task-set.json"


def comparison_samples():
    tasks = json.loads(TASK_SET.read_text(encoding="utf-8"))["tasks"]
    return MemoryDataset([
        Sample(id=item["id"], input=item["prompt"], target=item["id"],
               metadata={"oracle": item["oracle"]})
        for item in tasks if item.get("comparisonEligible") and item.get("oracle")
    ])


@solver
def external_genos(config):
    async def solve(state, _generate):
        if str(state.model) != config["modelId"]:
            raise ValueError("Inspect model differs from controlled runner model")
        request = make_request(state, config)
        response, answer = await run_runner(request, config)
        state.output = ModelOutput.from_content(model=config["modelId"], content=response["rawOutput"])
        state.store.set("genos_execution", {"response": response, "answer": answer})
        return state
    return solve


@scorer(metrics=[accuracy()])
def independent_oracle():
    async def score(state, target):
        execution = state.store.get("genos_execution")
        if not execution:
            raise ValueError("runner produced no completed execution")
        result = await run_oracle(target.text, execution["answer"])
        response = execution["response"]
        return Score(
            value=CORRECT if result["passed"] else INCORRECT,
            answer=response["rawOutput"],
            explanation=f'Independent oracle {result["oracle"]}: {result["passed"]}',
            metadata={"arm": response["arm"], "modelId": response["modelId"],
                      "modelVersion": response["modelVersion"], "runnerVersion": response["runnerVersion"],
                      "tokensUsed": response["tokensUsed"],
                      "elapsedMs": response["elapsedMs"], "toolsUsed": response["toolsUsed"],
                      "evidenceRefs": response["evidenceRefs"]}
        )
    return score


@task
def genos_comparison(arm: str, config_path: str):
    if arm not in ARMS:
        raise ValueError("arm must be model-alone, fixed-topology, or morphogenesis")
    config = {**load_config(config_path), "arm": arm}
    return Task(dataset=comparison_samples(), solver=external_genos(config), scorer=independent_oracle())
