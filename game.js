"use strict";

const BOARD_COLS = 33;
const BOARD_ROWS = 33;
const MAX_ACTIONS = 2;
const MOVE_RANGE = 3;
const START_HULL = 100;
const START_SHIELD = 100;
const START_TORPEDOES = 10;
const TORPEDO_DAMAGE = 35;
const LOG_LIMIT = 10;
const CODE_RED_HULL_THRESHOLD = 31;
const TORPEDO_FLIGHT_MS = 520;
const TORPEDO_IMPACT_MS = 300;

const SOUND_FILES = {
  startAlert: "assets/sounds/start_red_alert.mp3",
  explosion: "assets/sounds/explosion.mp3",
  codeRed: "assets/sounds/code_red_31.mp3",
};

const SOUND_VOLUMES = {
  startAlert: 0.55,
  explosion: 0.72,
  codeRed: 0.82,
};

const PLAYER_CONFIG = [
  {
    label: "Player 1",
    shipName: "USS Vector",
    color: "#5ff6ff",
    accent: "rgba(95, 246, 255, 0.18)",
    position: { col: 11, row: 16 },
    facing: "e",
    shipClass: "cruiser",
  },
  {
    label: "Player 2",
    shipName: "IKS Specter",
    color: "#ff7b7b",
    accent: "rgba(255, 123, 123, 0.2)",
    position: { col: 21, row: 16 },
    facing: "w",
    shipClass: "bird",
  },
];

const DIRECTION_LABELS = {
  nw: "northwest",
  ne: "northeast",
  w: "west",
  e: "east",
  sw: "southwest",
  se: "southeast",
};

const FACING_ORDER = ["nw", "ne", "e", "se", "sw", "w"];

const DIRECTION_ROTATIONS = {
  nw: -Math.PI / 6,
  ne: Math.PI / 6,
  e: Math.PI / 2,
  w: -Math.PI / 2,
  sw: (-5 * Math.PI) / 6,
  se: (5 * Math.PI) / 6,
};

const audioState = {
  liveSounds: new Set(),
  pendingOpeningAlert: false,
  openingAlertInFlight: false,
};

const ui = {
  canvas: document.getElementById("battlefield"),
  turnBanner: document.getElementById("turn-banner"),
  turnBannerLabel: document.getElementById("turn-banner-label"),
  turnBannerPlayer: document.getElementById("turn-banner-player"),
  turnBannerDetail: document.getElementById("turn-banner-detail"),
  turnBannerRound: document.getElementById("turn-banner-round"),
  turnBannerActions: document.getElementById("turn-banner-actions"),
  modeLabel: document.getElementById("mode-label"),
  statusText: document.getElementById("status-text"),
  logList: document.getElementById("log-list"),
  resetButton: document.getElementById("reset-button"),
  huds: [
    document.getElementById("hud-player-1"),
    document.getElementById("hud-player-2"),
  ],
  players: [
    {
      hull: document.getElementById("player-1-hull"),
      shield: document.getElementById("player-1-shield"),
      shieldState: document.getElementById("player-1-shield-state"),
      torpedoes: document.getElementById("player-1-torpedoes"),
      actions: document.getElementById("player-1-actions"),
      range: document.getElementById("player-1-range"),
      hitChance: document.getElementById("player-1-hit-chance"),
      position: document.getElementById("player-1-position"),
      hullMeter: document.getElementById("player-1-hull-meter"),
      shieldMeter: document.getElementById("player-1-shield-meter"),
    },
    {
      hull: document.getElementById("player-2-hull"),
      shield: document.getElementById("player-2-shield"),
      shieldState: document.getElementById("player-2-shield-state"),
      torpedoes: document.getElementById("player-2-torpedoes"),
      actions: document.getElementById("player-2-actions"),
      range: document.getElementById("player-2-range"),
      hitChance: document.getElementById("player-2-hit-chance"),
      position: document.getElementById("player-2-position"),
      hullMeter: document.getElementById("player-2-hull-meter"),
      shieldMeter: document.getElementById("player-2-shield-meter"),
    },
  ],
};

const context = ui.canvas.getContext("2d");

let state = createInitialState();
let turnCueTimer = null;
let animationFrameId = null;

function playSound(key, { queueOnBlock = false } = {}) {
  const source = SOUND_FILES[key];

  if (!source) {
    return Promise.resolve(false);
  }

  const audio = new Audio(source);
  audio.preload = "auto";
  audio.volume = SOUND_VOLUMES[key] ?? 1;

  const cleanup = () => {
    audioState.liveSounds.delete(audio);
    audio.removeEventListener("ended", cleanup);
    audio.removeEventListener("error", cleanup);
  };

  audio.addEventListener("ended", cleanup);
  audio.addEventListener("error", cleanup);
  audioState.liveSounds.add(audio);

  try {
    const playAttempt = audio.play();

    if (playAttempt && typeof playAttempt.catch === "function") {
      return playAttempt
        .then(() => {
          if (queueOnBlock) {
            audioState.pendingOpeningAlert = false;
          }

          return true;
        })
        .catch(() => {
          cleanup();

          if (queueOnBlock) {
            audioState.pendingOpeningAlert = true;
          }

          return false;
        });
    }
  } catch (_error) {
    cleanup();

    if (queueOnBlock) {
      audioState.pendingOpeningAlert = true;
    }

    return Promise.resolve(false);
  }

  if (queueOnBlock) {
    audioState.pendingOpeningAlert = false;
  }

  return Promise.resolve(true);
}

