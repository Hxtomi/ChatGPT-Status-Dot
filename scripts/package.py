"""Build only explicit, reviewed files. No recursive directory copies."""
from pathlib import Path, PurePosixPath
import hashlib
import json
import re
import stat
import struct
import zipfile

ROOT = Path(__file__).resolve().parents[1]

def main():
    names = json.loads((ROOT / 'release-files.json').read_text(encoding='utf-8'))
    if not isinstance(names, list) or not names or len(names) != len(set(names)):
        raise ValueError('Release file list must be nonempty and unique')
    files = {}
    for name in names:
        rel = PurePosixPath(name)
        if not isinstance(name, str) or rel.is_absolute() or '..' in rel.parts or '\\' in name or str(rel) != name:
            raise ValueError('Unsafe release path')
        current = ROOT
        for part in rel.parts:
            current /= part
            if current.is_symlink():
                raise ValueError('Symlinks are not allowed in releases')
        if not current.is_file() or not current.resolve().is_relative_to(ROOT):
            raise ValueError('Missing or unsafe release file: ' + name)
        files[name] = current.read_bytes()

    manifest = json.loads(files['extension/manifest.json'])
    version = manifest['version']
    if not re.fullmatch(r'(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*)){0,3}', version) or not any(int(part) for part in version.split('.')) or any(int(part) > 65535 for part in version.split('.')):
        raise ValueError('Invalid release version')
    package_version = json.loads(files['package.json'])['version']
    build = re.search(rb'const BUILD = "([^"]+)";', files['extension/content.js'])
    if package_version != version or not build or build[1].decode() != version:
        raise ValueError('Manifest, package.json and content BUILD versions must match')
    if 'update_url' in manifest:
        raise ValueError('Edge Add-ons package must not contain update_url')
    resources = [manifest['background']['service_worker'], manifest['action']['default_popup']]
    for script in manifest['content_scripts']:
        resources.extend(script['js'])
    for size in (16, 32, 48, 128):
        name = manifest['icons'][str(size)]
        if manifest['action']['default_icon'][str(size)] != name:
            raise ValueError('Extension and action icons must match')
        data = files['extension/' + name]
        if data[:8] != b'\x89PNG\r\n\x1a\n' or struct.unpack('>II', data[16:24]) != (size, size):
            raise ValueError('Invalid PNG icon dimensions: ' + name)
        resources.append(name)
    resources.extend(re.findall(r'(?:src|href)="([^"#]+)"', files['extension/popup.html'].decode()))
    if any('extension/' + name not in files for name in resources):
        raise ValueError('A manifest or popup resource is missing from release-files.json')
    out = ROOT / 'dist'
    out.mkdir(exist_ok=True)
    if out.is_symlink() or not out.resolve().is_relative_to(ROOT):
        raise ValueError('Unsafe output directory')
    for kind in ['source', 'extension']:
        selected = {name: data for name, data in files.items() if kind == 'source' or name.startswith('extension/') or name in ['LICENSE', 'NOTICE', 'PRIVACY.md']}
        packed = {name.removeprefix('extension/') if kind == 'extension' else name: data for name, data in selected.items()}
        filename = 'chatgpt-status-dot.zip' if kind == 'extension' else f'chatgpt-status-dot-{version}-source.zip'
        target = out / filename
        if target.is_symlink():
            raise ValueError('Unsafe archive output')
        with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            for name, data in sorted(packed.items()):
                info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.create_system = 3
                info.external_attr = (stat.S_IFREG | 0o644) << 16
                archive.writestr(info, data)
        with zipfile.ZipFile(target) as archive:
            assert set(archive.namelist()) == set(packed)
            assert archive.testzip() is None
            for name, expected in packed.items():
                assert archive.read(name) == expected
        print(f'{target.name}: {len(packed)} files; SHA-256 {hashlib.sha256(target.read_bytes()).hexdigest()}')

if __name__ == '__main__':
    main()
