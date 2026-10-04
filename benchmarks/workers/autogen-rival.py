"""Execute one bounded scheduling case through AutoGen AgentChat and local Ollama."""

import asyncio
import json
import os
import sys
from importlib.metadata import version

from autogen_agentchat.agents import AssistantAgent
from autogen_ext.models.ollama import OllamaChatCompletionClient


async def run():
    parameters = json.load(sys.stdin)
    model_name = os.environ.get("GENOS_RIVAL_OLLAMA_MODEL", "qwen2.5:14b")
    client = OllamaChatCompletionClient(model=model_name)
    agent = AssistantAgent(
        "scheduler",
        client,
        system_message=("Schedule every job exactly once on the numbered machines. "
                        "Return only JSON with an assignments array; each entry has "
                        "machine and jobs fields. No explanation or markdown."),
    )
    task = ("Use longest processing time first (LPT). Jobs and machines: "
            + json.dumps(parameters, separators=(",", ":")))
    try:
        result = await agent.run(task=task)
        raw_output = result.messages[-1].content
        print(json.dumps({"rawOutput": raw_output, "model": model_name,
                          "frameworkVersion": version("autogen-agentchat")}))
    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(run())
