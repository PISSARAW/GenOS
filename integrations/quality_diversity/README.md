# Quality-diversity lab

The synthetic fixtures exercise an isolated Pyribs archive and a ShinkaEvolve
evaluation task. No production worker or GVX promotion is changed.

Install requirements.txt into an isolated Python environment. Run test_lab.py,
then archive.py with separate train and holdout files. The Shinka launcher
validates configuration by default; --run requires an explicit --model.

The candidate file contains only a literal PARAMETERS assignment. The
evaluator parses its AST and does not execute candidate code. Keep real holdout
missions outside the evolution task and verify their receipts independently.