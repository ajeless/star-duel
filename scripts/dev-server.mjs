import http from "node:http";
import net from "node:net";
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
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const SERVICES = {
  client: {
    name: "client",
    label: "Vite dev server",
    host: process.env.STAR_DUEL_HOST || "127.0.0.1",
    port: Number(process.env.STAR_DUEL_PORT || 4173),
    cleanupPorts: [4173, 5173],
    pidFile: resolve(runDir, "vite-dev-server.json"),
    logFile: resolve(runDir, "vite-dev-server.log"),
    probe: "http",
    endpoint(service) {
      return `http://${service.host}:${service.port}/`;
    },
    command(service) {
      return {
        cmd: npmCommand,
        args: ["run", "dev", "--", "--host", service.host, "--port", String(service.port), "--strictPort"],
        env: process.env,
      };
    },
  },
  server: {
    name: "server",
    label: "Colyseus room server",
    host: process.env.STAR_DUEL_SERVER_HOST || "127.0.0.1",
    port: Number(process.env.STAR_DUEL_SERVER_PORT || 2567),
    cleanupPorts: [2567],
    pidFile: resolve(runDir, "colyseus-room-server.json"),
    logFile: resolve(runDir, "colyseus-room-server.log"),
    probe: "tcp",
    endpoint(service) {
      return `ws://${service.host}:${service.port}`;
    },
    command(service) {
      return {
        cmd: npmCommand,
        args: ["run", "server"],
        env: {
          ...process.env,
          STAR_DUEL_SERVER_PORT: String(service.port),
        },
      };
    },
  },
};

const AUXILIARY_PROCESSES = [
  {
    label: "Cloudflare app tunnel",
    metaFile: resolve(runDir, "cloudflare-client-tunnel.json"),
  },
  {
    label: "Cloudflare server tunnel",
    metaFile: resolve(runDir, "cloudflare-server-tunnel.json"),
  },
];

const command = process.argv[2];

if (!command || !["start", "stop", "status", "cleanup"].includes(command)) {
  console.error("Usage: node scripts/dev-server.mjs <start|stop|status|cleanup>");
  process.exit(1);
}

mkdirSync(runDir, { recursive: true });

switch (command) {
  case "start":
    await startStack();
    break;
  case "stop":
    await stopStack();
    break;
  case "cleanup":
    await stopStack({ aggressive: true });
    break;
  case "status":
    await printStatus();
    break;
  default:
    process.exit(1);
}

async function startStack() {
  ensureDependencies();
  await cleanupAuxiliaryProcesses();

  for (const service of Object.values(SERVICES)) {
    await cleanupLingeringService(service);
  }

  for (const service of Object.values(SERVICES)) {
    await startService(service);
  }
}

async function stopStack(options = {}) {
  for (const service of Object.values(SERVICES).reverse()) {
    await stopService(service, options);
  }

  await cleanupAuxiliaryProcesses();
}

async function printStatus() {
  let anyRunning = false;

  for (const service of Object.values(SERVICES)) {
    const summary = await getServiceStatus(service);
    if (summary.running) {
      anyRunning = true;
      console.log(`${service.label} is running at ${service.endpoint(service)} (${summary.origin}, pid ${summary.pid ?? "unknown"}).`);
      console.log(`Log: ${service.logFile}`);
      continue;
    }

    if (summary.origin === "stale") {
      console.log(`${service.label} is not running, but stale metadata is present in ${service.pidFile}.`);
      continue;
    }

    console.log(`${service.label} is not running.`);
  }

  for (const processMeta of AUXILIARY_PROCESSES) {
    const summary = getAuxiliaryStatus(processMeta);

    if (summary.running) {
      anyRunning = true;
      console.log(`${processMeta.label} is running (${summary.origin}, pid ${summary.pid ?? "unknown"}).`);
      if (summary.publicUrl) {
        console.log(`Public URL: ${summary.publicUrl}`);
      }
      continue;
    }

    if (summary.origin === "stale") {
      console.log(`${processMeta.label} is not running, but stale metadata is present in ${processMeta.metaFile}.`);
      continue;
    }

    console.log(`${processMeta.label} is not running.`);
  }

  if (!anyRunning) {
    return;
  }
}

