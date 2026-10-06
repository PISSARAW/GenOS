"""Bancs externes AgentDojo et BrowserGym; aucun verdict GenOS implicite."""
import json
from pathlib import Path


def agentdojo_summary(logdir):
    """Read official TaskResults JSON logs; report utility and security separately."""
    root = Path(logdir).resolve()
    rows = []
    for path in sorted(root.rglob("*.json")):
        if len(rows) >= 10000:
            raise ValueError("too many benchmark results")
        if path.stat().st_size > 2_000_000:
            raise ValueError("benchmark result too large")
        row = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(row, dict) or not {"utility", "security", "user_task_id"} <= row.keys():
            continue
        if type(row["utility"]) is not bool or type(row["security"]) is not bool:
            raise ValueError("invalid AgentDojo verdict")
        rows.append({"task": str(row["user_task_id"]), "utility": row["utility"],
                     "security": row["security"], "attack": row.get("attack_type")})
    if not rows:
        raise ValueError("no AgentDojo TaskResults found")
    return {"count": len(rows), "utility_rate": sum(x["utility"] for x in rows) / len(rows),
            "security_rate": sum(x["security"] for x in rows) / len(rows), "rows": rows}


def run_browsergym(task, policy, options=None):
    options = options or {}
    max_steps = options.get('max_steps', 30)
    gym_module = options.get('gym_module')
    """Run a bounded policy against a registered BrowserGym environment."""
    if not isinstance(task, str) or not task.startswith("browsergym/"):
        raise ValueError("BrowserGym task id required")
    if not isinstance(max_steps, int) or not 1 <= max_steps <= 100:
        raise ValueError("max_steps must be 1..100")
    if gym_module is None:
        import browsergym.core
        import gymnasium as gym_module
    env = gym_module.make(task)
    try:
        observation, _ = env.reset()
        for step in range(1, max_steps + 1):
            action = policy(observation)
            observation, reward, terminated, truncated, info = env.step(action)
            if terminated or truncated:
                return {"task": task, "steps": step, "reward": float(reward),
                        "terminated": bool(terminated), "truncated": bool(truncated)}
        return {"task": task, "steps": max_steps, "reward": None,
                "terminated": False, "truncated": True}
    finally:
        env.close()
