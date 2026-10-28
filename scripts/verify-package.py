"""Independently inspect and extract the store ZIP. Standard library, Python 3.9+."""
from pathlib import Path, PurePosixPath
import hashlib
import json
import re
import struct
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def main():
    target = ROOT / 'dist' / 'chatgpt-status-dot.zip'
    with zipfile.ZipFile(target) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)) or archive.testzip() is not None:
            raise ValueError('Duplicate or corrupted archive entries')
        if any(PurePosixPath(name).is_absolute() or '..' in PurePosixPath(name).parts or '\\' in name for name in names):
            raise ValueError('Unsafe archive path')
        manifest = json.loads(archive.read('manifest.json'))
        if manifest['manifest_version'] != 3 or 'update_url' in manifest:
            raise ValueError('Invalid store manifest')
        if set(manifest['permissions']) != {'scripting', 'storage'}:
            raise ValueError('Unexpected permission')
        if set(manifest['host_permissions']) != {'https://chatgpt.com/*', 'https://chat.openai.com/*', 'https://cdn.oaistatic.com/*'}:
            raise ValueError('Unexpected host permission')
        expected = {'manifest.json', 'LICENSE', 'NOTICE', 'PRIVACY.md', manifest['background']['service_worker'], manifest['action']['default_popup']}
        for entry in manifest['content_scripts']:
            expected.update(entry['js'])
        for size in (16, 32, 48, 128):
            name = manifest['icons'][str(size)]
            if name != manifest['action']['default_icon'][str(size)]:
                raise ValueError('Action icon differs')
            data = archive.read(name)
            if data[:8] != b'\x89PNG\r\n\x1a\n' or struct.unpack('>II', data[16:24]) != (size, size):
                raise ValueError('Invalid icon: ' + name)
            expected.add(name)
        expected.update(re.findall(r'(?:src|href)="([^"#]+)"', archive.read(manifest['action']['default_popup']).decode()))
        if set(names) != expected:
            raise ValueError('Unexpected or missing files: ' + str(set(names) ^ expected))
        build = re.search(rb'const BUILD = "([^"]+)";', archive.read('content.js'))
        if not build or build[1].decode() != manifest['version'] or json.loads((ROOT / 'package.json').read_text())['version'] != manifest['version']:
            raise ValueError('Version mismatch')
        for name in names:
            source = ROOT / name if name in {'LICENSE', 'NOTICE', 'PRIVACY.md'} else ROOT / 'extension' / name
            if archive.read(name) != source.read_bytes():
                raise ValueError('ZIP differs from reviewed file: ' + name)
        artifacts = ROOT / 'artifacts'
        artifacts.mkdir(exist_ok=True)
        extracted = Path(tempfile.mkdtemp(prefix='verified-extension-', dir=artifacts))
        archive.extractall(extracted)
    report = {
        'archive': str(target), 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
        'version': manifest['version'], 'files': sorted(names), 'extracted': str(extracted),
        'result': 'PASS: exact runtime resources, matching bytes, root manifest, legal files; no tests, store assets or temporary data',
        'liveChatGPTVerified': False,
    }
    (ROOT / 'artifacts' / 'package-verification.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
