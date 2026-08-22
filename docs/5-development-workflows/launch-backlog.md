# GitHub launch backlog

This backlog turns the project launch into verifiable gates. It does not imply
that GitHub issues, repository settings, or releases have already been created.

## Gate 1: Trust

- [ ] Required CI checks pass on Linux, macOS, and Windows.
- [ ] Dependency advisories are resolved or documented with an owner and date.
- [ ] `main` protection requires the maintained checks.
- [ ] Security boundaries are described without claiming OS isolation where it
  is not implemented.

## Gate 2: Installability

- [ ] Publish a signed prerelease with platform binaries and checksums.
- [ ] Validate installation in a clean container and a clean desktop VM.
- [ ] Provide one supported uninstall path.
- [ ] Publish an SBOM and provenance for release artifacts.

## Gate 3: Thirty-second proof

- [ ] Record `snapshot -> fork -> mutate -> diff -> replay` without cuts that
  hide setup or failures.
- [ ] Link every on-screen claim to an executable example.
- [ ] Add captions and a text transcript.
- [ ] Verify the demo without model-provider credentials.

## Gate 4: Evidence

- [ ] Commit a reviewed raw benchmark result bundle.
- [ ] Add at least one versioned external-runtime adapter.
- [ ] Report unsupported metrics instead of encoding them as zero.
- [ ] Obtain an independent reproduction on a second machine.

## Gate 5: Community signal

- [ ] Prepare five issues from the [good first issue backlog](good-first-issues.md).
- [ ] Document one external integration and one pilot use case.
- [ ] Enable Discussions and publish a contribution welcome post.
- [ ] Collect permission before quoting any user or organization.

## Gate 6: Coordinated launch

- [ ] Set the repository social preview to `assets/brand/social-preview.png`.
- [ ] Publish the release, demo, benchmark protocol, and technical article from
  the same tagged revision.
- [ ] Triage launch feedback daily for the first week.
- [ ] Publish a follow-up that reports failures and limitations as well as wins.
