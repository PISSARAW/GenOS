# Install a GenOS alpha

GenOS has not published an official GitHub release yet. The `0.0.1` entry in
the changelog records a development milestone; it is not an installable
release. Until the first checksummed alpha is published, building from a reviewed
commit is the supported installation path.

The CLI executable is named `genos`. The Rust package is named `genos-cli`
inside this repository only: do not install or publish the unrelated
`genos-cli` package currently present on crates.io.

## Build from source

Requirements:

- Git
- Rust 1.88 or newer, installed with `rustup`

Clone a tag or commit you have reviewed, then build only the CLI package:

```bash
git clone https://github.com/PISSARAW/GenOS.git
cd GenOS
cargo build --locked --release -p genos-cli
./target/release/genos --version
```

On Windows, run `target\release\genos.exe --version` instead. You may copy the
resulting executable to a directory already present in your `PATH`. Avoid
running unreviewed `curl | sh` installers or using `cargo install genos-cli`.

## Install a future alpha archive

An alpha tag such as `v0.1.0-alpha.1` will produce these assets:

| Platform | Archive |
| --- | --- |
| Linux x86-64 | `genos-x86_64-unknown-linux-gnu.tar.gz` |
| macOS Intel | `genos-x86_64-apple-darwin.tar.gz` |
| macOS Apple Silicon | `genos-aarch64-apple-darwin.tar.gz` |
| Windows x86-64 | `genos-x86_64-pc-windows-msvc.zip` |

Download the archive and `SHA256SUMS.txt` from the same GitHub prerelease.
Verify the archive before extracting it:

```bash
# Linux
sha256sum --check --ignore-missing SHA256SUMS.txt

# macOS Apple Silicon
grep 'genos-aarch64-apple-darwin.tar.gz$' SHA256SUMS.txt | shasum -a 256 -c -
```

On Windows PowerShell, compare the published hash with:

```powershell
Get-FileHash .\genos-x86_64-pc-windows-msvc.zip -Algorithm SHA256
```

The alpha archives contain the executable, license, and project README. They
do not include Studio or promise stable CLI compatibility.

## Maintainer release procedure

The release workflow is intentionally limited to prereleases. Before tagging:

1. ensure required CI checks are green on the exact commit;
2. update `CHANGELOG.md` and confirm the version is marked pre-release;
3. create an annotated tag such as `v0.1.0-alpha.1`;
4. push that tag only after review.

The tag starts `.github/workflows/release-alpha.yml`, which builds native CLI
binaries on Linux, macOS Intel, macOS Apple Silicon, and Windows. It generates
`SHA256SUMS.txt` and creates or updates a GitHub prerelease. A manual workflow
run builds downloadable Actions artifacts but deliberately publishes nothing.

No package is uploaded to crates.io by this workflow.
