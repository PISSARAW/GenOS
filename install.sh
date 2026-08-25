#!/usr/bin/env bash
set -euo pipefail

# Get absolute path to the GenOS repository
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="$HOME/.genos/bin"

echo "Building GenOS release binaries..."
cd "$REPO_ROOT"
cargo build --release --workspace

echo "Creating global bin directory at $BIN_DIR..."
mkdir -p "$BIN_DIR"

# Paths to the built binaries and orchestrator bridge
GENOS_EXE="$REPO_ROOT/target/release/genos"
MCP_EXE="$REPO_ROOT/target/release/genos-mcp"
ORCHESTRATOR_BRIDGE="$REPO_ROOT/backend/bin/genos-orchestrate.cjs"

# Create genos wrapper
echo "Generating genos wrapper..."
cat > "$BIN_DIR/genos" <<EOF
#!/usr/bin/env bash
export GENOS_ORCHESTRATOR_BRIDGE="$ORCHESTRATOR_BRIDGE"
exec "$GENOS_EXE" "\$@"
EOF
chmod +x "$BIN_DIR/genos"

# Create genos-mcp wrapper
echo "Generating genos-mcp wrapper..."
cat > "$BIN_DIR/genos-mcp" <<EOF
#!/usr/bin/env bash
export GENOS_ORCHESTRATOR_BRIDGE="$ORCHESTRATOR_BRIDGE"
export GENOS_BIN="$GENOS_EXE"
exec "$MCP_EXE" "\$@"
EOF
chmod +x "$BIN_DIR/genos-mcp"

echo ""
echo "✅ Installation complete!"
echo "The executables have been installed to: $BIN_DIR"
echo ""
echo "Please add the following line to your ~/.bashrc, ~/.zshrc, or profile:"
echo 'export PATH="$HOME/.genos/bin:$PATH"'
echo ""
echo "Once added, you can run 'genos' and 'genos-mcp' from anywhere."
