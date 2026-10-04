"""Exercise the process boundary and the independent oracle with a fixture."""

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from protocol import load_config, make_request, run_oracle, run_runner, validate_response


CONFIG = Path(__file__).with_name("fixture-config.json")


class ProtocolTests(unittest.IsolatedAsyncioTestCase):
    async def test_all_arms_share_seed_and_receive_independent_scores(self):
        base = load_config(CONFIG)
        state = SimpleNamespace(sample_id="arithmetic-partition", input_text="compute", epoch=1)
        requests = [make_request(state, {**base, "arm": arm}) for arm in
                    ("model-alone", "fixed-topology", "morphogenesis")]
        self.assertEqual(len({request["seed"] for request in requests}), 1)
        for request in requests:
            response, answer = await run_runner(request, base)
            self.assertEqual(response["status"], "completed")
            self.assertTrue((await run_oracle(request["taskId"], answer))["passed"])
        self.assertFalse((await run_oracle("arithmetic-partition", {}))["passed"])

    async def test_runner_identity_and_budget_mismatch_fail_closed(self):
        config = {**load_config(CONFIG), "arm": "fixed-topology"}
        state = SimpleNamespace(sample_id="dependency-order", input_text="order", epoch=1)
        request = make_request(state, config)
        response, _answer = await run_runner(request, config)
        with self.assertRaisesRegex(ValueError, "modelId"):
            validate_response({**response, "modelId": "other-model"}, request)
        with self.assertRaisesRegex(ValueError, "budget"):
            validate_response({**response, "tokensUsed": request["maxTokens"] + 1}, request)
        with self.assertRaisesRegex(ValueError, "fixed topology"):
            validate_response({**response, "topologyUsed": "a_team"}, request)
        with self.assertRaisesRegex(ValueError, "common allowance"):
            validate_response({**response, "toolsUsed": ["unleased-tool"]}, request)
        with self.assertRaisesRegex(ValueError, "did not complete"):
            validate_response({**response, "status": "accepted"}, request)


if __name__ == "__main__":
    unittest.main()
