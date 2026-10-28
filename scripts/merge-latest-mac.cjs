// Merge the per-arch latest-mac.yml files produced by the separate arm64
// and x64 macOS CI jobs into the single latest-mac.yml electron-updater
// reads. Keeps every top-level field from the first file and appends the
// second file's `files:` entries (skipping duplicate urls).
//
// usage: node scripts/merge-latest-mac.cjs <base.yml> <other.yml> > latest-mac.yml
const { readFileSync } = require('node:fs');

function split(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const start = lines.indexOf('files:');
  if (start < 0) throw new Error('no "files:" section');
  let end = start + 1;
  while (end < lines.length && (lines[end].startsWith('  ') || lines[end] === '')) end++;
  return { head: lines.slice(0, start + 1), entries: lines.slice(start + 1, end).filter(Boolean), tail: lines.slice(end) };
}

function entries(lines) {
  const out = [];
  for (const l of lines) {
    if (l.startsWith('  - ')) out.push([l]);
    else if (out.length) out[out.length - 1].push(l);
  }
  return out;
}

const [basePath, otherPath] = process.argv.slice(2);
if (!basePath || !otherPath) throw new Error('usage: merge-latest-mac.cjs <base.yml> <other.yml>');
const base = split(readFileSync(basePath, 'utf8'));
const other = split(readFileSync(otherPath, 'utf8'));
const url = (e) => e[0].replace(/^ {2}- url: /, '').trim();
const merged = entries(base.entries);
const seen = new Set(merged.map(url));
for (const e of entries(other.entries)) if (!seen.has(url(e))) merged.push(e);
if (merged.length === 0) throw new Error('no files entries found');
process.stdout.write([...base.head, ...merged.flat(), ...base.tail].join('\n'));
