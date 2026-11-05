"""Sceller les artefacts DPB termines sans publier leurs donnees privees."""
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path


def sha256(filename):
    value = hashlib.sha256()
    with filename.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def accessible_directory(directory):
    if os.name != 'nt':
        return directory
    value = str(directory.resolve())
    if value.startswith('\\\\?\\'):
        return Path(value)
    if value.startswith('\\\\'):
        return Path('\\\\?\\UNC\\' + value[2:])
    return Path('\\\\?\\' + value)


def sources(directory):
    directory = accessible_directory(directory)
    ignored = {'evidence-manifest.json', 'evidence-manifest.sha256'}
    result = {}
    for filename in sorted(directory.rglob('*')):
        if filename.is_symlink() or getattr(filename, 'is_junction', lambda: False)():
            raise ValueError('Evidence symlinks are forbidden: ' + str(filename))
        if filename.is_file() and filename.relative_to(directory).as_posix() not in ignored:
            result[filename.relative_to(directory).as_posix()] = {'bytes': filename.stat().st_size,
                                                               'sha256': sha256(filename)}
    return result


def seal(directory):
    completion = json.loads((directory / 'campaign-completion.json').read_text(encoding='utf-8'))
    if not completion['runtimeVerifiedAfterCampaign'] or completion['trials'] != 90:
        raise ValueError('Complete verified campaign required')
    if not (directory / 'analysis.json').exists():
        raise ValueError('Independent analysis required before sealing')
    filename = directory / 'evidence-manifest.json'
    if filename.exists():
        raise ValueError('Existing evidence seal must never be overwritten')
    manifest = {'schema': 'dpb.native-evidence-seal/v1', 'createdAt': datetime.now(timezone.utc).isoformat(),
                'files': sources(directory), 'scope': 'Local evidence; includes private runtime files; hashes only.'}
    filename.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    value = sha256(filename)
    (directory / 'evidence-manifest.sha256').write_text(value + '\n', encoding='ascii')
    return {'manifest': str(filename), 'sha256': value, 'files': len(manifest['files'])}


def verify(directory):
    filename = directory / 'evidence-manifest.json'
    if sha256(filename) != (directory / 'evidence-manifest.sha256').read_text().strip():
        raise ValueError('Evidence manifest changed')
    manifest = json.loads(filename.read_text(encoding='utf-8'))
    if manifest['files'] != sources(directory):
        raise ValueError('Evidence files changed')
    return {'verified': True, 'files': len(manifest['files'])}


if __name__ == '__main__':
    target = Path(sys.argv[1]).resolve()
    print(json.dumps(verify(target) if '--verify' in sys.argv else seal(target), indent=2))
