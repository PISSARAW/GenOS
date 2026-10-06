"""Explicit, bounded Shinka launcher; validation mode makes no model calls."""

import argparse
import json
from pathlib import Path

from shinka.core import EvolutionConfig, ShinkaEvolveRunner
from shinka.database import DatabaseConfig
from shinka.launch import LocalJobConfig


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model")
    parser.add_argument("--generations", type=int, default=2)
    parser.add_argument("--run", action="store_true")
    args = parser.parse_args()
    if not 1 <= args.generations <= 10:
        parser.error("generations must be between 1 and 10")
    if args.run and not args.model:
        parser.error("--model is required when --run is set")
    root = Path(__file__).resolve().parent
    model = args.model or "local/unconfigured@http://127.0.0.1:9/v1"
    evo = EvolutionConfig(
        init_program_path=str(root / "initial.py"),
        num_generations=args.generations,
        llm_models=[model],
        language="python",
        task_sys_msg="Edit only the literal PARAMETERS weights; preserve the evaluator.",
    )
    job = LocalJobConfig(eval_program_path=str(root / "evaluate.py"))
    database = DatabaseConfig(archive_size=12, num_islands=2)
    if not args.run:
        print(json.dumps({"validated": True, "generations": evo.num_generations,
                          "evaluation": job.eval_program_path,
                          "archive_size": database.archive_size}))
        return
    runner = ShinkaEvolveRunner(
        evo_config=evo, job_config=job, db_config=database,
        max_evaluation_jobs=1, max_proposal_jobs=1,
    )
    runner.run()


if __name__ == "__main__":
    main()