"""Build a source-only submission from explicit project directories."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
archive = root / 'cesrepo-sprint1.zip'
excluded_dirs = {'node_modules', 'dist', 'test-results', 'playwright-report', '__pycache__', '.git'}
files = [root / name for name in ['README.md', 'DEMO_CHECKLIST.md', '.gitignore', '.nvmrc']]
for directory in ['backend', 'frontend', 'scripts']:
    for path in (root / directory).rglob('*'):
        if not path.is_file() or any(part in excluded_dirs for part in path.relative_to(root).parts):
            continue
        if path.name == '.env' or (path.name.startswith('.env.') and path.name != '.env.example'):
            continue
        if path.suffix in {'.db', '.sqlite', '.sqlite3', '.log', '.pyc'} or path.name.endswith(('-wal', '-shm', '-journal')) or path.name == '.DS_Store':
            continue
        files.append(path)
with ZipFile(archive, 'w', ZIP_DEFLATED) as output:
    for path in sorted(files):
        output.write(path, Path('cesrepo') / path.relative_to(root))
print(f'Created {archive.name}: {len(files)} source/configuration files')