async function startService(service) {
  const summary = await getServiceStatus(service);

  if (summary.running) {
    console.log(`${service.label} already running at ${service.endpoint(service)} (${summary.origin}, pid ${summary.pid ?? "unknown"}).`);
    return;
  }

  const descriptor = service.command(service);
  const logFd = openSync(service.logFile, "a");
  const child = spawn(descriptor.cmd, descriptor.args, {
    cwd: repoRoot,
    detached: true,
    stdio: ["ignore", logFd, logFd],
    windowsHide: true,
    env: descriptor.env,
  });

  child.unref();

  writeMeta(service, {
    pid: child.pid,
    host: service.host,
    port: service.port,
    endpoint: service.endpoint(service),
    logFile: service.logFile,
    startedAt: new Date().toISOString(),
  });

  const ready = await waitForService(service, 20_000);

  if (!ready) {
    await terminateTrackedPid(child.pid);
    cleanupMeta(service);
    console.error(`${service.label} failed to start. Check ${service.logFile}.`);
    process.exit(1);
  }

  console.log(`${service.label} started.`);
  console.log(`Endpoint: ${service.endpoint(service)}`);
  console.log(`PID: ${child.pid}`);
  console.log(`Log: ${service.logFile}`);
}

async function stopService(service, options = {}) {
  const meta = readMeta(service);
  let stoppedAnything = false;
  const aggressive = options.aggressive === true;

  if (meta?.pid) {
    await terminateTrackedPid(meta.pid);
    stoppedAnything = true;
  }

  cleanupMeta(service);

  const lingeringPids = findServiceListeningPids(service, { aggressive });
  for (const pid of lingeringPids) {
    await terminatePortPid(pid);
    stoppedAnything = true;
  }

  await waitForServiceShutdown(service, aggressive ? 10_000 : 6_000, { aggressive });

  console.log(stoppedAnything ? `${service.label} stopped.` : `${service.label} is not running.`);
}

async function getServiceStatus(service) {
  const meta = readMeta(service);
  const responsive = await isServiceResponsive(service);

  if (responsive) {
    return {
      running: true,
      pid: meta?.pid ?? findServiceListeningPids(service, { aggressive: true })[0] ?? null,
      origin: meta ? "tracked" : "untracked",
    };
  }

  if (meta) {
    return {
      running: false,
      pid: meta.pid ?? null,
      origin: "stale",
    };
  }

  return {
    running: false,
    pid: null,
    origin: "none",
  };
}

function ensureDependencies() {
  const requiredDirs = [
    resolve(repoRoot, "node_modules", "vite"),
    resolve(repoRoot, "node_modules", "phaser"),
    resolve(repoRoot, "node_modules", "playwright-core"),
    resolve(repoRoot, "node_modules", "colyseus"),
    resolve(repoRoot, "node_modules", "@colyseus", "sdk"),
    resolve(repoRoot, "node_modules", "wrangler"),
  ];

  if (requiredDirs.every((directory) => existsSync(directory))) {
    return;
  }

  const result = spawnSync(npmCommand, ["install"], {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function readMeta(service) {
  if (!existsSync(service.pidFile)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(service.pidFile, "utf8"));
  } catch {
    return null;
  }
}

function writeMeta(service, meta) {
  writeFileSync(service.pidFile, JSON.stringify(meta, null, 2));
}

function cleanupMeta(service) {
  rmSync(service.pidFile, { force: true });
}

async function cleanupAuxiliaryProcesses() {
  for (const processMeta of AUXILIARY_PROCESSES) {
    const meta = readAuxiliaryMeta(processMeta);
    if (meta?.pid) {
      await terminateTrackedPid(meta.pid);
    }
    rmSync(processMeta.metaFile, { force: true });
  }
}

function readAuxiliaryMeta(processMeta) {
  if (!existsSync(processMeta.metaFile)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(processMeta.metaFile, "utf8"));
  } catch {
    return null;
  }
}

function getAuxiliaryStatus(processMeta) {
  const meta = readAuxiliaryMeta(processMeta);

  if (meta?.pid && isProcessAlive(meta.pid)) {
    return {
      running: true,
      pid: meta.pid,
      publicUrl: meta.publicUrl ?? "",
      origin: "tracked",
    };
  }

  if (meta) {
    return {
      running: false,
      pid: meta.pid ?? null,
      publicUrl: meta.publicUrl ?? "",
      origin: "stale",
    };
  }

  return {
    running: false,
    pid: null,
    publicUrl: "",
    origin: "none",
  };
}

async function cleanupLingeringService(service) {
  const lingeringPids = findServiceListeningPids(service, { aggressive: false });

  for (const pid of lingeringPids) {
    await terminatePortPid(pid);
  }

  await waitForServiceShutdown(service, 5_000, { aggressive: false });
}

async function terminateTrackedPid(pid) {
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
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }

  const stopped = await waitForExit(pid, 4_000);

  if (stopped) {
    return;
  }

  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }

  await waitForExit(pid, 2_000);
}