function requestOpeningAlert() {
  if (audioState.openingAlertInFlight) {
    return;
  }

  audioState.pendingOpeningAlert = true;
  audioState.openingAlertInFlight = true;
  void playSound("startAlert", { queueOnBlock: true }).finally(() => {
    audioState.openingAlertInFlight = false;
  });
}

function cueOpeningAlert() {
  requestOpeningAlert();
}

function flushPendingOpeningAlert() {
  if (!audioState.pendingOpeningAlert) {
    return;
  }

  requestOpeningAlert();
}

function createShip(config, activeIndex, index) {
  return {
    id: index,
    label: config.label,
    shipName: config.shipName,
    color: config.color,
    accent: config.accent,
    col: config.position.col,
    row: config.position.row,
    facing: config.facing,
    shipClass: config.shipClass,
    hull: START_HULL,
    shield: START_SHIELD,
    shieldsUp: false,
    codeRedTriggered: false,
    torpedoes: START_TORPEDOES,
    actionsLeft: activeIndex === index ? MAX_ACTIONS : 0,
  };
}

function createInitialState() {
  const startingIndex = Math.floor(Math.random() * PLAYER_CONFIG.length);
  const players = PLAYER_CONFIG.map((config, index) =>
    createShip(config, startingIndex, index)
  );

  return {
    players,
    activeIndex: startingIndex,
    startingIndex,
    round: 1,
    phase: "command",
    moveContext: null,
    animation: null,
    turnCue: null,
    gameOver: false,
    winnerIndex: null,
    status: `${players[startingIndex].label} has the opening turn.`,
    log: [
      `${players[startingIndex].label} wins initiative. Both ships begin with shields lowered.`,
      "Ships begin facing each other across the board.",
    ],
  };
}

function getActivePlayer() {
  return state.players[state.activeIndex];
}

function getOpponent(index = state.activeIndex) {
  return state.players[index === 0 ? 1 : 0];
}

function addLog(message) {
  state.log.unshift(message);
  state.log = state.log.slice(0, LOG_LIMIT);
}

function setStatus(message) {
  state.status = message;
}

function resetGame() {
  clearAnimationState();
  clearTurnCue();
  state = createInitialState();
  announceTurnCue(
    state.activeIndex,
    "Battle Start",
    `${getActivePlayer().label} has initiative. Shields are already down.`
  );
  cueOpeningAlert();
}

function clearTurnCue() {
  if (!turnCueTimer) {
    return;
  }

  window.clearTimeout(turnCueTimer);
  turnCueTimer = null;
}

function announceTurnCue(playerIndex, label, detail, duration = 1800) {
  clearTurnCue();
  state.turnCue = {
    playerIndex,
    label,
    detail,
  };
  render();
  turnCueTimer = window.setTimeout(() => {
    state.turnCue = null;
    turnCueTimer = null;
    render();
  }, duration);
}

function clearAnimationLoop() {
  if (animationFrameId === null) {
    return;
  }

  window.cancelAnimationFrame(animationFrameId);
  animationFrameId = null;
}

function clearAnimationState() {
  clearAnimationLoop();

  if (!state) {
    return;
  }

  state.animation = null;

  if (state.phase === "animation") {
    state.phase = "command";
  }
}

function ensureAnimationLoop() {
  if (animationFrameId !== null) {
    return;
  }

  const step = (now) => {
    updateAnimation(now);
    render(now);

    if (state.animation) {
      animationFrameId = window.requestAnimationFrame(step);
    } else {
      animationFrameId = null;
    }
  };

  animationFrameId = window.requestAnimationFrame(step);
}

function getHitChance(distance) {
  if (distance <= 0) {
    return 100;
  }

  return Math.max(0, 95 - (distance - 1) * 5);
}

function oddRToCube(col, row) {
  const x = col - (row - (row & 1)) / 2;
  const z = row;
  const y = -x - z;
  return { x, y, z };
}

