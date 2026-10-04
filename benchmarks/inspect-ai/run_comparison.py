"""Run paired Inspect AI arms and retain their observed, independently scored results."""

import argparse
import hashlib
import json
import subprocess
from importlib.metadata import version
from pathlib import Path

from inspect_ai import eval as inspect_eval
from inspect_ai.scorer import CORRECT, INCORRECT

from genos_comparison import TASK_SET, genos_comparison
from protocol import ROOT, load_config


def git_value(*arguments):
    return subprocess.check_output(["git", *arguments], cwd=ROOT, text=True).strip()


def observed_samples(log, arm):
    if log.status != "success" or not log.samples:
        raise RuntimeError(f"Inspect did not complete arm {arm}")
    observations = {}
    for sample in log.samples:
        score = (sample.scores or {}).get("independent_oracle")
        if not score or score.value not in (CORRECT, INCORRECT):
            raise RuntimeError(f"No independent score for {arm}:{sample.id}:{sample.epoch}")
        metadata = score.metadata or {}
        if metadata.get("arm") != arm:
            raise RuntimeError("Inspect score arm differs from requested arm")
        key = f"{sample.id}:{sample.epoch}"
        if key in observations:
            raise RuntimeError("Duplicate task/epoch block")
        observations[key] = {
            "taskId": str(sample.id), "epoch": sample.epoch,
            "correct": score.value == CORRECT, "tokensUsed": metadata.get("tokensUsed"),
            "elapsedMs": metadata.get("elapsedMs"), "modelVersion": metadata.get("modelVersion"),
            "runnerVersion": metadata.get("runnerVersion"),
            "toolsUsed": metadata.get("toolsUsed"),
            "evidenceRefs": metadata.get("evidenceRefs")
        }
    return observations


def paired_report(arms):
    baseline = verify_blocks(arms)
    blocks = [{"block": key, "arms": {arm: observations[key] for arm, observations in arms.items()}}
              for key in sorted(baseline)]
    baseline_accuracy = arm_summary(arms["model-alone"])["accuracy"]
    summary = {arm: arm_summary(observations) for arm, observations in arms.items()}
    for item in summary.values():
        item["pairedAccuracyDeltaVsAlone"] = item["accuracy"] - baseline_accuracy
    return blocks, summary


def verify_blocks(arms):
    baseline = set(arms["model-alone"])
    if any(set(observations) != baseline for observations in arms.values()):
        raise RuntimeError("Comparison arms did not run the same task/epoch blocks")
    for key in baseline:
        for field in ("modelVersion", "runnerVersion"):
            if len({observations[key][field] for observations in arms.values()}) != 1:
                raise RuntimeError(f"Comparison arms changed {field} in {key}")
    return baseline


def arm_summary(observations):
    values = list(observations.values())
    correct = sum(value["correct"] for value in values)
    return {"observed": len(values), "correct": correct,
            "accuracy": correct / len(values),
            "totalTokens": sum(value["tokensUsed"] for value in values)}


def run(args):
    config = load_config(args.config)
    if args.epochs < 1:
        raise ValueError("epochs must be positive")
    logs = {}
    observations = {}
    for arm in ("model-alone", "fixed-topology", "morphogenesis"):
        log = inspect_eval(
            genos_comparison(arm, args.config), model=config["modelId"], epochs=args.epochs,
            log_dir=str(args.log_dir), display="none", fail_on_error=True
        )[0]
        logs[arm] = log.location
        observations[arm] = observed_samples(log, arm)
    blocks, summary = paired_report(observations)
    fixture = config["modelId"].startswith("mockllm/") or any(
        ref.startswith("fixture:") for arm in observations.values()
        for sample in arm.values() for ref in sample["evidenceRefs"]
    )
    report = {
        "schemaVersion": 1,
        "status": "fixture" if fixture else "experimental",
        "inspectVersion": version("inspect-ai"),
        "gitCommit": git_value("rev-parse", "HEAD"), "sourceDirty": bool(git_value("status", "--porcelain")),
        "taskSetSha256": hashlib.sha256(TASK_SET.read_bytes()).hexdigest(),
        "configSha256": hashlib.sha256(Path(args.config).read_bytes()).hexdigest(),
        "modelId": config["modelId"], "maxTokensPerSample": config["maxTokens"],
        "allowedTools": config["allowedTools"],
        "seed": config["seed"], "epochs": args.epochs, "logs": logs,
        "blocks": blocks, "summary": summary,
        "limitations": ["Runner evidence is reported by the adapter and requires independent audit.",
                        "Fixture runner scores are not model or topology results."]
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return report


def main():
    parser = argparse.ArgumentParser(description="Run three paired Inspect AI comparison arms")
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--log-dir", type=Path, required=True)
    parser.add_argument("--epochs", type=int, default=3)
    args = parser.parse_args()
    report = run(args)
    print(f'{args.output}: {len(report["blocks"])} independently scored blocks')


if __name__ == "__main__":
    main()
