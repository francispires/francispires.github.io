import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DEFAULT_ENV_PATH = join(ROOT, '.env');

export function readEnvKey(key, envPath = DEFAULT_ENV_PATH) {
  if (!existsSync(envPath)) return undefined;
  const content = readFileSync(envPath, 'utf8');
  const match = content.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return match ? match[1].trim() : undefined;
}

export function writeEnvKeys(updates, envPath = DEFAULT_ENV_PATH) {
  let content = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    const line = `${key}=${value}`;
    if (regex.test(content)) {
      content = content.replace(regex, line);
    } else {
      content = content.trimEnd() + `\n${line}`;
    }
  }
  writeFileSync(envPath, content.trimEnd() + '\n');
}