function getDistance(a, b) {
  const aCube = oddRToCube(a.col, a.row);
  const bCube = oddRToCube(b.col, b.row);

  return Math.max(
    Math.abs(aCube.x - bCube.x),
    Math.abs(aCube.y - bCube.y),
    Math.abs(aCube.z - bCube.z)
  );
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function coordinateText(ship) {
  return `${String(ship.col + 1).padStart(2, "0")} / ${String(ship.row + 1).padStart(2, "0")}`;
}

function getNeighbor(col, row, direction) {
  const isOddRow = row & 1;
  const evenRowOffsets = {
    nw: { col: -1, row: -1 },
    ne: { col: 0, row: -1 },
    w: { col: -1, row: 0 },
    e: { col: 1, row: 0 },
    sw: { col: -1, row: 1 },
    se: { col: 0, row: 1 },
  };
  const oddRowOffsets = {
    nw: { col: 0, row: -1 },
    ne: { col: 1, row: -1 },
    w: { col: -1, row: 0 },
    e: { col: 1, row: 0 },
    sw: { col: 0, row: 1 },
    se: { col: 1, row: 1 },
  };

  const offsets = isOddRow ? oddRowOffsets : evenRowOffsets;
  const delta = offsets[direction];

  return {
    col: col + delta.col,
    row: row + delta.row,
  };
}

function isInBounds(col, row) {
  return col >= 0 && col < BOARD_COLS && row >= 0 && row < BOARD_ROWS;
}

function rotateFacing(ship, step) {
  const currentIndex = FACING_ORDER.indexOf(ship.facing);
  const nextIndex =
    (currentIndex + step + FACING_ORDER.length) % FACING_ORDER.length;
  ship.facing = FACING_ORDER[nextIndex];
  return ship.facing;
}

function consumeAction(ship) {
  if (ship.actionsLeft <= 0) {
    return false;
  }

  ship.actionsLeft -= 1;
  return true;
}

function evaluateVictory() {
  const [playerOne, playerTwo] = state.players;

  if (playerOne.hull <= 0 || playerTwo.hull <= 0) {
    clearTurnCue();
    state.turnCue = null;

    if (playerOne.hull === playerTwo.hull) {
      state.winnerIndex = null;
      state.gameOver = true;
      setStatus("Both ships were destroyed. The duel ends in a draw.");
      addLog("Both ships were destroyed. Draw.");
      return true;
    }

    state.winnerIndex = playerOne.hull > playerTwo.hull ? 0 : 1;
    state.gameOver = true;
    setStatus(`${state.players[state.winnerIndex].label} wins by destroying the enemy hull.`);
    addLog(`${state.players[state.winnerIndex].label} wins by destruction.`);
    return true;
  }

  if (playerOne.torpedoes === 0 && playerTwo.torpedoes === 0) {
    clearTurnCue();
    state.turnCue = null;
    state.gameOver = true;

    if (playerOne.hull === playerTwo.hull) {
      state.winnerIndex = null;
      setStatus("Both ships are out of torpedoes. Hull totals are tied. Draw.");
      addLog("Both ships expended all torpedoes. Draw.");
      return true;
    }

    state.winnerIndex = playerOne.hull > playerTwo.hull ? 0 : 1;
    setStatus(
      `${state.players[state.winnerIndex].label} wins on remaining hull after both arsenals run dry.`
    );
    addLog(
      `${state.players[state.winnerIndex].label} wins on remaining hull after both arsenals ran dry.`
    );
    return true;
  }

  return false;
}

function endTurn(reason) {
  if (state.gameOver) {
    return;
  }

  const current = getActivePlayer();
  const nextIndex = state.activeIndex === 0 ? 1 : 0;
  const next = state.players[nextIndex];

  current.actionsLeft = 0;
  state.activeIndex = nextIndex;
  next.actionsLeft = MAX_ACTIONS;
  state.phase = "command";
  state.moveContext = null;

  if (nextIndex === state.startingIndex) {
    state.round += 1;
  }

  setStatus(`${next.label} is on deck. Pass the keyboard.`);
  addLog(`${current.label} ${reason}. ${next.label} takes the helm.`);
  announceTurnCue(
    nextIndex,
    "Turn Handoff",
    `${current.label} ${reason}. Pass controls to ${next.label}.`
  );
}

function finishMoveMode(summaryMessage) {
  if (state.phase !== "move") {
    return;
  }

  state.phase = "command";
  state.moveContext = null;

  if (summaryMessage) {
    addLog(summaryMessage);
  }

  if (!state.gameOver && getActivePlayer().actionsLeft === 0) {
    endTurn("used the final available action");
  }
}

function beginMoveAction() {
  const ship = getActivePlayer();

  if (ship.actionsLeft <= 0) {
    setStatus(`${ship.label} has no actions remaining.`);
    return;
  }

  state.phase = "move";
  state.moveContext = {
    actionCommitted: false,
    stepsRemaining: MOVE_RANGE,
    stepsTaken: 0,
  };
  setStatus(
    `${ship.label} is plotting movement. Rotate with Left/Right, thrust with Up, finish with Down.`
  );
  addLog(
    `${ship.label} begins a move action with up to ${MOVE_RANGE} forward thrusts.`
  );
}

function moveShip(direction) {
  const ship = getActivePlayer();
  const destination = getNeighbor(ship.col, ship.row, direction);

  if (!isInBounds(destination.col, destination.row)) {
    setStatus("Navigation boundary reached.");
    addLog(`${ship.label} tried to move ${DIRECTION_LABELS[direction]}, but the board edge blocked the path.`);
    return;
  }

  if (!state.moveContext.actionCommitted) {
    if (!consumeAction(ship)) {
      setStatus(`${ship.label} has no actions remaining.`);
      return;
    }

    state.moveContext.actionCommitted = true;
  }

  ship.col = destination.col;
  ship.row = destination.row;
  ship.facing = direction;
  state.moveContext.stepsRemaining -= 1;
  state.moveContext.stepsTaken += 1;
  setStatus(
    `${ship.label} moved ${DIRECTION_LABELS[direction]}. ${state.moveContext.stepsRemaining} thrust${state.moveContext.stepsRemaining === 1 ? "" : "s"} remain in this move action.`
  );
  addLog(
    `${ship.label} moved ${DIRECTION_LABELS[direction]} to ${coordinateText(ship)}.`
  );

  if (state.moveContext.stepsRemaining === 0) {
    finishMoveMode(`${ship.label} completed a full ${MOVE_RANGE}-hex movement action.`);
  }
}

function moveShipForward() {
  moveShip(getActivePlayer().facing);
}

function rotateActiveShip(step) {
  const ship = getActivePlayer();
  const facing = rotateFacing(ship, step);
  const rotationLabel = step < 0 ? "left" : "right";
  const statusPrefix =
    state.phase === "move"
      ? `${ship.label} rotated ${rotationLabel}.`
      : `${ship.label} is now facing ${DIRECTION_LABELS[facing]}.`;

  if (state.phase === "move") {
    setStatus(
      `${statusPrefix} Up moves ${DIRECTION_LABELS[facing]}. ${state.moveContext.stepsRemaining} thrust${state.moveContext.stepsRemaining === 1 ? "" : "s"} remain in this action.`
    );
  } else {
    setStatus(`${ship.label} rotated ${rotationLabel} to face ${DIRECTION_LABELS[facing]}.`);
  }
}

function toggleShields() {
  const ship = getActivePlayer();

  if (!consumeAction(ship)) {
    setStatus(`${ship.label} has no actions remaining.`);
    return;
  }

  if (ship.shieldsUp) {
    ship.shieldsUp = false;
    setStatus(`${ship.label} lowered shields.`);
    addLog(`${ship.label} lowered shields.`);
  } else if (ship.shield <= 0) {
    ship.actionsLeft += 1;
    setStatus(`${ship.label} cannot raise depleted shields.`);
    addLog(`${ship.label} tried to raise depleted shields.`);
    return;
  } else {
    ship.shieldsUp = true;
    setStatus(`${ship.label} raised shields.`);
    addLog(`${ship.label} raised shields.`);
  }

  if (!state.gameOver && ship.actionsLeft === 0) {
    endTurn("used both actions");
  }
}

function applyDamage(defender, amount) {
  let overflow = amount;
  let absorbed = 0;

  if (defender.shieldsUp && defender.shield > 0) {
    absorbed = Math.min(defender.shield, amount);
    defender.shield -= absorbed;
    overflow -= absorbed;

    if (defender.shield <= 0) {
      defender.shield = 0;
      defender.shieldsUp = false;
    }
  }

  if (overflow > 0) {
    defender.hull = clamp(defender.hull - overflow, 0, START_HULL);
  }

  return { absorbed, hullDamage: overflow };
}

function maybeTriggerCodeRed(ship) {
  if (ship.hull >= CODE_RED_HULL_THRESHOLD || ship.codeRedTriggered) {
    return;
  }

  ship.codeRedTriggered = true;
  addLog(`${ship.label} dropped below 31% hull integrity.`);
  void playSound("codeRed");
}

function beginTorpedoAnimation(attacker, defender, distance, chance, hit) {
  state.phase = "animation";
  state.animation = {
    kind: "torpedo",
    attackerId: attacker.id,
    defenderId: defender.id,
    distance,
    chance,
    hit,
    startedAt: null,
    flightMs: TORPEDO_FLIGHT_MS,
    impactMs: TORPEDO_IMPACT_MS,
    resolved: false,
    completed: false,
    missSide: Math.random() < 0.5 ? -1 : 1,
    from: {
      col: attacker.col,
      row: attacker.row,
    },
    to: {
      col: defender.col,
      row: defender.row,
    },
  };
  setStatus(`${attacker.label} launched a torpedo. Weapons release in progress.`);
  ensureAnimationLoop();
}

function resolveTorpedoAnimation(animation) {
  if (animation.resolved) {
    return;
  }

  const attacker = state.players[animation.attackerId];
  const defender = state.players[animation.defenderId];

  animation.resolved = true;

  if (animation.hit) {
    const damage = applyDamage(defender, TORPEDO_DAMAGE);
    animation.damage = damage;
    void playSound("explosion");
    maybeTriggerCodeRed(defender);
    setStatus(
      `${attacker.label} scored a hit. ${damage.absorbed} shield and ${damage.hullDamage} hull damage applied.`
    );
    addLog(
      `${attacker.label} hit ${defender.label} for ${TORPEDO_DAMAGE} total damage.`
    );
  } else {
    setStatus(`${attacker.label} missed the shot.`);
    addLog(`${attacker.label} missed.`);
  }
}

function finishTorpedoAnimation() {
  const animation = state.animation;

  if (!animation || animation.completed) {
    return;
  }

  animation.completed = true;
  clearAnimationLoop();
  state.animation = null;
  state.phase = "command";

  if (evaluateVictory()) {
    render();
    return;
  }

  const attacker = state.players[animation.attackerId];

  if (attacker.actionsLeft === 0) {
    endTurn("used both actions");
  } else {
    render();
  }
}

function updateAnimation(now) {
  const animation = state.animation;

  if (!animation) {
    clearAnimationLoop();
    return;
  }

  if (animation.startedAt === null) {
    animation.startedAt = now;
  }

  const elapsed = now - animation.startedAt;

  if (!animation.resolved && elapsed >= animation.flightMs) {
    resolveTorpedoAnimation(animation);
  }

  if (elapsed >= animation.flightMs + animation.impactMs) {
    finishTorpedoAnimation();
  }
}

function fireTorpedo() {
  const attacker = getActivePlayer();
  const defender = getOpponent();

  if (attacker.actionsLeft <= 0) {
    setStatus(`${attacker.label} has no actions remaining.`);
    return;
  }

  if (attacker.torpedoes <= 0) {
    setStatus(`${attacker.label} has no torpedoes remaining.`);
    addLog(`${attacker.label} attempted to fire with empty launchers.`);
    return;
  }

  if (attacker.shieldsUp) {
    setStatus("Lower shields before firing torpedoes.");
    addLog(`${attacker.label} cannot fire while shields are raised.`);
    return;
  }

  consumeAction(attacker);
  attacker.torpedoes -= 1;

  const distance = getDistance(attacker, defender);
  const chance = getHitChance(distance);
  const roll = Math.random() * 100;
  const hit = roll < chance;

  addLog(
    `${attacker.label} fired from ${distance} hexes with a ${chance}% hit chance.`
  );
  beginTorpedoAnimation(attacker, defender, distance, chance, hit);
}

function handleMoveKey(key) {
  if (key === "arrowleft") {
    rotateActiveShip(-1);
    return true;
  }

  if (key === "arrowright") {
    rotateActiveShip(1);
    return true;
  }

  if (key === "arrowup") {
    moveShipForward();
    return true;
  }

  if (key === "arrowdown") {
    const ship = getActivePlayer();
    if (!state.moveContext.actionCommitted) {
      finishMoveMode(`${ship.label} canceled movement before committing an action.`);
      setStatus(`${ship.label} canceled movement.`);
    } else {
      finishMoveMode(`${ship.label} locked movement after ${state.moveContext.stepsTaken} hexes.`);
      setStatus(`${ship.label} ended movement.`);
    }

    return true;
  }

  return false;
}

function handleCommandKey(key) {
  switch (key) {
    case "arrowleft":
      rotateActiveShip(-1);
      return true;
    case "arrowright":
      rotateActiveShip(1);
      return true;
    case "m":
      beginMoveAction();
      return true;
    case "s":
      toggleShields();
      return true;
    case "f":
      fireTorpedo();
      return true;
    case "e":
      endTurn("ended the turn early");
      return true;
    default:
      return false;
  }
}

function handleKeydown(event) {
  const key = event.key.toLowerCase();

  flushPendingOpeningAlert();

  if (event.repeat) {
    return;
  }

  if (key === "r") {
    event.preventDefault();
    resetGame();
    return;
  }

  if (state.gameOver) {
    if (key.startsWith("arrow")) {
      event.preventDefault();
    }
    return;
  }

  if (state.animation) {
    if (key.startsWith("arrow")) {
      event.preventDefault();
    }
    return;
  }

  const handled =
    state.phase === "move" ? handleMoveKey(key) : handleCommandKey(key);

  if (handled) {
    event.preventDefault();
    render();
  } else if (key.startsWith("arrow")) {
    event.preventDefault();
  }
}

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const cssWidth = ui.canvas.clientWidth;
  const cssHeight = ui.canvas.clientHeight;

  if (
    ui.canvas.width !== Math.floor(cssWidth * ratio) ||
    ui.canvas.height !== Math.floor(cssHeight * ratio)
  ) {
    ui.canvas.width = Math.floor(cssWidth * ratio);
    ui.canvas.height = Math.floor(cssHeight * ratio);
  }

  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { width: cssWidth, height: cssHeight };
}

