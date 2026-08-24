# Security policy

## Supported versions

GenOS is pre-alpha and does not yet publish supported release lines. Security fixes are applied to the default branch. Until the project reaches a stable release, users should treat every revision as experimental and review changes before deployment.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability.

Use GitHub's private vulnerability reporting for this repository:

1. Open the repository's **Security** tab.
2. Select **Advisories**.
3. Select **Report a vulnerability**.

Include the affected revision, impact, prerequisites, reproduction steps, and a minimal proof of concept when safe. Remove credentials, private data, and third-party secrets from the report.

If private vulnerability reporting is unavailable, contact the maintainer through the private contact method listed on the maintainer's GitHub profile and mention `GenOS security` in the subject. Do not send exploit details through a public discussion.

Triage, remediation, disclosure timing, and credit will be coordinated privately. The maintainer acknowledges reports within **5 business days** and aims to ship a fix or an explicit mitigation decision within **30 days** for high-severity findings. Please allow this remediation period before public disclosure.

## Scope

High-priority areas include:

- world or worktree escape, including path traversal and symlink attacks;
- command execution outside the selected capsule or world;
- cross-branch state, event, artifact, or filesystem leakage;
- permission bypass in tool execution;
- snapshot, manifest, or artifact integrity failures;
- secret exposure through logs, provenance, replay, or generated artifacts;
- unsafe deserialization or injection in provider and storage boundaries.

Model hallucinations, prompt-quality issues, and expected behavior of explicitly unsafe demo environments are generally not vulnerabilities unless they cross a documented trust boundary.

## Operational warning

GenOS can execute commands and manipulate isolated workspaces. Isolation providers are development primitives, not security sandboxes. Do not run untrusted code or grant production credentials based solely on GenOS world isolation.
