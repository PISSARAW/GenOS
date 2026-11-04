"""Copy the runtime sources and dependencies to D before experimental inference."""
import hashlib
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


def sha(path):
    return hashlib.file_digest(path.open('rb'), 'sha256').hexdigest()


def sources(root):
    families = ['backend', 'examples', 'mcp', 'shared', 'spec', 'agents',
                'docs', 'benchmarks', 'crates', 'packages', 'integrations/codex', 'scripts', '.cargo',
                'package.json', 'package-lock.json', 'backend/package.json',
                'backend/package-lock.json', 'mcp/package-lock.json', 'Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml']
    result = subprocess.run(['git', 'ls-files', '-co', '--exclude-standard', '-z', '--', *families],
                            cwd=root, check=True, capture_output=True)
    excluded = {'.db', '.sqlite', '.sqlite3', '.pem', '.key'}
    return sorted({name.decode('utf-8') for name in result.stdout.split(b'\0')
                   if name and Path(name.decode('utf-8')).suffix not in excluded
                   and not Path(name.decode('utf-8')).name.startswith('.env')})


def copy_file(input_paths):
    root, destination, name = input_paths
    content = (root / name).read_bytes()
    target = destination / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)
    return name, hashlib.sha256(content).hexdigest()


def copy_sources(root, destination):
    inputs = [(root, destination, name) for name in sources(root) if (root / name).is_file()]
    with ThreadPoolExecutor(max_workers=16) as pool:
        return dict(pool.map(copy_file, inputs))


def copy_dependencies(root, destination):
    for relative in ['node_modules', 'backend/node_modules', 'mcp/node_modules']:
        result = subprocess.run(['robocopy', str(root / relative), str(destination / relative),
                                 '/E', '/MT:16', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:0', '/W:0'],
                                capture_output=True, text=True)
        if result.returncode >= 8:
            raise RuntimeError('Dependency copy failed: ' + relative + '\n' + result.stdout)


def link_dependencies(source, destination):
    if source.drive.upper() != 'D:':
        raise RuntimeError('Dependency source must be a frozen D runtime')
    for relative in ['node_modules', 'backend/node_modules', 'mcp/node_modules']:
        script = 'require("node:fs").symlinkSync(process.argv[1],process.argv[2],"junction")'
        subprocess.run(['node', '-e', script, str(source / relative), str(destination / relative)], check=True)


def main():
    root = Path(__file__).resolve().parents[2]
    destination = Path(sys.argv[1]).resolve()
    if destination.drive.upper() != 'D:':
        raise RuntimeError('Frozen runtime must be on D')
    destination.mkdir(parents=True, exist_ok=False)
    records = copy_sources(root, destination)
    if len(sys.argv) > 2:
        link_dependencies(Path(sys.argv[2]).resolve(), destination)
    else:
        copy_dependencies(root, destination)
    revision = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=root, check=True,
                              capture_output=True, text=True).stdout.strip()
    manifest = {'schema': 'genos.runtime-source-freeze/v1', 'baseRevision': revision,
                'includesWorkingTreeChanges': True, 'sources': records,
                'sourcesHash': hashlib.sha256(json.dumps(records, sort_keys=True, ensure_ascii=False,
                                                        separators=(',', ':')).encode()).hexdigest(),
                'sourceHashEncoding': 'sorted-compact-utf8-json/v1',
                'dependencies': 'frozen D copies; package locks sealed as sources',
                'dependencyRoot': str(Path(sys.argv[2]).resolve()) if len(sys.argv) > 2 else str(destination)}
    (destination / 'runtime-source-manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(json.dumps({'directory': str(destination), 'files': len(records), 'hash': manifest['sourcesHash']}), flush=True)


if __name__ == '__main__':
    main()
