"""Build and seal native binaries against frozen D runtime sources before inference."""
import hashlib
import json
import os
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


def sha(filename):
    return hashlib.file_digest(filename.open('rb'), 'sha256').hexdigest()


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                                    separators=(',', ':')).encode()).hexdigest()


def build(runtime, target):
    env = {**os.environ, 'CARGO_TARGET_DIR': str(target), 'TEMP': 'D:/gv3/tmp', 'TMP': 'D:/gv3/tmp'}
    with (runtime / 'native-build.log').open('w', encoding='utf-8') as log:
        subprocess.run(['cargo', 'build', '--manifest-path', str(runtime / 'Cargo.toml'),
                        '-p', 'genos-cli', '-p', 'genos-mcp'], env=env, stdout=log,
                       stderr=subprocess.STDOUT, check=True)


def verify_source(item):
    filename, expected = item
    if sha(filename) != expected:
        raise RuntimeError('Frozen source changed: ' + str(filename))


def main():
    runtime, target = [Path(value).resolve() for value in sys.argv[1:3]]
    if any(value.drive.upper() != 'D:' for value in [runtime, target]):
        raise RuntimeError('Runtime and build target must be on D')
    manifest_path = runtime / 'runtime-source-manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    if manifest.get('sealedBeforeInference'):
        raise RuntimeError('Never reseal an experimental runtime. Create a fresh copy.')
    print(json.dumps({'stage': 'build', 'runtime': str(runtime)}), flush=True)
    build(runtime, target)
    print(json.dumps({'stage': 'verify-sources', 'files': len(manifest['sources'])}), flush=True)
    inputs = [(runtime / name, expected) for name, expected in manifest['sources'].items()]
    with ThreadPoolExecutor(max_workers=16) as pool:
        list(pool.map(verify_source, inputs))
    binaries = {}
    for name in ['genos.exe', 'genos-mcp.exe']:
        relative = 'target/debug/' + name
        output = runtime / relative
        output.parent.mkdir(parents=True, exist_ok=True)
        if output.exists():
            output.unlink()
        shutil.copy2(target / 'debug' / name, output)
        binaries[relative] = sha(output)
    manifest['binaries'] = binaries
    manifest['nodeHash'] = sha(Path(shutil.which('node')))
    manifest['sourceHashEncoding'] = 'sorted-compact-utf8-json/v1'
    manifest['sourcesHash'] = fingerprint(manifest['sources'])
    binding = {key: manifest[key] for key in ['sourcesHash', 'binaries', 'nodeHash']}
    manifest['runtimeHash'] = fingerprint(binding)
    manifest['sealedBeforeInference'] = True
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(json.dumps({'directory': str(runtime), 'sourcesHash': manifest['sourcesHash'],
                      'runtimeHash': manifest['runtimeHash']}), flush=True)


if __name__ == '__main__':
    main()
