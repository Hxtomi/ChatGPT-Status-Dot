"""Packager regressions run entirely in disposable copies, never alter source."""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]


class PackageTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='status-dot-package-')
        self.root = Path(self.temp.name)
        for name in json.loads((ROOT / 'release-files.json').read_text()):
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, target)

    def tearDown(self):
        self.temp.cleanup()

    def build(self):
        return subprocess.run([sys.executable, str(self.root / 'scripts' / 'package.py')], cwd=self.root, capture_output=True, text=True)

    def test_runtime_zip_is_reproducible_and_excludes_development_files(self):
        result = self.build()
        self.assertEqual(result.returncode, 0, result.stderr)
        target = self.root / 'dist' / 'chatgpt-status-dot.zip'
        digest = hashlib.sha256(target.read_bytes()).hexdigest()
        self.assertEqual(self.build().returncode, 0)
        self.assertEqual(hashlib.sha256(target.read_bytes()).hexdigest(), digest)
        with zipfile.ZipFile(target) as archive:
            self.assertIsNone(archive.testzip())
            self.assertIn('manifest.json', archive.namelist())
            self.assertTrue({'LICENSE', 'NOTICE', 'PRIVACY.md'} <= set(archive.namelist()))
            self.assertEqual(len(archive.namelist()), 13)
            self.assertFalse(any(name.startswith(('tests/', 'docs/', 'artifacts/', 'scripts/', 'extension/')) for name in archive.namelist()))

    def test_version_mismatch_is_rejected(self):
        target = self.root / 'package.json'
        data = json.loads(target.read_text()); data['version'] = '9.0.0'
        target.write_text(json.dumps(data), encoding='utf-8')
        result = self.build()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('versions must match', result.stderr)

    def test_update_url_is_rejected(self):
        target = self.root / 'extension' / 'manifest.json'
        data = json.loads(target.read_text()); data['update_url'] = 'https://example.invalid/update'
        target.write_text(json.dumps(data), encoding='utf-8')
        result = self.build()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('update_url', result.stderr)

    def test_wrong_icon_dimensions_are_rejected(self):
        folder = self.root / 'extension' / 'icons'
        shutil.copyfile(folder / 'icon-32.png', folder / 'icon-16.png')
        result = self.build()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('PNG icon dimensions', result.stderr)

    def test_missing_popup_stylesheet_is_rejected(self):
        target = self.root / 'release-files.json'
        data = json.loads(target.read_text()); data.remove('extension/popup.css')
        target.write_text(json.dumps(data), encoding='utf-8')
        result = self.build()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('resource is missing', result.stderr)


if __name__ == '__main__':
    unittest.main()