function getCanvasMetrics() {
  const { width, height } = resizeCanvas();
  const padding = 18;
  const radius = Math.min(
    (width - padding * 2) / (Math.sqrt(3) * (BOARD_COLS + 0.5)),
    (height - padding * 2) / (BOARD_ROWS * 1.5 + 0.5)
  );
  const boardWidth = Math.sqrt(3) * radius * (BOARD_COLS + 0.5);
  const boardHeight = radius * (1.5 * (BOARD_ROWS - 1) + 2);
  const offsetX = (width - boardWidth) / 2 + Math.sqrt(3) * radius * 0.5;
  const offsetY = (height - boardHeight) / 2 + radius;

  return { width, height, radius, offsetX, offsetY };
}

function hexCenter(col, row, metrics) {
  return {
    x: metrics.offsetX + Math.sqrt(3) * metrics.radius * (col + 0.5 * (row & 1)),
    y: metrics.offsetY + metrics.radius * 1.5 * row,
  };
}

function drawHex(centerX, centerY, radius, fill, stroke, lineWidth) {
  context.beginPath();

  for (let index = 0; index < 6; index += 1) {
    const angle = ((60 * index) - 30) * (Math.PI / 180);
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);

    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }

  context.closePath();

  if (fill) {
    context.fillStyle = fill;
    context.fill();
  }

  context.strokeStyle = stroke;
  context.lineWidth = lineWidth;
  context.stroke();
}

