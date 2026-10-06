"""Compact GenOS command grammar; syntax and authority are independent."""
import re

EBNF = r"""
root ::= "READ " path | "SCORE " number
path ::= [a-zA-Z0-9_./-]+
number ::= [0-9]+
"""
COMMAND = re.compile(r"^(READ [a-zA-Z0-9_./-]+|SCORE [0-9]+)$")


def compile_grammar(tokenizer_info):
    import xgrammar as xgr
    return xgr.GrammarCompiler(tokenizer_info).compile_grammar(EBNF)


def parse_command(text, allowed_paths):
    if not isinstance(text, str) or len(text) > 256 or not COMMAND.fullmatch(text):
        raise ValueError("invalid command syntax")
    verb, argument = text.split(" ", 1)
    if verb == "READ":
        if argument.startswith("/") or ".." in argument.split("/") or argument not in allowed_paths:
            raise PermissionError("path not authorized")
        return {"verb": verb, "path": argument}
    number = int(argument)
    if number > 100:
        raise PermissionError("score exceeds budget")
    return {"verb": verb, "value": number}


def mode_summary(rows):
    if not rows:
        raise ValueError("both trial modes required")
    return {"count": len(rows), "format_errors": sum(not COMMAND.fullmatch(row["output"]) for row in rows),
            "repairs": sum(bool(row["repaired"]) for row in rows),
            "tokens": sum(row["tokens"] for row in rows)}


def summarize_trials(trials):
    summary = {mode: mode_summary([row for row in trials if row.get("mode") == mode])
               for mode in ("free", "constrained")}
    tasks = {mode: {row["task"] for row in trials if row["mode"] == mode}
             for mode in summary}
    if tasks["free"] != tasks["constrained"]:
        raise ValueError("trial tasks differ")
    return summary
