import { createConnection } from 'node:net';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

function isPortListening(port) {
  return new Promise(resolve => {
    const socket = createConnection(port, 'localhost');
    socket.setTimeout(500);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('error',   () => resolve(false));
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
  });
}

function waitForPort(port, maxMs = 8000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = async () => {
      if (await isPortListening(port)) return resolve();
      if (Date.now() - start > maxMs) return reject(new Error(`Dev server did not start within ${maxMs}ms`));
      setTimeout(check, 500);
    };
    check();
  });
}

/**
 * Ensures the Astro dev server is running on port 4321.
 * Spawns it if not already listening. Returns the base URL.
 */
export async function ensureDevServer(port = 4321) {
  if (await isPortListening(port)) return `http://localhost:${port}`;

  const child = spawn('npm', ['run', 'dev', '--', '--host', '0.0.0.0'], {
    cwd: ROOT, detached: true, stdio: 'ignore',
  });
  child.unref();

  await waitForPort(port);
  return `http://localhost:${port}`;
}
