#!/usr/bin/env python3
"""Rejet automatique des fichiers dépassant les limites (Arbitre de Réalité)."""
import sys
from pathlib import Path
import re

MAX_LINES = 400
EXTENSIONS = {'.rs', '.js', '.mjs', '.py', '.ts'}
EXCLUDE_DIRS = {'node_modules', 'target', 'vendor', '.git', 'dist', 'build'}

def check_file(path: Path) -> list[str]:
    violations = []
    try:
        lines = path.read_text(encoding='utf-8', errors='ignore').splitlines()
        
        # 1. Vérification du nombre de lignes
        if len(lines) > MAX_LINES:
            violations.append(f"LINES:{len(lines)} > {MAX_LINES} (Règle 4)")
            
        # 2. Vérification grossière du nombre de paramètres (JS/TS/RS)
        for i, line in enumerate(lines, 1):
            if "fn " in line or "function " in line or "=>" in line:
                match = re.search(r'\((.*?)\)', line)
                if match:
                    params_str = match.group(1).strip()
                    if params_str:
                        param_count = params_str.count(',') + 1
                        if param_count > 3:
                            if "{" not in params_str and "[" not in params_str:
                                violations.append(f"PARAMS:{param_count} > 3 (Règle 2) à la ligne {i}")

    except Exception as e:
        violations.append(f"ERREUR LECTURE: {e}")
        
    return violations

def main() -> int:
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('.')
    errors = 0

    print(f"Lancement de l'Arbitre de Réalité sur {root.resolve()}...")
    
    for path in root.rglob('*'):
        if path.is_file() and path.suffix in EXTENSIONS:
            if any(p in path.parts for p in EXCLUDE_DIRS):
                continue
            
            violations = check_file(path)
            for v in violations:
                print(f"REJET {path}: {v}")
                errors += 1

    if errors > 0:
        print(f"\n{errors} violations trouvées. ÉCHEC de l'Arbitre de Réalité.")
        return 1
    
    print("\nAucune violation trouvée. SUCCÈS de l'Arbitre de Réalité.")
    return 0

if __name__ == '__main__':
    sys.exit(main())
