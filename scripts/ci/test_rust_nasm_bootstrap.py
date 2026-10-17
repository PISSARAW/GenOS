from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = (ROOT / 'scripts' / 'ci' / 'install-nasm.ps1').read_text(encoding='utf-8')
DOC = (ROOT / 'docs' / '06-qualite-preuves' / 'rust-preflight-windows.md').read_text(encoding='utf-8')
WORKFLOW = (ROOT / '.github' / 'workflows' / 'validation.yml').read_text(encoding='utf-8')

assert "[switch] $Install" in SCRIPT
assert "[switch] $Yes" in SCRIPT
assert 'winget.exe install --id NASM.NASM' in SCRIPT
assert 'choco.exe install nasm' in SCRIPT
assert 'if (-not $Install)' in SCRIPT
assert 'if (-not $Yes)' in SCRIPT
assert '-Install -Yes' in DOC
assert 'install-nasm.ps1 -Install -Yes' in WORKFLOW

print('NASM bootstrap contract checks passed.')
