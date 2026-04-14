import { defineRoom, defineServer } from "colyseus";
import { STAR_DUEL_ROOM_NAME } from "../src/game/star-duel-protocol.js";
import { QuickTunnelManager } from "./quick-tunnel-manager.mjs";
import { StarDuelRoom } from "./star-duel-room.js";

const port = Number(process.env.STAR_DUEL_SERVER_PORT || 2567);
const quickTunnelManager = new QuickTunnelManager();

const server = defineServer({
  rooms: {
    [STAR_DUEL_ROOM_NAME]: defineRoom(StarDuelRoom),
  },
  express: (app) => {
    app.use("/api/hosting", (req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
      }

      next();
    });

    app.get("/api/hosting/status", (_req, res) => {
      res.json(quickTunnelManager.getStatus());
    });

    app.post("/api/hosting/cloudflare/quick-start", async (req, res) => {
      try {
        const payload = await readJsonBody(req);
        const clientTargetUrl = payload?.clientTargetUrl?.trim();
        const serverTargetUrl = payload?.serverTargetUrl?.trim();

        if (!clientTargetUrl || !serverTargetUrl) {
          res.status(400).json({
            error: "clientTargetUrl and serverTargetUrl are required.",
          });
          return;
        }

        const result = await quickTunnelManager.startPair({
          clientTargetUrl,
          serverTargetUrl,
        });

        res.json(result);
      } catch (error) {
        res.status(500).json({
          error: error.message,
        });
      }
    });

    app.post("/api/hosting/cloudflare/stop", async (_req, res) => {
      try {
        await quickTunnelManager.stopAll();
        res.json({ ok: true });
      } catch (error) {
        res.status(500).json({
          error: error.message,
        });
      }
    });
  },
});

await server.listen(port);

console.log(`Star Duel Colyseus server listening on http://127.0.0.1:${port}`);

const shutdown = async () => {
  await quickTunnelManager.shutdown();
  await server.gracefullyShutdown(false);
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", reject);
  });
}
