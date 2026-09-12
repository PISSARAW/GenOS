#!/usr/bin/env bash
# GenOS Installation & Build Script for Linux / macOS
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

echo "============================================================"
echo "  GenOS v3 — Installation & Configuration Complète"
echo "============================================================"

echo ""
echo "1. Vérification des prérequis système..."
if ! command -v cargo &> /dev/null; then
    echo "Cargo/Rust est introuvable. Veuillez installer Rust via https://rustup.rs"
    exit 1
fi
echo "  [OK] Rust/Cargo détecté : $(cargo --version)"

if ! command -v node &> /dev/null; then
    echo "Node.js est introuvable. Veuillez installer Node.js >= 18."
    exit 1
fi
echo "  [OK] Node.js détecté : $(node --version)"

echo ""
echo "2. Installation des dépendances Node.js du Backend..."
if [ -f "$REPO_ROOT/backend/package.json" ]; then
    npm --prefix "$REPO_ROOT/backend" install --silent
    echo "  [OK] Dépendances backend installées."
fi

echo ""
echo "3. Compilation de l'espace de travail Rust (Release)..."
cargo build --release --workspace
echo "  [OK] Binaires Rust compilés avec succès."

echo ""
echo "4. Exécution du banc d'essai Quantum VFS & MCP..."
node "$REPO_ROOT/backend/tests/test_quantum_vfs_decoherence.js"
node "$REPO_ROOT/backend/tests/test_quantum_vfs_wiring.js"
cargo test -q -p genos-mcp
echo "  [OK] Tous les tests de validation ont réussi."

echo ""
echo "============================================================"
echo "  INSTALLATION DE GENOS TERMINÉE AVEC SUCCÈS !"
echo "============================================================"
echo "  Commandes disponibles :"
echo "    - CLI Native   : ./target/release/genos --help"
echo "    - Quantum VFS  : ./target/release/genos quantum-vfs --help"
echo "    - MCP Server   : ./target/release/genos-mcp"
echo "============================================================"
