// node-pty ships spawn-helper without the execute bit — chmod it so PTY sessions work.
import { chmodSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arch, platform } from 'node:process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const key = `${platform}-${arch}`;
const helper = join(root, 'node_modules', 'node-pty', 'prebuilds', key, 'spawn-helper');

if (existsSync(helper)) {
  chmodSync(helper, 0o755);
  console.log(`[fix-node-pty-perms] chmod +x ${helper}`);
} else {
  // Not a macOS/Linux prebuild path — nothing to do.
  console.log(`[fix-node-pty-perms] no spawn-helper at ${helper}, skipping`);
}
