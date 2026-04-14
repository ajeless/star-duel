import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import { Client } from "@colyseus/sdk";
import {
  CLIENT_MESSAGE_TYPES,
  COMMAND_TYPES,
  SERVER_MESSAGE_TYPES,
  STAR_DUEL_ROOM_NAME,
} from "../src/game/star-duel-protocol.js";

const port = Number(process.env.STAR_DUEL_SERVER_PORT || 2568);
const serverUrl = `ws://127.0.0.1:${port}`;
const serverProcess = spawn(process.execPath, ["server/index.mjs"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    STAR_DUEL_SERVER_PORT: String(port),
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverOutput = "";

serverProcess.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

serverProcess.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

try {
  await waitForServerReady();

  const hostClient = new Client(serverUrl);
  const joinClient = new Client(serverUrl);
  const hostRoom = await hostClient.create(STAR_DUEL_ROOM_NAME, { scenarioName: "smoke" });
  const hostMessages = createMessageCollector(hostRoom);
  const joinRoom = await joinClient.joinById(hostRoom.roomId);
  const joinMessages = createMessageCollector(joinRoom);

  const hostInfo = await hostMessages.next(SERVER_MESSAGE_TYPES.roomInfo);
  const joinInfo = await joinMessages.next(SERVER_MESSAGE_TYPES.roomInfo);

  if (hostInfo.seatIndex !== 0 || joinInfo.seatIndex !== 1) {
    throw new Error(`Unexpected seat assignment: host=${hostInfo.seatIndex}, join=${joinInfo.seatIndex}`);
  }

  const initialSnapshot = await hostMessages.next(SERVER_MESSAGE_TYPES.snapshot);

  if (initialSnapshot.state.activeIndex !== 0) {
    throw new Error(`Smoke scenario should start with player 0 active, received ${initialSnapshot.state.activeIndex}.`);
  }

  joinRoom.send(CLIENT_MESSAGE_TYPES.command, { type: COMMAND_TYPES.rotateLeft });
  const rejected = await joinMessages.next(SERVER_MESSAGE_TYPES.roomError);

  if (!rejected.message.includes("not legal")) {
    throw new Error(`Unexpected rejection message: ${rejected.message}`);
  }

  hostRoom.send(CLIENT_MESSAGE_TYPES.command, { type: COMMAND_TYPES.rotateLeft });
  const rotatedSnapshot = await hostMessages.next(
    SERVER_MESSAGE_TYPES.snapshot,
    (payload) => payload.state.players[0].facing === "ne"
  );

  if (rotatedSnapshot.state.players[0].facing !== "ne") {
    throw new Error(`Expected host ship facing to become ne, received ${rotatedSnapshot.state.players[0].facing}.`);
  }

  await hostRoom.leave();
  await joinRoom.leave();
  await sleep(100);

  console.log("Colyseus smoke test passed.");
} finally {
  serverProcess.kill("SIGTERM");
  await once(serverProcess, "exit").catch(() => {});
}

function createMessageCollector(room) {
  const pending = new Map();
  const queue = new Map();

  Object.values(SERVER_MESSAGE_TYPES).forEach((type) => {
    room.onMessage(type, (payload) => {
      const waiters = pending.get(type);

      if (waiters && waiters.length > 0) {
        const waiter = waiters.shift();
        waiter(payload);
        return;
      }

      const bucket = queue.get(type) || [];
      bucket.push(payload);
      queue.set(type, bucket);
    });
  });

  return {
    async next(type, predicate = null, timeoutMs = 5_000) {
      const existing = queue.get(type) || [];

      if (existing.length > 0) {
        if (!predicate) {
          return existing.shift();
        }

        const matchIndex = existing.findIndex((payload) => predicate(payload));
        if (matchIndex !== -1) {
          const [match] = existing.splice(matchIndex, 1);
          return match;
        }
      }

      return new Promise((resolve, reject) => {
        const waiters = pending.get(type) || [];
        const timeoutId = setTimeout(() => {
          const nextWaiters = (pending.get(type) || []).filter((entry) => entry !== listener);
          pending.set(type, nextWaiters);
          reject(new Error(`Timed out waiting for ${type}.`));
        }, timeoutMs);

        const listener = (payload) => {
          if (predicate && !predicate(payload)) {
            const bucket = queue.get(type) || [];
            bucket.push(payload);
            queue.set(type, bucket);
            return;
          }

          clearTimeout(timeoutId);
          resolve(payload);
        };

        waiters.push(listener);
        pending.set(type, waiters);
      });
    },
  };
}

async function waitForServerReady() {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    if (serverOutput.includes("Colyseus server listening")) {
      return;
    }

    if (serverProcess.exitCode !== null) {
      throw new Error(`Colyseus server exited early.\n${serverOutput}`);
    }

    await sleep(50);
  }

  throw new Error(`Timed out waiting for Colyseus server startup.\n${serverOutput}`);
}
