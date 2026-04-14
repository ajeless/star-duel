import { spawn, spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const runDir = resolve(repoRoot, ".run");
const wranglerEntryFile = resolve(repoRoot, "node_modules", "wrangler", "bin", "wrangler.js");
const quickTunnelUrlPattern = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/gi;
const QUICK_TUNNEL_TIMEOUT_MS = Number(process.env.STAR_DUEL_TUNNEL_TIMEOUT_MS || 90_000);

const TUNNELS = {
  client: {
    name: "client",
    label: "Cloudflare app tunnel",
    metaFile: resolve(runDir, "cloudflare-client-tunnel.json"),
    logFile: resolve(runDir, "cloudflare-client-tunnel.log"),
  },
  server: {
    name: "server",
    label: "Cloudflare server tunnel",
    metaFile: resolve(runDir, "cloudflare-server-tunnel.json"),
    logFile: resolve(runDir, "cloudflare-server-tunnel.log"),
  },
};

mkdirSync(runDir, { recursive: true });

export class QuickTunnelManager {
  constructor() {
    this.children = new Map();
  }

  getStatus() {
    const available = this.isAvailable();

    return {
      available,
      tunnels: Object.fromEntries(
        Object.entries(TUNNELS).map(([key, config]) => {
          const meta = this.readMeta(config);
          return [
            key,
            {
              running: Boolean(meta?.pid && this.isProcessAlive(meta.pid)),
              targetUrl: meta?.targetUrl ?? "",
              publicUrl: meta?.publicUrl ?? "",
              pid: meta?.pid ?? null,
            },
          ];
        })
      ),
    };
  }

  async startPair({ clientTargetUrl, serverTargetUrl }) {
    this.assertAvailable();

    const client = await this.startTunnel(TUNNELS.client, clientTargetUrl);
    let server;

    try {
      server = await this.startTunnel(TUNNELS.server, serverTargetUrl);
    } catch (error) {
      await this.stopTunnel(TUNNELS.client);
      throw error;
    }

    return {
      publicAppUrl: client.publicUrl,
      publicServerUrl: server.publicUrl,
      client,
      server,
    };
  }

  async stopAll() {
    await this.stopTunnel(TUNNELS.client);
    await this.stopTunnel(TUNNELS.server);
  }

  async shutdown() {
    await this.stopAll();
  }

  isAvailable() {
    if (!existsSync(wranglerEntryFile)) {
      return false;
    }

    const result = spawnSync(process.execPath, [wranglerEntryFile, "--version"], {
      cwd: repoRoot,
      stdio: ["ignore", "ignore", "ignore"],
      windowsHide: true,
    });

    return result.status === 0;
  }

  assertAvailable() {
    if (this.isAvailable()) {
      return;
    }

    throw new Error("Cloudflare Wrangler is not installed. Run npm install to add wrangler before using Quick Tunnel hosting.");
  }

  async startTunnel(config, targetUrl) {
    const existingMeta = this.readMeta(config);

    if (existingMeta?.targetUrl === targetUrl && existingMeta.publicUrl && existingMeta.pid && this.isProcessAlive(existingMeta.pid)) {
      return existingMeta;
    }

    await this.stopTunnel(config);

    appendFileSync(config.logFile, `\n[${new Date().toISOString()}] Starting ${config.label} for ${targetUrl}\n`);

    const child = spawn(
      process.execPath,
      [wranglerEntryFile, "tunnel", "quick-start", targetUrl],
      {
        cwd: repoRoot,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        env: {
          ...process.env,
          NO_UPDATE_NOTIFIER: "true",
        },
      }
    );

    this.children.set(config.name, child);

    const baseMeta = {
      pid: child.pid,
      targetUrl,
      publicUrl: "",
      logFile: config.logFile,
      startedAt: new Date().toISOString(),
    };
    this.writeMeta(config, baseMeta);

    let publicUrl;

    try {
      publicUrl = await this.waitForPublicUrl(config, child);
    } catch (error) {
      await this.stopTunnel(config);
      throw error;
    }

    const fullMeta = {
      ...baseMeta,
      publicUrl,
    };

    this.writeMeta(config, fullMeta);

    child.on("exit", () => {
      this.children.delete(config.name);
    });

    return fullMeta;
  }

  async stopTunnel(config) {
    const child = this.children.get(config.name);
    const meta = this.readMeta(config);

    if (child?.pid) {
      await this.terminatePid(child.pid);
    } else if (meta?.pid) {
      await this.terminatePid(meta.pid);
    }

    this.children.delete(config.name);
    this.cleanupMeta(config);
  }

  waitForPublicUrl(config, child) {
    return new Promise((resolvePromise, rejectPromise) => {
      let settled = false;
      let buffer = "";

      const cleanup = () => {
        clearTimeout(timeoutId);
        child.stdout?.removeListener("data", onData);
        child.stderr?.removeListener("data", onData);
        child.removeListener("error", onError);
        child.removeListener("exit", onExit);
      };

      const settle = (fn, value) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        fn(value);
      };

      const parsePublicUrl = (text) => {
        const matches = text.match(quickTunnelUrlPattern);
        return matches ? matches[matches.length - 1] : null;
      };

      const onData = (chunk) => {
        const text = chunk.toString();
        appendFileSync(config.logFile, text);
        buffer += text;

        const publicUrl = parsePublicUrl(buffer);
        if (publicUrl) {
          settle(resolvePromise, publicUrl);
        }
      };

      const onError = (error) => {
        settle(rejectPromise, error);
      };

      const onExit = (code, signal) => {
        settle(
          rejectPromise,
          new Error(
            `${config.label} exited before publishing a public URL (${code ?? "null"}/${signal ?? "null"}). ${this.formatTunnelDebugHint(config, buffer)}`
          )
        );
      };

      const timeoutId = setTimeout(() => {
        settle(
          rejectPromise,
          new Error(`${config.label} did not publish a Cloudflare URL within ${Math.round(QUICK_TUNNEL_TIMEOUT_MS / 1000)} seconds. ${this.formatTunnelDebugHint(config, buffer)}`)
        );
      }, QUICK_TUNNEL_TIMEOUT_MS);

      child.stdout?.on("data", onData);
      child.stderr?.on("data", onData);
      child.on("error", onError);
      child.on("exit", onExit);
    });
  }

  formatTunnelDebugHint(config, buffer) {
    const excerpt = buffer.trim().split(/\r?\n/).slice(-3).join(" ").trim();
    const excerptSuffix = excerpt ? ` Last output: ${excerpt}` : " No tunnel output was captured.";
    return `See ${config.logFile} for the full Wrangler log.${excerptSuffix}`;
  }

  readMeta(config) {
    if (!existsSync(config.metaFile)) {
      return null;
    }

    try {
      return JSON.parse(readFileSync(config.metaFile, "utf8"));
    } catch {
      return null;
    }
  }

  writeMeta(config, meta) {
    writeFileSync(config.metaFile, JSON.stringify(meta, null, 2));
  }

  cleanupMeta(config) {
    rmSync(config.metaFile, { force: true });
  }

  isProcessAlive(pid) {
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

  async terminatePid(pid) {
    if (!pid || !this.isProcessAlive(pid)) {
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

    const exited = await this.waitForExit(pid, 4_000);
    if (exited) {
      return;
    }

    try {
      process.kill(pid, "SIGKILL");
    } catch {}

    await this.waitForExit(pid, 2_000);
  }

  async waitForExit(pid, timeoutMs) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      if (!this.isProcessAlive(pid)) {
        return true;
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
    }

    return !this.isProcessAlive(pid);
  }
}
