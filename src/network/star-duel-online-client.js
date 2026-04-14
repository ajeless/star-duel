import { Client } from "@colyseus/sdk";
import {
  CLIENT_MESSAGE_TYPES,
  SERVER_MESSAGE_TYPES,
  STAR_DUEL_ROOM_NAME,
} from "../game/star-duel-protocol.js";

export class StarDuelOnlineClient {
  constructor({ serverUrl = "http://127.0.0.1:2567" } = {}) {
    this.serverUrl = serverUrl;
    this.client = new Client(serverUrl);
    this.room = null;
    this.listeners = {
      snapshot: new Set(),
      presence: new Set(),
      roomInfo: new Set(),
      serverEvents: new Set(),
      roomError: new Set(),
      leave: new Set(),
    };
  }

  async hostMatch(options = {}) {
    this.room = await this.client.create(STAR_DUEL_ROOM_NAME, options);
    this.bindRoom();
    return this.room.roomId;
  }

  async joinMatch(roomId) {
    this.room = await this.client.joinById(roomId);
    this.bindRoom();
    return this.room.roomId;
  }

  async leaveMatch() {
    if (!this.room) {
      return;
    }

    const room = this.room;
    this.room = null;
    await room.leave();
  }

  sendCommand(command) {
    if (!this.room) {
      throw new Error("No online room is connected.");
    }

    this.room.send(CLIENT_MESSAGE_TYPES.command, command);
  }

  on(eventName, listener) {
    const bucket = this.listeners[eventName];

    if (!bucket) {
      throw new Error(`Unknown online client event: ${eventName}`);
    }

    bucket.add(listener);

    return () => {
      bucket.delete(listener);
    };
  }

  bindRoom() {
    this.room.onMessage(SERVER_MESSAGE_TYPES.snapshot, (payload) => {
      this.emit("snapshot", payload);
    });

    this.room.onMessage(SERVER_MESSAGE_TYPES.presence, (payload) => {
      this.emit("presence", payload);
    });

    this.room.onMessage(SERVER_MESSAGE_TYPES.roomInfo, (payload) => {
      this.emit("roomInfo", payload);
    });

    this.room.onMessage(SERVER_MESSAGE_TYPES.serverEvents, (payload) => {
      this.emit("serverEvents", payload);
    });

    this.room.onMessage(SERVER_MESSAGE_TYPES.roomError, (payload) => {
      this.emit("roomError", payload);
    });

    this.room.onLeave((code) => {
      this.emit("leave", { code });
    });
  }

  emit(eventName, payload) {
    this.listeners[eventName].forEach((listener) => {
      listener(payload);
    });
  }
}
