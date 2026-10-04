"""Execute bounded worker cases through AutoGen AgentChat and local Ollama."""

import asyncio
import json
import os
import sys
from importlib.metadata import version

from autogen_agentchat.agents import AssistantAgent
from autogen_ext.models.ollama import OllamaChatCompletionClient


async def run():
    request = json.load(sys.stdin)
    parameters = request["parameters"]
    model_name = os.environ.get("GENOS_RIVAL_OLLAMA_MODEL", "qwen2.5:14b")
    client = OllamaChatCompletionClient(model=model_name)
    agent = AssistantAgent(
        "worker",
        client,
        system_message=instructions(request["id"]),
    )
    task = task_for(request["id"], parameters)
    try:
        result = await agent.run(task=task)
        raw_output = result.messages[-1].content
        print(json.dumps({"rawOutput": raw_output, "model": model_name,
                          "frameworkVersion": version("autogen-agentchat")}))
    finally:
        await client.close()


def instructions(case_id):
    if case_id == "lpt-schedule":
        return ("Schedule every job exactly once on the numbered machines. "
                "Return only JSON with an assignments array; each entry has "
                "machine and jobs fields. No explanation or markdown.")
    return ("Solve subset sum. Return only JSON with an indices array of "
            "zero-based indices whose values add to the target. No explanation or markdown.")


def task_for(case_id, parameters):
    objective = ("Use longest processing time first (LPT). Jobs and machines: "
                 if case_id == "lpt-schedule" else "Find a subset summing exactly to the target: ")
    return objective + json.dumps(parameters, separators=(",", ":"))


if __name__ == "__main__":
    asyncio.run(run())