function drawGrid(metrics) {
  context.clearRect(0, 0, metrics.width, metrics.height);
  context.fillStyle = "#02050b";
  context.fillRect(0, 0, metrics.width, metrics.height);

  const active = getActivePlayer();
  const highlights = new Map();

  if (state.phase === "move") {
    const neighbor = getNeighbor(active.col, active.row, active.facing);
    if (isInBounds(neighbor.col, neighbor.row)) {
      highlights.set(`${neighbor.col},${neighbor.row}`, "rgba(255, 190, 85, 0.18)");
    }
  }

  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      const center = hexCenter(col, row, metrics);
      const fill = highlights.get(`${col},${row}`) || "rgba(4, 14, 24, 0.7)";
      drawHex(center.x, center.y, metrics.radius - 0.35, fill, "rgba(95, 152, 214, 0.2)", 1);
    }
  }
}

function drawFederationShip(ship, metrics) {
  context.fillStyle = ship.color;
  context.strokeStyle = "rgba(230, 245, 255, 0.86)";
  context.lineWidth = 1.8;

  context.beginPath();
  context.ellipse(0, -metrics.radius * 0.48, metrics.radius * 0.58, metrics.radius * 0.34, 0, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  context.fillRect(-metrics.radius * 0.1, -metrics.radius * 0.28, metrics.radius * 0.2, metrics.radius * 0.56);
  context.beginPath();
  context.ellipse(0, metrics.radius * 0.36, metrics.radius * 0.24, metrics.radius * 0.54, 0, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  context.beginPath();
  context.moveTo(-metrics.radius * 0.16, metrics.radius * 0.04);
  context.lineTo(-metrics.radius * 0.6, metrics.radius * 0.36);
  context.lineTo(-metrics.radius * 0.72, metrics.radius * 0.2);
  context.lineTo(-metrics.radius * 0.22, -metrics.radius * 0.02);
  context.closePath();
  context.fill();
  context.stroke();

  context.beginPath();
  context.moveTo(metrics.radius * 0.16, metrics.radius * 0.04);
  context.lineTo(metrics.radius * 0.6, metrics.radius * 0.36);
  context.lineTo(metrics.radius * 0.72, metrics.radius * 0.2);
  context.lineTo(metrics.radius * 0.22, -metrics.radius * 0.02);
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = ship.accent;
  context.fillRect(-metrics.radius * 0.82, metrics.radius * 0.12, metrics.radius * 0.18, metrics.radius * 0.88);
  context.fillRect(metrics.radius * 0.64, metrics.radius * 0.12, metrics.radius * 0.18, metrics.radius * 0.88);
  context.fillRect(-metrics.radius * 0.06, -metrics.radius * 0.6, metrics.radius * 0.12, metrics.radius * 0.24);
}

function drawBirdOfPrey(ship, metrics) {
  context.fillStyle = ship.color;
  context.strokeStyle = "rgba(250, 236, 236, 0.88)";
  context.lineWidth = 1.8;

  context.beginPath();
  context.moveTo(0, -metrics.radius * 0.98);
  context.lineTo(metrics.radius * 0.16, -metrics.radius * 0.5);
  context.lineTo(metrics.radius * 0.96, -metrics.radius * 0.18);
  context.lineTo(metrics.radius * 1.14, metrics.radius * 0.06);
  context.lineTo(metrics.radius * 0.6, metrics.radius * 0.12);
  context.lineTo(metrics.radius * 0.24, metrics.radius * 0.52);
  context.lineTo(metrics.radius * 0.44, metrics.radius * 0.96);
  context.lineTo(0, metrics.radius * 0.7);
  context.lineTo(-metrics.radius * 0.44, metrics.radius * 0.96);
  context.lineTo(-metrics.radius * 0.24, metrics.radius * 0.52);
  context.lineTo(-metrics.radius * 0.6, metrics.radius * 0.12);
  context.lineTo(-metrics.radius * 1.14, metrics.radius * 0.06);
  context.lineTo(-metrics.radius * 0.96, -metrics.radius * 0.18);
  context.lineTo(-metrics.radius * 0.16, -metrics.radius * 0.5);
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = ship.accent;
  context.beginPath();
  context.moveTo(0, -metrics.radius * 0.8);
  context.lineTo(metrics.radius * 0.14, -metrics.radius * 0.18);
  context.lineTo(metrics.radius * 0.24, metrics.radius * 0.4);
  context.lineTo(0, metrics.radius * 0.54);
  context.lineTo(-metrics.radius * 0.24, metrics.radius * 0.4);
  context.lineTo(-metrics.radius * 0.14, -metrics.radius * 0.18);
  context.closePath();
  context.fill();
}

function getAnimationGeometry(animation, metrics, now) {
  const from = hexCenter(animation.from.col, animation.from.row, metrics);
  const target = hexCenter(animation.to.col, animation.to.row, metrics);
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const px = -uy;
  const py = ux;
  const endPoint = animation.hit
    ? target
    : {
        x: target.x + ux * metrics.radius * 1.5 + px * metrics.radius * 0.8 * animation.missSide,
        y: target.y + uy * metrics.radius * 1.5 + py * metrics.radius * 0.8 * animation.missSide,
      };
  const startedAt = animation.startedAt ?? now;
  const elapsed = now - startedAt;
  const flightProgress = clamp(elapsed / animation.flightMs, 0, 1);
  const impactProgress = clamp((elapsed - animation.flightMs) / animation.impactMs, 0, 1);

  return {
    from,
    target,
    endPoint,
    current: {
      x: from.x + (endPoint.x - from.x) * flightProgress,
      y: from.y + (endPoint.y - from.y) * flightProgress,
    },
    flightProgress,
    impactProgress,
  };
}

function drawTorpedoAnimation(metrics, now) {
  const animation = state.animation;

  if (!animation || animation.kind !== "torpedo") {
    return;
  }

  const geometry = getAnimationGeometry(animation, metrics, now);

  context.save();
  context.lineCap = "round";
  context.strokeStyle = "rgba(255, 190, 85, 0.36)";
  context.lineWidth = Math.max(3, metrics.radius * 0.22);
  context.beginPath();
  context.moveTo(geometry.from.x, geometry.from.y);
  context.lineTo(geometry.current.x, geometry.current.y);
  context.stroke();

  context.fillStyle = "#ffde8c";
  context.shadowBlur = 18;
  context.shadowColor = "rgba(255, 190, 85, 0.9)";
  context.beginPath();
  context.arc(
    geometry.current.x,
    geometry.current.y,
    Math.max(3, metrics.radius * 0.22),
    0,
    Math.PI * 2
  );
  context.fill();

  if (geometry.flightProgress >= 1) {
    const impactCenter = animation.hit ? geometry.target : geometry.endPoint;
    const flashAlpha = 1 - geometry.impactProgress;
    const burstRadius = metrics.radius * (0.45 + geometry.impactProgress * 1.6);

    context.shadowBlur = 0;
    context.strokeStyle = animation.hit
      ? `rgba(255, 156, 92, ${flashAlpha})`
      : `rgba(255, 214, 133, ${flashAlpha})`;
    context.lineWidth = Math.max(2, metrics.radius * 0.16);
    context.beginPath();
    context.arc(impactCenter.x, impactCenter.y, burstRadius, 0, Math.PI * 2);
    context.stroke();

    context.fillStyle = animation.hit
      ? `rgba(255, 120, 87, ${flashAlpha * 0.35})`
      : `rgba(255, 214, 133, ${flashAlpha * 0.2})`;
    context.beginPath();
    context.arc(
      impactCenter.x,
      impactCenter.y,
      metrics.radius * (0.3 + geometry.impactProgress * 0.9),
      0,
      Math.PI * 2
    );
    context.fill();
  }

  context.restore();
}

function drawShip(ship, metrics, overlappingOffset) {
  const center = hexCenter(ship.col, ship.row, metrics);
  const offset = overlappingOffset || { x: 0, y: 0 };

  context.save();
  context.translate(center.x + offset.x, center.y + offset.y);
  context.save();
  context.rotate(DIRECTION_ROTATIONS[ship.facing] || 0);
  context.shadowBlur = 18;
  context.shadowColor = ship.color;

  if (ship.shipClass === "bird") {
    drawBirdOfPrey(ship, metrics);
  } else {
    drawFederationShip(ship, metrics);
  }

  context.restore();

  if (ship.shieldsUp && ship.shield > 0) {
    context.beginPath();
    context.arc(0, 0, metrics.radius * 1.08, 0, Math.PI * 2);
    context.strokeStyle = "rgba(95, 246, 255, 0.55)";
    context.lineWidth = 2;
    context.stroke();
  }

  if (ship.id === state.activeIndex && !state.gameOver) {
    context.beginPath();
    context.arc(0, 0, metrics.radius * 1.38, 0, Math.PI * 2);
    context.strokeStyle = "rgba(255, 190, 85, 0.9)";
    context.lineWidth = 2;
    context.stroke();
  }

  context.fillStyle = "#031018";
  context.font = `${Math.max(10, metrics.radius * 0.8)}px "IBM Plex Mono", monospace`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(ship.id + 1, 0, 1);

  context.restore();
}

function drawShips(metrics) {
  const [playerOne, playerTwo] = state.players;
  const overlapping = playerOne.col === playerTwo.col && playerOne.row === playerTwo.row;

  if (overlapping) {
    drawShip(playerOne, metrics, { x: -metrics.radius * 0.45, y: 0 });
    drawShip(playerTwo, metrics, { x: metrics.radius * 0.45, y: 0 });
    return;
  }

  state.players.forEach((ship) => drawShip(ship, metrics));
}

function renderHud() {
  state.players.forEach((ship, index) => {
    const enemy = getOpponent(index);
    const elements = ui.players[index];
    const range = getDistance(ship, enemy);
    const hitChance = getHitChance(range);

    elements.hull.textContent = ship.hull;
    elements.shield.textContent = ship.shield;
    elements.shieldState.textContent = ship.shieldsUp && ship.shield > 0 ? "UP" : "DOWN";
    elements.torpedoes.textContent = ship.torpedoes;
    elements.actions.textContent = ship.actionsLeft;
    elements.range.textContent = range;
    elements.hitChance.textContent = `${hitChance}%`;
    elements.position.textContent = coordinateText(ship);
    elements.hullMeter.style.width = `${ship.hull}%`;
    elements.shieldMeter.style.width = `${ship.shield}%`;

    ui.huds[index].classList.toggle("active", index === state.activeIndex && !state.gameOver);
  });
}

function renderTurnBanner(active) {
  const cue = state.turnCue;
  const bannerPlayerIndex = cue ? cue.playerIndex : state.activeIndex;
  const bannerClass = `turn-banner--player-${bannerPlayerIndex}`;
  const label = cue
    ? cue.label
    : state.gameOver
      ? "Battle Complete"
      : state.phase === "animation"
        ? "Weapons Release"
      : state.phase === "move"
        ? "Move Action Live"
        : "Turn Control";
  const playerText = state.gameOver
    ? state.winnerIndex === null
      ? "Draw"
      : `${state.players[state.winnerIndex].label} Wins`
    : `${active.label} At Helm`;
  const detail = cue
    ? cue.detail
    : state.gameOver
      ? state.status
      : state.phase === "animation"
      ? "Torpedo in flight. Controls locked until the weapon resolves."
      : state.phase === "move"
        ? `${state.moveContext.stepsRemaining} thrust${state.moveContext.stepsRemaining === 1 ? "" : "s"} remain in this move action.`
        : `${active.actionsLeft} action${active.actionsLeft === 1 ? "" : "s"} remaining.`;

  ui.turnBanner.classList.remove("turn-banner--player-0", "turn-banner--player-1", "turn-banner--pulse");
  ui.turnBanner.classList.add(bannerClass);

  if (cue) {
    ui.turnBanner.classList.add("turn-banner--pulse");
  }

  ui.turnBannerLabel.textContent = label;
  ui.turnBannerPlayer.textContent = playerText;
  ui.turnBannerDetail.textContent = detail;
}

function renderStatus() {
  const active = getActivePlayer();
  const movePrompt =
    state.phase === "move"
      ? `${active.label} moving. ${state.moveContext.stepsRemaining} thrust${state.moveContext.stepsRemaining === 1 ? "" : "s"} remain in this action.`
      : state.phase === "animation"
        ? "Torpedo in flight."
      : state.gameOver
        ? state.status
        : `${active.label} ready. Choose a command.`;

  ui.turnBannerRound.textContent = `Round ${state.round}`;
  ui.turnBannerActions.textContent = state.gameOver
    ? "Battle complete"
    : state.phase === "animation"
      ? "Weapons locked"
      : `${active.actionsLeft} action${active.actionsLeft === 1 ? "" : "s"} remaining`;
  ui.modeLabel.textContent =
    state.phase === "move"
      ? "Move Action Live"
      : state.phase === "animation"
        ? "Torpedo In Flight"
        : state.gameOver
          ? "Battle Concluded"
          : "Awaiting Orders";
  ui.statusText.textContent = state.status || movePrompt;
  renderTurnBanner(active);
}

function renderLog() {
  ui.logList.innerHTML = "";

  state.log.forEach((entry) => {
    const item = document.createElement("li");
    item.textContent = entry;
    ui.logList.appendChild(item);
  });
}

function renderBattlefield(now = performance.now()) {
  const metrics = getCanvasMetrics();
  drawGrid(metrics);
  drawShips(metrics);
  drawTorpedoAnimation(metrics, now);
}

function render(now = performance.now()) {
  renderHud();
  renderStatus();
  renderLog();
  renderBattlefield(now);
}

document.addEventListener("keydown", handleKeydown);
document.addEventListener("pointerdown", flushPendingOpeningAlert);
window.addEventListener("resize", render);
ui.resetButton.addEventListener("click", resetGame);

announceTurnCue(
  state.activeIndex,
  "Battle Start",
  `${getActivePlayer().label} has initiative. Shields are already down.`
);
cueOpeningAlert();
