"""Experimental OpenHands worker entrypoint; requires an OS-isolated workspace."""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


def validate_request(request, workspace):
    if not isinstance(request, dict) or set(request) != {"task", "model"}:
        raise ValueError("task and model are required")
    if any(not isinstance(request[key], str) or not 1 <= len(request[key]) <= 4000 for key in request):
        raise ValueError("invalid request")
    root = Path(os.environ["GENOS_OPENHANDS_SANDBOX_ROOT"]).resolve(strict=True)
    target = Path(workspace).resolve(strict=True)
    if target == root or root not in target.parents or not target.is_dir():
        raise ValueError("workspace must be a child of the sandbox root")
    return target


def run_task(request, workspace, timeout=300):
    target = validate_request(request, workspace)
    if type(timeout) is not int or not 1 <= timeout <= 1800:
        raise ValueError("invalid timeout")
    child = subprocess.run([sys.executable, __file__, "--worker", str(target)],
                           input=json.dumps(request), text=True, capture_output=True,
                           timeout=timeout, check=False)
    if child.returncode:
        return {"status": "failed", "exit_code": child.returncode}
    return {"status": "candidate_only", "workspace": str(target)}


def worker(workspace):
    from openhands.sdk import Agent, Conversation, LLM, Tool
    from openhands.tools.file_editor import FileEditorTool
    from openhands.tools.terminal import TerminalTool

    request = json.loads(sys.stdin.read())
    validate_request(request, workspace)
    key = os.environ.get("LLM_API_KEY")
    if not key:
        raise ValueError("LLM_API_KEY is required")
    llm = LLM(model=request["model"], api_key=key)
    agent = Agent(llm=llm, tools=[Tool(name=TerminalTool.name), Tool(name=FileEditorTool.name)])
    conversation = Conversation(agent=agent, workspace=str(workspace))
    conversation.send_message(request["task"])
    conversation.run()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--worker")
    args = parser.parse_args()
    if args.worker:
        worker(args.worker)
