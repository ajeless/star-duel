export const STAR_DUEL_ROOM_NAME = "star_duel_battle";

export const CLIENT_MESSAGE_TYPES = {
  command: "command",
};

export const SERVER_MESSAGE_TYPES = {
  snapshot: "snapshot",
  presence: "presence",
  roomError: "room_error",
  roomInfo: "room_info",
  serverEvents: "server_events",
};

export const PLAYER_ROLES = {
  player1: "player1",
  player2: "player2",
};

export const COMMAND_TYPES = {
  rotateLeft: "rotate_left",
  rotateRight: "rotate_right",
  beginMove: "begin_move",
  moveForward: "move_forward",
  endMove: "end_move",
  toggleShields: "toggle_shields",
  fireTorpedo: "fire_torpedo",
  endTurn: "end_turn",
  resetBattle: "reset_battle",
};

const COMMAND_TYPE_SET = new Set(Object.values(COMMAND_TYPES));

export function createCommand(type, payload = {}) {
  return { type, payload };
}

export function isValidCommand(command) {
  return Boolean(
    command
    && typeof command === "object"
    && typeof command.type === "string"
    && COMMAND_TYPE_SET.has(command.type)
    && (command.payload === undefined || command.payload === null || typeof command.payload === "object")
  );
}

export function seatIndexToRole(seatIndex) {
  return seatIndex === 0 ? PLAYER_ROLES.player1 : PLAYER_ROLES.player2;
}
