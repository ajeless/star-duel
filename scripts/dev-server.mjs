import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const runDir = resolve(repoRoot, ".run");
const pidFile = resolve(runDir, "vite-dev-server.json");
const logFile = resolve(runDir, "vite-dev-server.log");
const host = process.env.STAR_DUEL_HOST || "127.0.0.1";
const port = Number(process.env.STAR_DUEL_PORT || 4173);
const url = `http://${host}:${port}/`;

const command = process.argv[2];

if (!command || !["start", "stop", "status"].includes(command)) {
  console.error("Usage: node scripts/dev-server.mjs <start|stop|status>");
  process.exit(1);
}

mkdirSync(runDir, { recursive: true });

switch (command) {
  case "start":
    await startServer();
    break;
  case "stop":
    await stopServer();
    break;
  case "status":
    await printStatus();
    break;
  default:
    process.exit(1);
}

async function startServer() {
  const meta = readMeta();

  if (meta && (await isServerResponsive(url))) {
    console.log(`Star Duel dev server already running at ${url} (pid ${meta.pid}).`);
    return;
  }

  if (meta) {
    cleanupMeta();
  }

  ensureDependencies();

  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const logFd = openSync(logFile, "a");
  const child = spawn(
    npmCommand,
    ["run", "dev", "--", "--host", host, "--port", String(port), "--strictPort"],
    {
      cwd: repoRoot,
      detached: true,
      stdio: ["ignore", logFd, logFd],
      windowsHide: true,
    }
  );

  child.unref();

  writeFileSync(
    pidFile,
    JSON.stringify(
      {
        pid: child.pid,
        host,
        port,
        url,
        logFile,
        startedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );

  const ready = await waitForServer(url, 20_000);

  if (!ready) {
    await terminatePid(child.pid);
    cleanupMeta();
    console.error(`Star Duel dev server failed to start. Check ${logFile}.`);
    process.exit(1);
  }

  console.log(`Star Duel dev server started.`);
  console.log(`URL: ${url}`);
  console.log(`PID: ${child.pid}`);
  console.log(`Log: ${logFile}`);
}

async function stopServer() {
  const meta = readMeta();

  if (!meta) {
    console.log("Star Duel dev server is not running.");
    return;
  }

  await terminatePid(meta.pid);
  cleanupMeta();
  await waitForServerShutdown(url, 10_000);

  console.log("Star Duel dev server stopped.");
}

async function printStatus() {
  const meta = readMeta();

  if (!meta) {
    console.log("Star Duel dev server is not running.");
    return;
  }

  const responsive = await isServerResponsive(url);

  if (responsive) {
    console.log(`Star Duel dev server is running at ${url} (pid ${meta.pid}).`);
    console.log(`Log: ${logFile}`);
    return;
  }

  console.log(`PID file exists for ${meta.pid}, but ${url} is not responding.`);
  console.log(`Log: ${logFile}`);
}

function ensureDependencies() {
  const viteDir = resolve(repoRoot, "node_modules", "vite");
  const phaserDir = resolve(repoRoot, "node_modules", "phaser");
  const playwrightCoreDir = resolve(repoRoot, "node_modules", "playwright-core");

  if (existsSync(viteDir) && existsSync(phaserDir) && existsSync(playwrightCoreDir)) {
    return;
  }

  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmCommand, ["install"], {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function readMeta() {
  if (!existsSync(pidFile)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(pidFile, "utf8"));
  } catch {
    return null;
  }
}

function cleanupMeta() {
  rmSync(pidFile, { force: true });
}

async function terminatePid(pid) {
  if (!pid) {
    return;
  }

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch {}

  const stopped = await waitForExit(pid, 4_000);

  if (stopped) {
    return;
  }

  try {
    process.kill(-pid, "SIGKILL");
  } catch {}

  await waitForExit(pid, 2_000);
}

async function waitForExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) {
      return true;
    }
    await sleep(200);
  }

  return !isProcessAlive(pid);
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForServer(targetUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await isServerResponsive(targetUrl)) {
      return true;
    }
    await sleep(250);
  }

  return false;
}

async function waitForServerShutdown(targetUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const responsive = await isServerResponsive(targetUrl);
    if (!responsive) {
      return true;
    }
    await sleep(250);
  }

  return false;
}

function isServerResponsive(targetUrl) {
  return new Promise((resolvePromise) => {
    const request = http.get(targetUrl, (response) => {
      response.resume();
      resolvePromise(response.statusCode >= 200 && response.statusCode < 500);
    });

    request.on("error", () => {
      resolvePromise(false);
    });

    request.setTimeout(1_000, () => {
      request.destroy();
      resolvePromise(false);
    });
  });
}

function sleep(ms) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}
