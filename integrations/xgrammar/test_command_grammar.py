import unittest
from command_grammar import EBNF, compile_grammar, parse_command, summarize_trials


class CommandGrammarTests(unittest.TestCase):
    def test_xgrammar_compiles_and_matches(self):
        import xgrammar as xgr
        vocab = sorted(set("READ SCOREabc0123456789_./-"))
        tokenizer = xgr.TokenizerInfo(vocab, stop_token_ids=[])
        compiled = compile_grammar(tokenizer)
        good = xgr.GrammarMatcher(compiled)
        self.assertTrue(good.accept_string("READ abc"))
        self.assertTrue(good.is_completed())
        bad = xgr.GrammarMatcher(compiled)
        self.assertFalse(bad.accept_string("DELETE abc"))
        self.assertIn("root", str(xgr.Grammar.from_ebnf(EBNF)))

    def test_authority_is_separate(self):
        self.assertEqual(parse_command("READ a/b", {"a/b"})["path"], "a/b")
        with self.assertRaises(PermissionError):
            parse_command("READ ../secret", {"../secret"})
        with self.assertRaises(PermissionError):
            parse_command("SCORE 101", set())

    def test_comparable_trial_metrics(self):
        rows = [{"task": "t1", "mode": "free", "output": "read a", "repaired": True, "tokens": 9},
                {"task": "t1", "mode": "constrained", "output": "READ a", "repaired": False, "tokens": 3}]
        summary = summarize_trials(rows)
        self.assertEqual(summary["free"]["format_errors"], 1)
        self.assertEqual(summary["constrained"]["tokens"], 3)


if __name__ == "__main__":
    unittest.main()
