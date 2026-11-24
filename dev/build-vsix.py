"""Builds the extension's VSIX by hand (no npm, no vsce): python dev/build-vsix.py
Packs the git-tracked files minus what .vscodeignore excludes (and the repo's docs) into
dist/<name>-<version>.vsix. Install it with: code --install-extension dist/<file>.vsix --force
"""
import fnmatch
import json
import os
import subprocess
import sys
import zipfile
from xml.sax.saxutils import escape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Not needed at runtime: repo docs and the Visual Studio side project.
EXTRA_EXCLUDES = ['*.md', 'vs2022/**', '.gitignore', '.vscodeignore', 'git-instructions.md']


def patterns():
    with open(os.path.join(ROOT, '.vscodeignore'), encoding='utf-8') as f:
        ignore = [l.strip() for l in f if l.strip() and not l.startswith('#')]
    return ignore + EXTRA_EXCLUDES


def excluded(path, pats):
    for p in pats:
        if fnmatch.fnmatch(path, p) or fnmatch.fnmatch(os.path.basename(path), p):
            return True
        if p.endswith('/**') and path.startswith(p[:-2]):
            return True
    return False


def manifest(pkg):
    return f'''<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata>
    <Identity Language="en-US" Id="{escape(pkg['name'])}" Version="{escape(pkg['version'])}" Publisher="{escape(pkg['publisher'])}" />
    <DisplayName>{escape(pkg['displayName'])}</DisplayName>
    <Description xml:space="preserve">{escape(pkg.get('description', ''))}</Description>
    <Categories>{escape(','.join(pkg.get('categories', [])))}</Categories>
  </Metadata>
  <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code" Version="{escape(pkg['engines']['vscode'])}" /></Installation>
  <Dependencies />
  <Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" /></Assets>
</PackageManifest>
'''


CONTENT_TYPES = '''<?xml version="1.0" encoding="utf-8"?>
<Types>
  <Default Extension=".json" ContentType="application/json" />
  <Default Extension=".vsixmanifest" ContentType="text/xml" />
  <Default Extension=".js" ContentType="application/javascript" />
  <Default Extension=".css" ContentType="text/css" />
  <Default Extension=".html" ContentType="text/html" />
  <Default Extension=".svg" ContentType="image/svg+xml" />
  <Default Extension=".png" ContentType="image/png" />
  <Default Extension=".txt" ContentType="text/plain" />
</Types>
'''


def main():
    with open(os.path.join(ROOT, 'package.json'), encoding='utf-8') as f:
        pkg = json.load(f)
    out = subprocess.run(['git', 'ls-files', '-z'], cwd=ROOT, capture_output=True, check=True).stdout
    pats = patterns()
    files = [p for p in out.decode('utf-8').split('\0') if p and not excluded(p, pats)]
    os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
    target = os.path.join(ROOT, 'dist', f"{pkg['name']}-{pkg['version']}.vsix")
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', CONTENT_TYPES)
        z.writestr('extension.vsixmanifest', manifest(pkg))
        for p in files:
            z.write(os.path.join(ROOT, p), 'extension/' + p)
    print(f'{target}: {len(files)} files, {os.path.getsize(target)} bytes')


if __name__ == '__main__':
    sys.exit(main())
