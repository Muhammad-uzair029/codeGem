// Builds the one-line install commands shown on every page.
// Used at build time (initial HTML, with the baked URL) and in the browser
// (rewritten with window.location.origin so copy-paste is always correct).

const PS_FLAGS = { '--all': '-All', '--force': '-Force', '--global': '-Global', '--no-deps': '-NoDeps', '--update': '-Update' };

/** @param {'unix'|'windows'} os @param {string} origin @param {string[]} args */
export function installCommand(os, origin, args) {
  const base = String(origin || '').replace(/\/+$/, '');
  if (os === 'windows') {
    const ps = args.map((a) => PS_FLAGS[a] || a).join(' ');
    return `irm ${base}/install.ps1 | iex; Install-Skills ${ps}`.trimEnd();
  }
  return `curl -fsSL ${base}/install.sh | bash -s -- ${args.join(' ')}`.trimEnd();
}
