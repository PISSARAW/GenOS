#!/usr/bin/env bash
set -euo pipefail

# Get absolute path to the GenOS repository
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="$HOME/.genos/bin"

echo "Installing backend dependencies..."
cd "$REPO_ROOT/backend"
npm install

echo "Building GenOS Studio..."
cd "$REPO_ROOT/studio"
npm install
npm run build

echo "Building GenOS release binaries..."
cd "$REPO_ROOT"
cargo build --release --workspace

echo "Creating global bin directory at $BIN_DIR..."
mkdir -p "$BIN_DIR"

# Paths to the built binaries and orchestrator bridge
GENOS_EXE="$REPO_ROOT/target/release/genos"
MCP_EXE="$REPO_ROOT/target/release/genos-mcp"
ORCHESTRATOR_BRIDGE="$REPO_ROOT/scripts/orchestrator_cli.mjs"

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

echo "Adding $BIN_DIR to your PATH..."
PATH_LINE='export PATH="$HOME/.genos/bin:$PATH"'

SHELL_NAME="$(basename "${SHELL:-bash}")"
case "$SHELL_NAME" in
    zsh)  PROFILE="$HOME/.zshrc" ;;
    bash)
        if [ "$(uname)" = "Darwin" ]; then
            PROFILE="$HOME/.zprofile"
        else
            PROFILE="$HOME/.bashrc"
        fi
        ;;
    *)    PROFILE="$HOME/.profile" ;;
esac

if [ -f "$PROFILE" ] && grep -q '\.genos/bin' "$PROFILE"; then
    echo "PATH already configured in $PROFILE, skipping."
else
    printf '\n# GenOS CLI\n%s\n' "$PATH_LINE" >> "$PROFILE"
    echo "Added GenOS to $PROFILE"
fi

# Make genos available immediately in the current session
case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *) export PATH="$BIN_DIR:$PATH" ;;
esac

echo ""
echo "✅ Installation complete!"
echo "The executables have been installed to: $BIN_DIR"
echo "They are usable right now in this session. Open a new terminal elsewhere and 'genos' and 'genos-mcp' will also be available from anywhere."
