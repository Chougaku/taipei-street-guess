/**
 * One command to play in Chrome: builds the web app, starts the game server that
 * serves it, and opens Chrome at http://localhost:<port>.
 *
 *   npm run play          # build + start + open Chrome
 *   npm run play -- --no-open
 *   npm run play -- --skip-build   # reuse the last build (faster restarts)
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const open = !args.includes('--no-open');
const skipBuild = args.includes('--skip-build');
const port = process.env.PORT ?? '8787';
const url = `http://localhost:${port}`;
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

/** Runs a command line through the shell (npm on Windows is a .cmd, which needs one). */
function run(commandLine) {
  const res = spawnSync(commandLine, { cwd: ROOT, stdio: 'inherit', shell: true });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

const webDist = resolve(ROOT, 'apps/web/dist');
const serverBundle = resolve(ROOT, 'apps/server/dist/index.mjs');

if (!skipBuild || !existsSync(webDist) || !existsSync(serverBundle)) {
  console.log('\n建置中…（第一次大約需要 10 秒）\n');
  run(`${npm} run build --workspace @tg/web`);
  run(`${npm} run build --workspace @tg/server`);
}

console.log(`\n🎮 台北街景猜猜：${url}\n   按 Ctrl+C 停止\n`);

const server = spawn(process.execPath, ['--env-file-if-exists=.env', 'apps/server/dist/index.mjs'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, PORT: port, WEB_DIST_DIR: webDist },
});

if (open) {
  // Give the server a moment to start listening, then open Chrome (falling back to the default browser).
  setTimeout(() => {
    const opener =
      process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', 'chrome', url]]
        : process.platform === 'darwin'
          ? ['open', ['-a', 'Google Chrome', url]]
          : ['google-chrome', [url]];
    const child = spawn(opener[0], opener[1], { stdio: 'ignore', detached: true });
    child.on('error', () => {
      const fallback = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
      spawn(fallback[0], fallback[1], { stdio: 'ignore', detached: true }).on('error', () => {});
    });
    child.unref();
  }, 1500);
}

const stop = () => {
  server.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.on('exit', (code) => process.exit(code ?? 0));
