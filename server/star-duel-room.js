import { Room } from "colyseus";
import { StarDuelEngine } from "../src/game/star-duel-engine.js";
import {
  CLIENT_MESSAGE_TYPES,
  COMMAND_TYPES,
  SERVER_MESSAGE_TYPES,
  seatIndexToRole,
  isValidCommand,
} from "../src/game/star-duel-protocol.js";

export class StarDuelRoom extends Room {
  onCreate(options = {}) {
    this.autoDispose = true;
    this.maxClients = 2;
    this.setPrivate();

    this.engine = new StarDuelEngine({
      scenarioName: options.scenarioName ?? null,
    });
    this.seats = [null, null];

    this.onMessage(CLIENT_MESSAGE_TYPES.command, (client, command) => {
      this.handleCommand(client, command);
    });

    this.setSimulationInterval((deltaTime) => {
      const state = this.engine.getState();

      if (!state.turnCue && !state.animation) {
        return;
      }

      this.engine.tick(deltaTime);
      this.flushState();
    });
  }

  onJoin(client) {
    const seatIndex = this.assignSeat(client.sessionId);

    client.userData = {
      seatIndex,
      role: seatIndexToRole(seatIndex),
    };

    this.clock.setTimeout(() => {
      client.send(SERVER_MESSAGE_TYPES.roomInfo, {
        roomId: this.roomId,
        seatIndex,
        role: client.userData.role,
      });

      this.broadcastPresence();
      this.sendSnapshot(client);
    }, 0);
  }

  onLeave(client) {
    const seatIndex = client.userData?.seatIndex;

    if (Number.isInteger(seatIndex)) {
      this.seats[seatIndex] = null;
    }

    this.broadcastPresence();
  }

  assignSeat(sessionId) {
    const openSeatIndex = this.seats.findIndex((seat) => seat === null);

    if (openSeatIndex === -1) {
      throw new Error("No open player seats remain.");
    }

    this.seats[openSeatIndex] = sessionId;
    return openSeatIndex;
  }

  handleCommand(client, command) {
    if (!isValidCommand(command)) {
      client.send(SERVER_MESSAGE_TYPES.roomError, {
        message: "Invalid command payload.",
      });
      return;
    }

    if (!this.canClientIssueCommand(client, command)) {
      client.send(SERVER_MESSAGE_TYPES.roomError, {
        message: "That command is not legal for your seat right now.",
      });
      return;
    }

    this.engine.applyCommand(command);
    this.flushState();
  }

  canClientIssueCommand(client, command) {
    if (command.type === COMMAND_TYPES.resetBattle) {
      return true;
    }

    const seatIndex = client.userData?.seatIndex;

    if (!Number.isInteger(seatIndex)) {
      return false;
    }

    const state = this.engine.getState();

    if (state.gameOver || state.animation) {
      return false;
    }

    return state.activeIndex === seatIndex;
  }

  flushState() {
    const snapshot = this.createSnapshotPayload();
    const events = this.engine.flushEvents();

    this.broadcast(SERVER_MESSAGE_TYPES.snapshot, snapshot);

    if (events.length > 0) {
      this.broadcast(SERVER_MESSAGE_TYPES.serverEvents, { events });
    }
  }

  sendSnapshot(client) {
    client.send(SERVER_MESSAGE_TYPES.snapshot, this.createSnapshotPayload());
  }

  broadcastPresence() {
    const payload = {
      roomId: this.roomId,
      players: this.seats.map((sessionId, seatIndex) => ({
        seatIndex,
        role: seatIndexToRole(seatIndex),
        connected: Boolean(sessionId),
      })),
    };

    this.broadcast(SERVER_MESSAGE_TYPES.presence, payload);
  }

  createSnapshotPayload() {
    return {
      roomId: this.roomId,
      state: this.engine.getSnapshot(),
      players: this.seats.map((sessionId, seatIndex) => ({
        seatIndex,
        role: seatIndexToRole(seatIndex),
        connected: Boolean(sessionId),
      })),
      sentAt: Date.now(),
    };
  }
}