async function terminatePortPid(pid) {
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
    process.kill(pid, "SIGTERM");
  } catch {}

  const stopped = await waitForExit(pid, 4_000);

  if (stopped) {
    return;
  }

  try {
    process.kill(pid, "SIGKILL");
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
  if (!pid) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForService(service, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await isServiceResponsive(service)) {
      return true;
    }
    await sleep(250);
  }

  return false;
}

async function waitForServiceShutdown(service, timeoutMs, options = {}) {
  const deadline = Date.now() + timeoutMs;
  const aggressive = options.aggressive === true;

  while (Date.now() < deadline) {
    const responsive = await isServiceResponsive(service);
    const lingeringPids = findServiceListeningPids(service, { aggressive });

    if (!responsive && lingeringPids.length === 0) {
      return true;
    }
    await sleep(250);
  }

  return !(await isServiceResponsive(service)) && findServiceListeningPids(service, { aggressive }).length === 0;
}

function isServiceResponsive(service) {
  if (service.probe === "http") {
    return isHttpResponsive(service.endpoint(service));
  }

  return isTcpResponsive(service.host, service.port);
}

function isHttpResponsive(targetUrl) {
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

function isTcpResponsive(host, port) {
  return new Promise((resolvePromise) => {
    const socket = net.createConnection({ host, port });

    socket.on("connect", () => {
      socket.destroy();
      resolvePromise(true);
    });

    socket.on("error", () => {
      resolvePromise(false);
    });

    socket.setTimeout(1_000, () => {
      socket.destroy();
      resolvePromise(false);
    });
  });
}

function listListeningPids(port) {
  if (process.platform === "win32") {
    return listWindowsListeningPids(port);
  }

  const lsof = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  if (lsof.status === 0) {
    return uniqueIntegerLines(lsof.stdout);
  }

  if (process.platform === "linux") {
    const ss = spawnSync("ss", ["-ltnp"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });

    if (ss.status === 0) {
      return parseSsPids(ss.stdout, port);
    }
  }

  return [];
}

function findServiceListeningPids(service, options = {}) {
  const aggressive = options.aggressive === true;
  const ports = new Set([service.port, ...(service.cleanupPorts ?? [])]);
  const pids = new Set();

  for (const port of ports) {
    for (const pid of listListeningPids(port)) {
      if (isManagedServiceProcess(service, pid) || aggressive) {
        pids.add(pid);
      }
    }
  }

  return [...pids];
}

function isManagedServiceProcess(service, pid) {
  const commandLine = getProcessCommand(pid);

  if (!commandLine) {
    return false;
  }

  const normalizedCommand = commandLine.toLowerCase();
  const normalizedRoot = repoRoot.toLowerCase();

  if (normalizedCommand.includes(normalizedRoot)) {
    return true;
  }

  if (normalizedCommand.includes("star-duel")) {
    return true;
  }

  if (service.name === "server" && normalizedCommand.includes("server/index.mjs")) {
    return true;
  }

  return false;
}

function getProcessCommand(pid) {
  if (!pid) {
    return "";
  }

  if (process.platform === "win32") {
    const result = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`,
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
      }
    );

    if (result.status !== 0) {
      return "";
    }

    return result.stdout.trim();
  }

  const result = spawnSync("ps", ["-p", String(pid), "-o", "command="], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  if (result.status !== 0) {
    return "";
  }

  return result.stdout.trim();
}

function listWindowsListeningPids(port) {
  const result = spawnSync("netstat", ["-ano", "-p", "tcp"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    windowsHide: true,
  });

  if (result.status !== 0) {
    return [];
  }

  const lines = result.stdout.split(/\r?\n/);
  const pids = [];

  for (const line of lines) {
    if (!line.includes("LISTENING")) {
      continue;
    }

    const match = line.trim().match(new RegExp(`:${port}\\s+.*LISTENING\\s+(\\d+)$`));
    if (match) {
      pids.push(Number(match[1]));
    }
  }

  return [...new Set(pids)].filter(Number.isInteger);
}

function parseSsPids(output, port) {
  const pids = [];
  const lines = output.split(/\r?\n/);

  for (const line of lines) {
    if (!line.includes(`:${port}`)) {
      continue;
    }

    for (const match of line.matchAll(/pid=(\d+)/g)) {
      pids.push(Number(match[1]));
    }
  }

  return [...new Set(pids)].filter(Number.isInteger);
}

function uniqueIntegerLines(output) {
  return [...new Set(
    output
      .split(/\r?\n/)
      .map((line) => Number(line.trim()))
      .filter(Number.isInteger)
  )];
}

function sleep(ms) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}
