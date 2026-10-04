"""Fail-closed process contract for the optional Inspect AI comparison."""

import asyncio
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
ARMS = frozenset({"model-alone", "fixed-topology", "morphogenesis"})
MAX_OUTPUT_BYTES = 65536


def load_config(path):
    config = json.loads(Path(path).read_text(encoding="utf-8"))
    runner = config.get("runner")
    if not isinstance(runner, list) or not runner or not all(isinstance(part, str) and part for part in runner):
        raise ValueError("runner must be a non-empty command array")
    if not isinstance(config.get("modelId"), str) or not config["modelId"]:
        raise ValueError("modelId is required")
    if type(config.get("maxTokens")) is not int or config["maxTokens"] < 1:
        raise ValueError("maxTokens must be positive")
    if not isinstance(config.get("timeoutSeconds"), (int, float)) or config["timeoutSeconds"] <= 0:
        raise ValueError("timeoutSeconds must be positive")
    if type(config.get("seed")) is not int:
        raise ValueError("seed must be an integer")
    tools = config.get("allowedTools")
    if not isinstance(tools, list) or not all(isinstance(tool, str) and tool for tool in tools):
        raise ValueError("allowedTools must be a command tool list")
    return config


def make_request(state, config):
    arm = config["arm"]
    if arm not in ARMS:
        raise ValueError("unknown comparison arm")
    topology = config.get("fixedTopology") if arm == "fixed-topology" else None
    if arm == "fixed-topology" and not topology:
        raise ValueError("fixedTopology is required for the fixed arm")
    block = f'{config["seed"]}:{state.sample_id}:{state.epoch}'.encode("utf-8")
    request = {
        "schemaVersion": 1, "taskId": str(state.sample_id), "prompt": state.input_text,
        "arm": arm, "forcedTopology": topology, "modelId": config["modelId"],
        "maxTokens": config["maxTokens"], "allowedTools": config["allowedTools"],
        "seed": int.from_bytes(hashlib.sha256(block).digest()[:4], "big")
    }
    request["requestId"] = hashlib.sha256(json.dumps(request, sort_keys=True).encode("utf-8")).hexdigest()
    return request


async def run_command(command, payload, timeout):
    process = await asyncio.create_subprocess_exec(
        *command, cwd=ROOT, stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    try:
        output, errors = await asyncio.wait_for(
            process.communicate(json.dumps(payload).encode("utf-8")), timeout=timeout
        )
    except asyncio.TimeoutError as error:
        process.kill()
        await process.wait()
        raise RuntimeError("comparison command timed out") from error
    if process.returncode != 0:
        raise RuntimeError(f"comparison command failed ({process.returncode}): {errors[:1024].decode('utf-8', 'replace')}")
    if len(output) > MAX_OUTPUT_BYTES:
        raise RuntimeError("comparison output exceeds limit")
    try:
        return json.loads(output)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeError("comparison command returned invalid JSON") from error


def validate_response(response, request):
    validate_identity(response, request)
    validate_execution(response, request)
    validate_topology(response, request)
    return parse_answer(response)


def validate_identity(response, request):
    if not isinstance(response, dict) or response.get("schemaVersion") != 1:
        raise ValueError("runner response schema is invalid")
    for field in ("requestId", "taskId", "arm", "modelId"):
        if response.get(field) != request[field]:
            raise ValueError(f"runner response changed {field}")


def validate_execution(response, request):
    if response.get("status") != "completed":
        raise ValueError("runner did not complete the task")
    if not isinstance(response.get("modelVersion"), str) or not response["modelVersion"]:
        raise ValueError("runner omitted model version")
    if not isinstance(response.get("runnerVersion"), str) or not response["runnerVersion"]:
        raise ValueError("runner omitted harness version")
    if not isinstance(response.get("rawOutput"), str) or not response["rawOutput"]:
        raise ValueError("runner omitted raw output")
    validate_resources(response, request)


def validate_resources(response, request):
    if type(response.get("tokensUsed")) is not int or not 0 <= response["tokensUsed"] <= request["maxTokens"]:
        raise ValueError("runner exceeded or omitted token budget")
    if not isinstance(response.get("elapsedMs"), (int, float)) or response["elapsedMs"] < 0:
        raise ValueError("runner omitted elapsed time")
    refs = response.get("evidenceRefs")
    if not isinstance(refs, list) or not refs or not all(isinstance(ref, str) and ref for ref in refs):
        raise ValueError("runner omitted execution evidence")
    tools = response.get("toolsUsed")
    if not isinstance(tools, list) or not all(tool in request["allowedTools"] for tool in tools):
        raise ValueError("runner used a tool outside the common allowance")


def validate_topology(response, request):
    if request["arm"] != "model-alone" and not response.get("topologyUsed"):
        raise ValueError("runner omitted executed topology")
    if request["arm"] == "fixed-topology" and response.get("topologyUsed") != request["forcedTopology"]:
        raise ValueError("runner did not use the fixed topology")


def parse_answer(response):
    try:
        answer = json.loads(response["rawOutput"])
    except json.JSONDecodeError as error:
        raise ValueError("runner raw output is not JSON") from error
    if not isinstance(answer, dict):
        raise ValueError("runner output must be a JSON object")
    return answer


async def run_runner(request, config):
    response = await run_command(config["runner"], request, config["timeoutSeconds"])
    answer = validate_response(response, request)
    return response, answer


async def run_oracle(task_id, answer):
    command = ["node", str(ROOT / "benchmarks/topology-morphogenesis/inspect-oracle.cjs")]
    result = await run_command(command, {"taskId": task_id, "answer": answer}, 10)
    if not isinstance(result, dict) or not isinstance(result.get("passed"), bool):
        raise ValueError("independent oracle returned no verdict")
    return result
