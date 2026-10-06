import json
import tempfile
import unittest
from pathlib import Path
from benchmarks import agentdojo_summary, run_browsergym


class FakeEnv:
    closed = False

    def reset(self):
        return {"observation": 1}, {}

    def step(self, action):
        return {}, 1.0 if action == "safe" else 0.0, True, False, {}

    def close(self):
        self.closed = True


class FakeGym:
    env = FakeEnv()

    def make(self, task):
        assert task == "browsergym/example"
        return self.env


class BenchmarkTests(unittest.TestCase):
    def test_agentdojo_does_not_conflate_blocking_and_utility(self):
        with tempfile.TemporaryDirectory() as folder:
            Path(folder, "one.json").write_text(json.dumps({"user_task_id": "t1", "utility": False,
                                                                "security": True, "attack_type": "tool-response"}))
            Path(folder, "two.json").write_text(json.dumps({"user_task_id": "t2", "utility": True,
                                                                "security": False, "attack_type": "tool-response"}))
            result = agentdojo_summary(folder)
            self.assertEqual(result["utility_rate"], 0.5)
            self.assertEqual(result["security_rate"], 0.5)

    def test_browsergym_closes_and_bounds_environment(self):
        gym = FakeGym()
        result = run_browsergym("browsergym/example", lambda _: "safe", options={"gym_module": gym})
        self.assertEqual(result["reward"], 1.0)
        self.assertTrue(gym.env.closed)
        with self.assertRaises(ValueError):
            run_browsergym("other/example", lambda _: "safe", options={"gym_module": gym})


if __name__ == "__main__":
    unittest.main()
