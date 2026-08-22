# Good first issue backlog

These are proposals for maintainers to turn into GitHub issues. They are small,
testable, and avoid assigning ownership before a contributor volunteers.

## 1. Add JSON Schema validation to the counterfactual demo

**Outcome:** validate the demo's generated agent and snapshot documents against
the schemas under `spec/`.

**Acceptance criteria:** the validation runs in `run-demo.sh` and
`run-demo.ps1`, reports the failing file and schema, and requires no network or
model credentials.

## 2. Add a benchmark environment redaction test

**Outcome:** prevent hostnames, usernames, or absolute home paths from leaking
into publishable benchmark bundles.

**Acceptance criteria:** a focused test covers Linux, macOS, and Windows-style
paths and preserves non-sensitive OS/architecture metadata.

## 3. Document one unsupported replay boundary with an executable test

**Outcome:** choose model output, wall-clock time, network access, or an external
tool and turn the limitation into a focused test and documentation link.

**Acceptance criteria:** the test is deterministic, the documentation does not
overstate the guarantee, and existing replay tests remain green.

## 4. Add a machine-readable example catalog

**Outcome:** add an index that maps each maintained example to its command,
runtime requirements, expected evidence, and maturity.

**Acceptance criteria:** a validation script rejects missing directories and
duplicate identifiers; `examples/README.md` links to the catalog.

## 5. Add an accessibility check for GenOS Studio screenshots

**Outcome:** document alt text, contrast, and keyboard-visible state for the
three README screenshots.

**Acceptance criteria:** the checklist identifies the tested Studio revision,
viewport, theme, and any unresolved issue without altering benchmark claims.

Use the repository's good-first-issue template when promoting one proposal to
GitHub. Maintainers should add exact file pointers and confirm that the scope is
still current before publishing it.
