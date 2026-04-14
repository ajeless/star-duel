import Phaser from "phaser";
import startAlertUrl from "../../assets/sounds/start_red_alert.mp3";
import explosionUrl from "../../assets/sounds/explosion.mp3";
import codeRedUrl from "../../assets/sounds/code_red_31.mp3";
import torpedoAwayUrl from "../../assets/sounds/torpedo_away.mp3";

const BOARD_COLS = 33;
const BOARD_ROWS = 33;
const MAX_ACTIONS = 2;
const MOVE_RANGE = 3;
const START_HULL = 100;
const START_SHIELD = 100;
const START_TORPEDOES = 10;
const TORPEDO_DAMAGE = 35;
const DAMAGE_POWERUP_MULTIPLIER = 1.5;
const LOG_LIMIT = 10;
const CODE_RED_HULL_THRESHOLD = 31;
const TORPEDO_FLIGHT_MS = 520;
const TORPEDO_IMPACT_MS = 300;
const ASTEROID_COUNT = 20;
const POWERUP_COUNT = 5;

const SOUND_KEYS = {
  startAlert: "start-alert",
  explosion: "explosion",
  codeRed: "code-red",
  torpedoAway: "torpedo-away",
};

const SOUND_VOLUMES = {
  [SOUND_KEYS.startAlert]: 0.4125,
  [SOUND_KEYS.explosion]: 0.54,
  [SOUND_KEYS.codeRed]: 0.615,
  [SOUND_KEYS.torpedoAway]: 0.45,
};

const PLAYER_CONFIG = [
  {
    label: "Player 1",
    shipName: "USS Vector",
    color: "#5ff6ff",
    accentAlpha: 0.18,
    position: { col: 11, row: 16 },
    facing: "e",
    shipClass: "cruiser",
  },
  {
    label: "Player 2",
    shipName: "IKS Specter",
    color: "#ff7b7b",
    accentAlpha: 0.2,
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

const ASTEROID_COORDINATE_POOL = [
  { col: 4, row: 6 },
  { col: 8, row: 4 },
  { col: 13, row: 5 },
  { col: 18, row: 6 },
  { col: 22, row: 4 },
  { col: 27, row: 7 },
  { col: 29, row: 5 },
  { col: 6, row: 10 },
  { col: 11, row: 8 },
  { col: 16, row: 9 },
  { col: 21, row: 11 },
  { col: 25, row: 9 },
  { col: 28, row: 12 },
  { col: 5, row: 15 },
  { col: 9, row: 13 },
  { col: 14, row: 12 },
  { col: 18, row: 14 },
  { col: 23, row: 13 },
  { col: 26, row: 16 },
  { col: 7, row: 18 },
  { col: 12, row: 20 },
  { col: 17, row: 17 },
  { col: 22, row: 19 },
  { col: 28, row: 21 },
  { col: 4, row: 23 },
  { col: 9, row: 25 },
  { col: 14, row: 24 },
  { col: 18, row: 22 },
  { col: 24, row: 25 },
  { col: 27, row: 23 },
  { col: 6, row: 28 },
  { col: 11, row: 29 },
  { col: 16, row: 27 },
  { col: 21, row: 28 },
  { col: 25, row: 30 },
  { col: 29, row: 27 },
];

const POWERUP_COORDINATE_POOL = [
  { col: 6, row: 7 },
  { col: 12, row: 6 },
  { col: 20, row: 8 },
  { col: 26, row: 10 },
  { col: 8, row: 16 },
  { col: 15, row: 14 },
  { col: 24, row: 17 },
  { col: 5, row: 22 },
  { col: 17, row: 21 },
  { col: 27, row: 24 },
  { col: 10, row: 27 },
  { col: 19, row: 26 },
  { col: 23, row: 29 },
];

const SMOKE_SCENARIO = {
  startingIndex: 0,
  asteroids: [
    { col: 14, row: 16 },
    { col: 18, row: 16 },
    { col: 12, row: 13 },
    { col: 15, row: 12 },
    { col: 19, row: 12 },
    { col: 16, row: 15 },
    { col: 17, row: 14 },
    { col: 20, row: 18 },
    { col: 17, row: 19 },
    { col: 13, row: 20 },
    { col: 10, row: 18 },
    { col: 22, row: 14 },
    { col: 24, row: 17 },
    { col: 21, row: 21 },
    { col: 8, row: 11 },
    { col: 11, row: 24 },
  ],
  powerups: [
    { col: 13, row: 16 },
    { col: 19, row: 16 },
    { col: 16, row: 12 },
    { col: 16, row: 20 },
    { col: 23, row: 19 },
  ],
};

const BATTLE_COLORS = {
  background: "#02050b",
  battlefield: "#03111f",
  battlefieldBorder: "#66b6ff",
  gridFill: "#040e18",
  gridStroke: "#5f98d6",
  moveHighlight: "#ffbe55",
  blockedHighlight: "#ff6d78",
  asteroidBase: "#596272",
  asteroidShadow: "#2b3340",
  asteroidDust: "#8b94a4",
  powerupCore: "#9df8ff",
  powerupGlow: "#ffbe55",
  shieldRing: "#5ff6ff",
  activeRing: "#ffbe55",
  torpedoTrail: "#ffbe55",
  boostedTorpedoTrail: "#7ef29a",
  torpedoCore: "#ffde8c",
  boostedTorpedoCore: "#9df8ff",
  impactHit: "#ff9c5c",
  impactMiss: "#ffd685",
  boostedImpactHit: "#7ef29a",
  hullOutline: "#e6f5ff",
};

function colorNumber(hex) {
  return Number.parseInt(hex.replace("#", ""), 16);
}

function alphaColor(hex, alpha) {
  return { color: colorNumber(hex), alpha };
}

class BattleScene extends Phaser.Scene {
  constructor(app) {
    super("battle");
    this.app = app;
  }

  preload() {
    this.load.audio(SOUND_KEYS.startAlert, startAlertUrl);
    this.load.audio(SOUND_KEYS.explosion, explosionUrl);
    this.load.audio(SOUND_KEYS.codeRed, codeRedUrl);
    this.load.audio(SOUND_KEYS.torpedoAway, torpedoAwayUrl);
  }

  create() {
    this.graphics = this.add.graphics();
    this.graphics.setDepth(1);
    this.app.attachScene(this);
  }

  update(_time, delta) {
    this.app.tick(delta);
    this.app.drawBattlefield(this.graphics, this.scale.width, this.scale.height);
  }
}

export class StarDuelApp {
  constructor(ui) {
    this.ui = ui;
    this.scene = null;
    this.scenario = this.readScenario();
    this.codeRedAudio = null;
    this.pendingOpeningAlert = false;
    this.boundKeydown = this.handleKeydown.bind(this);
    this.boundResize = this.handleResize.bind(this);
    this.boundPointer = this.flushPendingOpeningAlert.bind(this);
    this.stars = this.createStarfield();
    this.state = this.createInitialState();

    this.game = new Phaser.Game({
      type: Phaser.CANVAS,
      parent: ui.root,
      width: Math.max(ui.root.clientWidth, 640),
      height: Math.max(ui.root.clientHeight, 420),
      backgroundColor: BATTLE_COLORS.background,
      render: {
        antialias: true,
      },
      scene: [new BattleScene(this)],
    });

    window.addEventListener("keydown", this.boundKeydown, { passive: false });
    window.addEventListener("resize", this.boundResize);
    window.addEventListener("pointerdown", this.boundPointer);
  }

  attachScene(scene) {
    this.scene = scene;
    this.handleResize();
    this.resetGame();
  }

  createInitialState() {
    const startingIndex = this.scenario?.startingIndex ?? Math.floor(Math.random() * PLAYER_CONFIG.length);
    const players = PLAYER_CONFIG.map((config, index) =>
      this.createShip(config, startingIndex, index)
    );
    const { asteroids, powerups } = this.createBoardFeatures(players);

    return {
      players,
      asteroids,
      powerups,
      activeIndex: startingIndex,
      startingIndex,
      round: 1,
      phase: "command",
      moveContext: null,
      animation: null,
      turnCue: {
        playerIndex: startingIndex,
        label: "Battle Start",
        detail: `${players[startingIndex].label} has initiative. Shields are already down.`,
        timeLeft: 1800,
      },
      gameOver: false,
      winnerIndex: null,
      status: `${players[startingIndex].label} has the opening turn.`,
      log: [
        "Asteroid debris and crystal powerups drift across the battlefield.",
        `${players[startingIndex].label} wins initiative. Both ships begin with shields lowered.`,
        "Ships begin facing each other across the board.",
      ],
    };
  }

  createShip(config, activeIndex, index) {
    return {
      id: index,
      label: config.label,
      shipName: config.shipName,
      color: config.color,
      accentAlpha: config.accentAlpha,
      col: config.position.col,
      row: config.position.row,
      facing: config.facing,
      shipClass: config.shipClass,
      hull: START_HULL,
      shield: START_SHIELD,
      shieldsUp: false,
      codeRedTriggered: false,
      torpedoes: START_TORPEDOES,
      boostCharges: 0,
      actionsLeft: activeIndex === index ? MAX_ACTIONS : 0,
    };
  }

  createBoardFeatures(players) {
    const occupied = new Set(players.map((player) => this.tileKey(player.col, player.row)));

    if (this.scenario) {
      const asteroids = this.cloneScenarioTiles(this.scenario.asteroids, occupied);
      const powerups = this.cloneScenarioTiles(this.scenario.powerups, occupied);
      return { asteroids, powerups };
    }

    const asteroids = this.pickBoardTiles(ASTEROID_COORDINATE_POOL, ASTEROID_COUNT, occupied);
    const powerups = this.pickBoardTiles(POWERUP_COORDINATE_POOL, POWERUP_COUNT, occupied);
    return { asteroids, powerups };
  }

  cloneScenarioTiles(pool, occupied) {
    const selected = [];

    for (const tile of pool) {
      const key = this.tileKey(tile.col, tile.row);

      if (occupied.has(key)) {
        continue;
      }

      occupied.add(key);
      selected.push({ ...tile });
    }

    return selected;
  }

  pickBoardTiles(pool, count, occupied) {
    const shuffled = Phaser.Utils.Array.Shuffle(pool.map((tile) => ({ ...tile })));
    return this.cloneScenarioTiles(shuffled.slice(0, count), occupied);
  }

  readScenario() {
    if (typeof window === "undefined") {
      return null;
    }

    const params = new URLSearchParams(window.location.search);
    return params.get("scenario") === "smoke" ? SMOKE_SCENARIO : null;
  }

  resetGame() {
    this.state = this.createInitialState();
    this.renderUi();
    this.requestOpeningAlert();
  }

  tick(delta) {
    if (this.state.turnCue) {
      this.state.turnCue.timeLeft = Math.max(0, this.state.turnCue.timeLeft - delta);
      if (this.state.turnCue.timeLeft === 0) {
        this.state.turnCue = null;
      }
    }

    if (this.state.animation) {
      this.state.animation.elapsed += delta;
      if (!this.state.animation.resolved && this.state.animation.elapsed >= this.state.animation.flightMs) {
        this.resolveTorpedoAnimation(this.state.animation);
      }
      if (this.state.animation.elapsed >= this.state.animation.flightMs + this.state.animation.impactMs) {
        this.finishTorpedoAnimation();
      }
    }

    this.renderUi();
  }

  handleResize() {
    if (!this.scene) {
      return;
    }

    const width = Math.max(this.ui.root.clientWidth, 640);
    const height = Math.max(this.ui.root.clientHeight, 420);
    this.game.scale.resize(width, height);
  }

  handleKeydown(event) {
    const key = event.key.toLowerCase();

    this.flushPendingOpeningAlert();

    if (event.repeat) {
      return;
    }

    if (key === "r") {
      event.preventDefault();
      this.resetGame();
      return;
    }

    if (this.state.gameOver || this.state.animation) {
      if (key.startsWith("arrow")) {
        event.preventDefault();
      }
      return;
    }

    let handled = false;

    if (this.state.phase === "move") {
      handled = this.handleMoveKey(key);
    } else {
      handled = this.handleCommandKey(key);
    }

    if (handled) {
      event.preventDefault();
      this.renderUi();
    } else if (key.startsWith("arrow")) {
      event.preventDefault();
    }
  }

  handleMoveKey(key) {
    if (key === "arrowleft") {
      this.rotateActiveShip(-1);
      return true;
    }

    if (key === "arrowright") {
      this.rotateActiveShip(1);
      return true;
    }

    if (key === "arrowup") {
      this.moveShipForward();
      return true;
    }

    if (key === "arrowdown") {
      const ship = this.getActivePlayer();
      if (!this.state.moveContext.actionCommitted) {
        this.finishMoveMode(`${ship.label} canceled movement before committing an action.`);
        this.setStatus(`${ship.label} canceled movement.`);
      } else {
        this.finishMoveMode(`${ship.label} locked movement after ${this.state.moveContext.stepsTaken} hexes.`);
        this.setStatus(`${ship.label} ended movement.`);
      }

      return true;
    }

    return false;
  }

  handleCommandKey(key) {
    switch (key) {
      case "arrowleft":
        this.rotateActiveShip(-1);
        return true;
      case "arrowright":
        this.rotateActiveShip(1);
        return true;
      case "m":
        this.beginMoveAction();
        return true;
      case "s":
        this.toggleShields();
        return true;
      case "f":
        this.fireTorpedo();
        return true;
      case "e":
        this.endTurn("ended the turn early");
        return true;
      default:
        return false;
    }
  }

  requestOpeningAlert() {
    if (!this.scene) {
      return;
    }

    if (this.scene.sound.locked) {
      this.pendingOpeningAlert = true;
      return;
    }

    this.pendingOpeningAlert = false;
    this.playSound(SOUND_KEYS.startAlert);
  }

  flushPendingOpeningAlert() {
    if (!this.pendingOpeningAlert) {
      return;
    }

    this.requestOpeningAlert();
  }

  playSound(key) {
    if (!this.scene || this.scene.sound.locked) {
      return;
    }

    let sound = this.scene.sound.get(key);
    if (!sound) {
      sound = this.scene.sound.add(key, { volume: SOUND_VOLUMES[key] ?? 1 });
    }

    sound.stop();
    sound.play();
  }

  playCodeRedSound() {
    this.codeRedAudio = this.playRateAdjustedAudio({
      url: codeRedUrl,
      fallbackKey: SOUND_KEYS.codeRed,
      volume: SOUND_VOLUMES[SOUND_KEYS.codeRed] ?? 1,
      playbackRate: 2,
      existingAudio: this.codeRedAudio,
      onCleanup: () => {
        this.codeRedAudio = null;
      },
    });
  }

  playTorpedoLaunchSound() {
    this.playRateAdjustedAudio({
      url: torpedoAwayUrl,
      fallbackKey: SOUND_KEYS.torpedoAway,
      volume: SOUND_VOLUMES[SOUND_KEYS.torpedoAway] ?? 1,
      playbackRate: 2,
    });
  }

  playRateAdjustedAudio({ url, fallbackKey, volume, playbackRate, existingAudio = null, onCleanup = null }) {
    if (typeof Audio === "undefined") {
      if (fallbackKey) {
        this.playSound(fallbackKey);
      }
      return null;
    }

    if (existingAudio) {
      existingAudio.pause();
      existingAudio.currentTime = 0;
    }

    const audio = new Audio(url);
    audio.preload = "auto";
    audio.volume = volume;
    audio.playbackRate = playbackRate;

    if ("preservesPitch" in audio) {
      audio.preservesPitch = true;
    }

    if ("mozPreservesPitch" in audio) {
      audio.mozPreservesPitch = true;
    }

    if ("webkitPreservesPitch" in audio) {
      audio.webkitPreservesPitch = true;
    }

    const cleanup = () => {
      audio.removeEventListener("ended", cleanup);
      audio.removeEventListener("error", cleanup);
      if (typeof onCleanup === "function") {
        onCleanup();
      }
    };

    audio.addEventListener("ended", cleanup);
    audio.addEventListener("error", cleanup);

    const playAttempt = audio.play();
    if (playAttempt && typeof playAttempt.catch === "function") {
      playAttempt.catch(() => {
        cleanup();
      });
    }

    return audio;
  }

  getActivePlayer() {
    return this.state.players[this.state.activeIndex];
  }

  getOpponent(index = this.state.activeIndex) {
    return this.state.players[index === 0 ? 1 : 0];
  }

  addLog(message) {
    this.state.log.unshift(message);
    this.state.log = this.state.log.slice(0, LOG_LIMIT);
  }

  setStatus(message) {
    this.state.status = message;
  }

  announceTurnCue(playerIndex, label, detail, duration = 1800) {
    this.state.turnCue = {
      playerIndex,
      label,
      detail,
      timeLeft: duration,
    };
  }

  getHitChance(distance) {
    if (distance <= 0) {
      return 100;
    }

    return Math.max(0, 95 - (distance - 1) * 5);
  }

  oddRToCube(col, row) {
    const x = col - (row - (row & 1)) / 2;
    const z = row;
    const y = -x - z;
    return { x, y, z };
  }

  cubeToOddR(cube) {
    return {
      col: cube.x + (cube.z - (cube.z & 1)) / 2,
      row: cube.z,
    };
  }

  cubeLerp(a, b, t) {
    return {
      x: Phaser.Math.Linear(a.x, b.x, t),
      y: Phaser.Math.Linear(a.y, b.y, t),
      z: Phaser.Math.Linear(a.z, b.z, t),
    };
  }

  cubeRound(cube) {
    let rx = Math.round(cube.x);
    let ry = Math.round(cube.y);
    let rz = Math.round(cube.z);

    const xDiff = Math.abs(rx - cube.x);
    const yDiff = Math.abs(ry - cube.y);
    const zDiff = Math.abs(rz - cube.z);

    if (xDiff > yDiff && xDiff > zDiff) {
      rx = -ry - rz;
    } else if (yDiff > zDiff) {
      ry = -rx - rz;
    } else {
      rz = -rx - ry;
    }

    return { x: rx, y: ry, z: rz };
  }

  getDistance(a, b) {
    const aCube = this.oddRToCube(a.col, a.row);
    const bCube = this.oddRToCube(b.col, b.row);

    return Math.max(
      Math.abs(aCube.x - bCube.x),
      Math.abs(aCube.y - bCube.y),
      Math.abs(aCube.z - bCube.z)
    );
  }

  getHexLine(a, b) {
    const distance = this.getDistance(a, b);

    if (distance === 0) {
      return [{ col: a.col, row: a.row }];
    }

    const from = this.oddRToCube(a.col, a.row);
    const to = this.oddRToCube(b.col, b.row);
    const path = [];

    for (let step = 0; step <= distance; step += 1) {
      const t = distance === 0 ? 0 : step / distance;
      const cube = this.cubeRound(this.cubeLerp(from, to, t));
      const oddR = this.cubeToOddR(cube);
      path.push({ col: oddR.col, row: oddR.row });
    }

    return path;
  }

  coordinateText(ship) {
    return `${String(ship.col + 1).padStart(2, "0")} / ${String(ship.row + 1).padStart(2, "0")}`;
  }

  tileKey(col, row) {
    return `${col},${row}`;
  }

  getNeighbor(col, row, direction) {
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

  isInBounds(col, row) {
    return col >= 0 && col < BOARD_COLS && row >= 0 && row < BOARD_ROWS;
  }

  hasAsteroidAt(col, row) {
    return this.state.asteroids.some((asteroid) => asteroid.col === col && asteroid.row === row);
  }

  getPowerupIndexAt(col, row) {
    return this.state.powerups.findIndex((powerup) => powerup.col === col && powerup.row === row);
  }

  getAsteroidBlocker(attacker, defender) {
    const path = this.getHexLine(attacker, defender);

    for (const tile of path.slice(1, -1)) {
      if (this.hasAsteroidAt(tile.col, tile.row)) {
        return tile;
      }
    }

    return null;
  }

  rotateFacing(ship, step) {
    const currentIndex = FACING_ORDER.indexOf(ship.facing);
    const nextIndex = (currentIndex + step + FACING_ORDER.length) % FACING_ORDER.length;
    ship.facing = FACING_ORDER[nextIndex];
    return ship.facing;
  }

  consumeAction(ship) {
    if (ship.actionsLeft <= 0) {
      return false;
    }

    ship.actionsLeft -= 1;
    return true;
  }

  evaluateVictory() {
    const [playerOne, playerTwo] = this.state.players;

    if (playerOne.hull <= 0 || playerTwo.hull <= 0) {
      this.state.turnCue = null;
      this.state.gameOver = true;

      if (playerOne.hull === playerTwo.hull) {
        this.state.winnerIndex = null;
        this.setStatus("Both ships were destroyed. The duel ends in a draw.");
        this.addLog("Both ships were destroyed. Draw.");
        return true;
      }

      this.state.winnerIndex = playerOne.hull > playerTwo.hull ? 0 : 1;
      this.setStatus(`${this.state.players[this.state.winnerIndex].label} wins by destroying the enemy hull.`);
      this.addLog(`${this.state.players[this.state.winnerIndex].label} wins by destruction.`);
      return true;
    }

    if (playerOne.torpedoes === 0 && playerTwo.torpedoes === 0) {
      this.state.turnCue = null;
      this.state.gameOver = true;

      if (playerOne.hull === playerTwo.hull) {
        this.state.winnerIndex = null;
        this.setStatus("Both ships are out of torpedoes. Hull totals are tied. Draw.");
        this.addLog("Both ships expended all torpedoes. Draw.");
        return true;
      }

      this.state.winnerIndex = playerOne.hull > playerTwo.hull ? 0 : 1;
      this.setStatus(`${this.state.players[this.state.winnerIndex].label} wins on remaining hull after both arsenals run dry.`);
      this.addLog(`${this.state.players[this.state.winnerIndex].label} wins on remaining hull after both arsenals ran dry.`);
      return true;
    }

    return false;
  }

  endTurn(reason) {
    if (this.state.gameOver) {
      return;
    }

    const current = this.getActivePlayer();
    const nextIndex = this.state.activeIndex === 0 ? 1 : 0;
    const next = this.state.players[nextIndex];

    current.actionsLeft = 0;
    this.state.activeIndex = nextIndex;
    next.actionsLeft = MAX_ACTIONS;
    this.state.phase = "command";
    this.state.moveContext = null;

    if (nextIndex === this.state.startingIndex) {
      this.state.round += 1;
    }

    this.setStatus(`${next.label} is on deck. Pass the keyboard.`);
    this.addLog(`${current.label} ${reason}. ${next.label} takes the helm.`);
    this.announceTurnCue(nextIndex, "Turn Handoff", `${current.label} ${reason}. Pass controls to ${next.label}.`);
  }

  finishMoveMode(summaryMessage) {
    if (this.state.phase !== "move") {
      return;
    }

    this.state.phase = "command";
    this.state.moveContext = null;

    if (summaryMessage) {
      this.addLog(summaryMessage);
    }

    if (!this.state.gameOver && this.getActivePlayer().actionsLeft === 0) {
      this.endTurn("used the final available action");
    }
  }

  beginMoveAction() {
    const ship = this.getActivePlayer();

    if (ship.actionsLeft <= 0) {
      this.setStatus(`${ship.label} has no actions remaining.`);
      return;
    }

    this.state.phase = "move";
    this.state.moveContext = {
      actionCommitted: false,
      stepsRemaining: MOVE_RANGE,
      stepsTaken: 0,
    };
    this.setStatus(`${ship.label} is plotting movement. Rotate with Left/Right, thrust with Up, finish with Down.`);
    this.addLog(`${ship.label} begins a move action with up to ${MOVE_RANGE} forward thrusts.`);
  }

  moveShip(direction) {
    const ship = this.getActivePlayer();
    const destination = this.getNeighbor(ship.col, ship.row, direction);

    if (!this.isInBounds(destination.col, destination.row)) {
      this.setStatus("Navigation boundary reached.");
      this.addLog(`${ship.label} tried to move ${DIRECTION_LABELS[direction]}, but the board edge blocked the path.`);
      return;
    }

    if (this.hasAsteroidAt(destination.col, destination.row)) {
      this.setStatus("Asteroid debris blocks the plotted course.");
      this.addLog(`${ship.label} tried to move ${DIRECTION_LABELS[direction]}, but an asteroid blocked the path.`);
      return;
    }

    if (!this.state.moveContext.actionCommitted) {
      if (!this.consumeAction(ship)) {
        this.setStatus(`${ship.label} has no actions remaining.`);
        return;
      }

      this.state.moveContext.actionCommitted = true;
    }

    ship.col = destination.col;
    ship.row = destination.row;
    ship.facing = direction;
    this.state.moveContext.stepsRemaining -= 1;
    this.state.moveContext.stepsTaken += 1;
    this.setStatus(`${ship.label} moved ${DIRECTION_LABELS[direction]}. ${this.state.moveContext.stepsRemaining} thrust${this.state.moveContext.stepsRemaining === 1 ? "" : "s"} remain in this move action.`);
    this.addLog(`${ship.label} moved ${DIRECTION_LABELS[direction]} to ${this.coordinateText(ship)}.`);
    this.collectPowerup(ship);

    if (this.state.moveContext.stepsRemaining === 0) {
      this.finishMoveMode(`${ship.label} completed a full ${MOVE_RANGE}-hex movement action.`);
    }
  }

  collectPowerup(ship) {
    const powerupIndex = this.getPowerupIndexAt(ship.col, ship.row);

    if (powerupIndex === -1) {
      return;
    }

    this.state.powerups.splice(powerupIndex, 1);
    ship.boostCharges += 1;
    this.setStatus(`${ship.label} collected a crystal powerup. The next torpedo gains +50% damage.`);
    this.addLog(`${ship.label} collected a crystal powerup. ${ship.boostCharges} boosted shot${ship.boostCharges === 1 ? "" : "s"} ready.`);
  }

  moveShipForward() {
    this.moveShip(this.getActivePlayer().facing);
  }

  rotateActiveShip(step) {
    const ship = this.getActivePlayer();
    const facing = this.rotateFacing(ship, step);
    const rotationLabel = step < 0 ? "left" : "right";

    if (this.state.phase === "move") {
      this.setStatus(`${ship.label} rotated ${rotationLabel}. Up moves ${DIRECTION_LABELS[facing]}. ${this.state.moveContext.stepsRemaining} thrust${this.state.moveContext.stepsRemaining === 1 ? "" : "s"} remain in this action.`);
    } else {
      this.setStatus(`${ship.label} rotated ${rotationLabel} to face ${DIRECTION_LABELS[facing]}.`);
    }
  }

  toggleShields() {
    const ship = this.getActivePlayer();

    if (!this.consumeAction(ship)) {
      this.setStatus(`${ship.label} has no actions remaining.`);
      return;
    }

    if (ship.shieldsUp) {
      ship.shieldsUp = false;
      this.setStatus(`${ship.label} lowered shields.`);
      this.addLog(`${ship.label} lowered shields.`);
    } else if (ship.shield <= 0) {
      ship.actionsLeft += 1;
      this.setStatus(`${ship.label} cannot raise depleted shields.`);
      this.addLog(`${ship.label} tried to raise depleted shields.`);
      return;
    } else {
      ship.shieldsUp = true;
      this.setStatus(`${ship.label} raised shields.`);
      this.addLog(`${ship.label} raised shields.`);
    }

    if (!this.state.gameOver && ship.actionsLeft === 0) {
      this.endTurn("used both actions");
    }
  }

  applyDamage(defender, amount) {
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
      defender.hull = Math.max(0, defender.hull - overflow);
    }

    return { absorbed, hullDamage: overflow };
  }

  maybeTriggerCodeRed(ship) {
    if (ship.hull >= CODE_RED_HULL_THRESHOLD || ship.codeRedTriggered) {
      return;
    }

    ship.codeRedTriggered = true;
    this.addLog(`${ship.label} dropped below 31% hull integrity.`);
    this.playCodeRedSound();
  }

  beginTorpedoAnimation(attacker, defender, distance, chance, hit, options = {}) {
    const impactTile = options.impactTile || {
      col: defender.col,
      row: defender.row,
    };

    this.state.phase = "animation";
    this.state.animation = {
      kind: "torpedo",
      attackerId: attacker.id,
      defenderId: defender.id,
      distance,
      chance,
      damageAmount: TORPEDO_DAMAGE,
      boosted: false,
      blockedByAsteroid: Boolean(options.blockedByAsteroid),
      hit,
      elapsed: 0,
      flightMs: TORPEDO_FLIGHT_MS,
      impactMs: TORPEDO_IMPACT_MS,
      resolved: false,
      missSide: Math.random() < 0.5 ? -1 : 1,
      from: {
        col: attacker.col,
        row: attacker.row,
      },
      to: impactTile,
    };
    this.setStatus(`${attacker.label} launched a torpedo. Weapons release in progress.`);
  }

  resolveTorpedoAnimation(animation) {
    if (animation.resolved) {
      return;
    }

    const attacker = this.state.players[animation.attackerId];
    const defender = this.state.players[animation.defenderId];

    animation.resolved = true;

    if (animation.blockedByAsteroid) {
      this.playSound(SOUND_KEYS.explosion);
      this.setStatus(`${attacker.label}'s ${animation.boosted ? "boosted " : ""}torpedo struck an asteroid at ${this.coordinateText(animation.to)}.`);
      this.addLog(`${attacker.label}'s ${animation.boosted ? "boosted " : ""}torpedo impacted asteroid debris at ${this.coordinateText(animation.to)}.`);
    } else if (animation.hit) {
      const damage = this.applyDamage(defender, animation.damageAmount);
      animation.damage = damage;
      this.playSound(SOUND_KEYS.explosion);
      this.maybeTriggerCodeRed(defender);
      this.setStatus(`${attacker.label} scored a ${animation.boosted ? "boosted " : ""}hit. ${damage.absorbed} shield and ${damage.hullDamage} hull damage applied.`);
      this.addLog(`${attacker.label} hit ${defender.label} for ${animation.damageAmount} total damage${animation.boosted ? " with a crystal boost" : ""}.`);
    } else {
      this.setStatus(`${attacker.label} missed the ${animation.boosted ? "boosted " : ""}shot.`);
      this.addLog(`${attacker.label} missed${animation.boosted ? " with a crystal boost" : ""}.`);
    }
  }

  finishTorpedoAnimation() {
    const animation = this.state.animation;

    if (!animation) {
      return;
    }

    this.state.animation = null;
    this.state.phase = "command";

    if (this.evaluateVictory()) {
      return;
    }

    const attacker = this.state.players[animation.attackerId];

    if (attacker.actionsLeft === 0) {
      this.endTurn("used both actions");
    }
  }

  fireTorpedo() {
    const attacker = this.getActivePlayer();
    const defender = this.getOpponent();

    if (attacker.actionsLeft <= 0) {
      this.setStatus(`${attacker.label} has no actions remaining.`);
      return;
    }

    if (attacker.torpedoes <= 0) {
      this.setStatus(`${attacker.label} has no torpedoes remaining.`);
      this.addLog(`${attacker.label} attempted to fire with empty launchers.`);
      return;
    }

    if (attacker.shieldsUp) {
      this.setStatus("Lower shields before firing torpedoes.");
      this.addLog(`${attacker.label} cannot fire while shields are raised.`);
      return;
    }

    this.consumeAction(attacker);
    attacker.torpedoes -= 1;
    const boosted = attacker.boostCharges > 0;

    if (boosted) {
      attacker.boostCharges -= 1;
    }

    const distance = this.getDistance(attacker, defender);
    const blocker = this.getAsteroidBlocker(attacker, defender);
    const chance = this.getHitChance(distance);
    const hit = blocker ? false : Math.random() * 100 < chance;
    const damageAmount = boosted
      ? Math.round(TORPEDO_DAMAGE * DAMAGE_POWERUP_MULTIPLIER)
      : TORPEDO_DAMAGE;

    if (blocker) {
      this.addLog(`${attacker.label} fired${boosted ? " a crystal-boosted torpedo" : ""}, but asteroid debris blocked the firing lane at ${this.coordinateText(blocker)}.`);
    } else {
      this.addLog(`${attacker.label} fired${boosted ? " a crystal-boosted torpedo" : ""} from ${distance} hexes with a ${chance}% hit chance.`);
    }

    this.playTorpedoLaunchSound();
    this.beginTorpedoAnimation(attacker, defender, distance, chance, hit, {
      impactTile: blocker || {
        col: defender.col,
        row: defender.row,
      },
      blockedByAsteroid: Boolean(blocker),
    });
    this.state.animation.damageAmount = damageAmount;
    this.state.animation.boosted = boosted;
  }

  renderUi() {
    const active = this.getActivePlayer();
    const cue = this.state.turnCue;
    const bannerPlayerIndex = cue ? cue.playerIndex : this.state.activeIndex;
    const label = cue
      ? cue.label
      : this.state.gameOver
        ? "Battle Complete"
        : this.state.phase === "animation"
          ? "Weapons Release"
          : this.state.phase === "move"
            ? "Move Action Live"
            : "Turn Control";
    const playerText = this.state.gameOver
      ? this.state.winnerIndex === null
        ? "Draw"
        : `${this.state.players[this.state.winnerIndex].label} Wins`
      : `${active.label} At Helm`;
    const detail = cue
      ? cue.detail
      : this.state.gameOver
        ? this.state.status
        : this.state.phase === "animation"
          ? "Torpedo in flight. Controls locked until the weapon resolves."
          : this.state.phase === "move"
            ? `${this.state.moveContext.stepsRemaining} thrust${this.state.moveContext.stepsRemaining === 1 ? "" : "s"} remain in this move action.`
            : `${active.actionsLeft} action${active.actionsLeft === 1 ? "" : "s"} remaining.`;

    this.ui.turnBanner.classList.remove("turn-banner--player-0", "turn-banner--player-1");
    this.ui.turnBanner.classList.add(`turn-banner--player-${bannerPlayerIndex}`);
    this.ui.turnBannerLabel.textContent = label;
    this.ui.turnBannerPlayer.textContent = playerText;
    this.ui.turnBannerPlayer.style.color = PLAYER_CONFIG[bannerPlayerIndex].color;
    this.ui.turnBannerDetail.textContent = detail;
    this.ui.turnBannerRound.textContent = `Round ${this.state.round}`;
    this.ui.turnBannerActions.textContent = this.state.gameOver
      ? "Battle complete"
      : this.state.phase === "animation"
        ? "Weapons locked"
        : `${active.actionsLeft} action${active.actionsLeft === 1 ? "" : "s"} remaining`;
    this.ui.modeLabel.textContent = this.state.phase === "move"
      ? "Move Action Live"
      : this.state.phase === "animation"
        ? "Torpedo In Flight"
        : this.state.gameOver
          ? "Battle Concluded"
          : "Awaiting Orders";
    this.ui.statusText.textContent = this.state.status;

    this.state.players.forEach((ship, index) => {
      const enemy = this.getOpponent(index);
      const range = this.getDistance(ship, enemy);
      const hitChance = this.getHitChance(range);
      const blocker = this.getAsteroidBlocker(ship, enemy);
      const elements = this.ui.players[index];

      elements.hull.textContent = ship.hull;
      elements.shield.textContent = ship.shield;
      elements.shieldState.textContent = ship.shieldsUp && ship.shield > 0 ? "UP" : "DOWN";
      elements.torpedoes.textContent = ship.torpedoes;
      elements.boost.textContent = ship.boostCharges;
      elements.actions.textContent = ship.actionsLeft;
      elements.range.textContent = range;
      elements.hitChance.textContent = blocker ? "BLOCKED" : `${hitChance}%`;
      elements.position.textContent = this.coordinateText(ship);
      this.ui.huds[index].classList.toggle("active", index === this.state.activeIndex && !this.state.gameOver);
    });

    this.ui.logList.innerHTML = "";
    this.state.log.forEach((entry) => {
      const item = document.createElement("li");
      item.textContent = entry;
      this.ui.logList.appendChild(item);
    });
  }

  createStarfield() {
    return Array.from({ length: 120 }, () => ({
      x: Math.random(),
      y: Math.random(),
      radius: Phaser.Math.FloatBetween(0.8, 2.2),
      alpha: Phaser.Math.FloatBetween(0.18, 0.95),
    }));
  }

  getCanvasMetrics(width, height) {
    const padding = 18;
    const radius = Math.max(
      3,
      Math.min(
        (width - padding * 2) / (Math.sqrt(3) * (BOARD_COLS + 0.5)),
        (height - padding * 2) / (BOARD_ROWS * 1.5 + 0.5)
      )
    );
    const boardWidth = Math.sqrt(3) * radius * (BOARD_COLS + 0.5);
    const boardHeight = radius * (1.5 * (BOARD_ROWS - 1) + 2);
    const offsetX = (width - boardWidth) / 2 + Math.sqrt(3) * radius * 0.5;
    const offsetY = (height - boardHeight) / 2 + radius;

    return { width, height, radius, offsetX, offsetY };
  }

  hexCenter(col, row, metrics) {
    return {
      x: metrics.offsetX + Math.sqrt(3) * metrics.radius * (col + 0.5 * (row & 1)),
      y: metrics.offsetY + metrics.radius * 1.5 * row,
    };
  }

  drawBattlefield(graphics, width, height) {
    graphics.clear();
    graphics.fillStyle(colorNumber(BATTLE_COLORS.background), 1);
    graphics.fillRect(0, 0, width, height);

    this.stars.forEach((star) => {
      graphics.fillStyle(0xeef6ff, star.alpha);
      graphics.fillCircle(star.x * width, star.y * height, star.radius);
    });

    const metrics = this.getCanvasMetrics(width, height);
    this.drawGrid(graphics, metrics);
    this.drawAsteroids(graphics, metrics);
    this.drawPowerups(graphics, metrics);
    this.drawShips(graphics, metrics);
    this.drawTorpedoAnimation(graphics, metrics);
  }

  drawGrid(graphics, metrics) {
    const active = this.getActivePlayer();
    const highlights = new Map();

    if (this.state.phase === "move") {
      const neighbor = this.getNeighbor(active.col, active.row, active.facing);
      if (this.isInBounds(neighbor.col, neighbor.row)) {
        const highlightColor = this.hasAsteroidAt(neighbor.col, neighbor.row)
          ? alphaColor(BATTLE_COLORS.blockedHighlight, 0.22)
          : alphaColor(BATTLE_COLORS.moveHighlight, 0.18);
        highlights.set(`${neighbor.col},${neighbor.row}`, highlightColor);
      }
    }

    for (let row = 0; row < BOARD_ROWS; row += 1) {
      for (let col = 0; col < BOARD_COLS; col += 1) {
        const center = this.hexCenter(col, row, metrics);
        const fill = highlights.get(`${col},${row}`) || alphaColor(BATTLE_COLORS.gridFill, 0.74);
        this.drawHex(graphics, center, metrics.radius - 0.35, fill.color, fill.alpha, colorNumber(BATTLE_COLORS.gridStroke), 0.22, 1);
      }
    }
  }

  drawAsteroids(graphics, metrics) {
    this.state.asteroids.forEach((asteroid) => {
      const center = this.hexCenter(asteroid.col, asteroid.row, metrics);
      const radius = metrics.radius;

      graphics.fillStyle(colorNumber(BATTLE_COLORS.asteroidShadow), 0.92);
      graphics.fillCircle(center.x - radius * 0.18, center.y + radius * 0.04, radius * 0.32);
      graphics.fillCircle(center.x + radius * 0.22, center.y - radius * 0.12, radius * 0.24);
      graphics.fillStyle(colorNumber(BATTLE_COLORS.asteroidBase), 0.96);
      graphics.fillCircle(center.x, center.y, radius * 0.38);
      graphics.fillCircle(center.x - radius * 0.24, center.y - radius * 0.16, radius * 0.2);
      graphics.fillCircle(center.x + radius * 0.28, center.y + radius * 0.14, radius * 0.16);
      graphics.fillStyle(colorNumber(BATTLE_COLORS.asteroidDust), 0.55);
      graphics.fillCircle(center.x - radius * 0.08, center.y - radius * 0.1, radius * 0.08);
    });
  }

  drawPowerups(graphics, metrics) {
    this.state.powerups.forEach((powerup) => {
      const center = this.hexCenter(powerup.col, powerup.row, metrics);
      const radius = metrics.radius;
      const outer = [
        new Phaser.Math.Vector2(center.x, center.y - radius * 0.46),
        new Phaser.Math.Vector2(center.x + radius * 0.28, center.y),
        new Phaser.Math.Vector2(center.x, center.y + radius * 0.46),
        new Phaser.Math.Vector2(center.x - radius * 0.28, center.y),
      ];
      const inner = [
        new Phaser.Math.Vector2(center.x, center.y - radius * 0.28),
        new Phaser.Math.Vector2(center.x + radius * 0.16, center.y),
        new Phaser.Math.Vector2(center.x, center.y + radius * 0.28),
        new Phaser.Math.Vector2(center.x - radius * 0.16, center.y),
      ];

      graphics.fillStyle(colorNumber(BATTLE_COLORS.powerupGlow), 0.18);
      graphics.fillCircle(center.x, center.y, radius * 0.52);
      graphics.fillStyle(colorNumber(BATTLE_COLORS.powerupCore), 0.92);
      graphics.fillPoints(outer, true);
      graphics.lineStyle(1.4, colorNumber(BATTLE_COLORS.powerupGlow), 0.85);
      graphics.strokePoints(outer, true);
      graphics.fillStyle(colorNumber(BATTLE_COLORS.hullOutline), 0.84);
      graphics.fillPoints(inner, true);
    });
  }

  drawHex(graphics, center, radius, fillColor, fillAlpha, strokeColor, strokeAlpha, lineWidth) {
    const points = [];

    for (let index = 0; index < 6; index += 1) {
      const angle = Phaser.Math.DegToRad(60 * index - 30);
      points.push(
        new Phaser.Math.Vector2(
          center.x + radius * Math.cos(angle),
          center.y + radius * Math.sin(angle)
        )
      );
    }

    graphics.fillStyle(fillColor, fillAlpha);
    graphics.fillPoints(points, true);
    graphics.lineStyle(lineWidth, strokeColor, strokeAlpha);
    graphics.strokePoints(points, true);
  }

  drawShips(graphics, metrics) {
    const [playerOne, playerTwo] = this.state.players;
    const overlapping = playerOne.col === playerTwo.col && playerOne.row === playerTwo.row;

    if (overlapping) {
      this.drawShip(graphics, playerOne, metrics, { x: -metrics.radius * 0.45, y: 0 });
      this.drawShip(graphics, playerTwo, metrics, { x: metrics.radius * 0.45, y: 0 });
      return;
    }

    this.state.players.forEach((ship) => this.drawShip(graphics, ship, metrics, { x: 0, y: 0 }));
  }

  drawShip(graphics, ship, metrics, overlapOffset) {
    const center = this.hexCenter(ship.col, ship.row, metrics);
    const cx = center.x + overlapOffset.x;
    const cy = center.y + overlapOffset.y;
    const radius = metrics.radius;

    if (ship.shieldsUp && ship.shield > 0) {
      graphics.lineStyle(2, colorNumber(BATTLE_COLORS.shieldRing), 0.55);
      graphics.strokeCircle(cx, cy, radius * 1.08);
    }

    if (ship.id === this.state.activeIndex && !this.state.gameOver) {
      graphics.lineStyle(2, colorNumber(BATTLE_COLORS.activeRing), 0.95);
      graphics.strokeCircle(cx, cy, radius * 1.38);
    }

    const outerPoints = this.getShipPoints(ship.shipClass, radius);
    const accentPoints = this.getShipAccentPoints(ship.shipClass, radius);
    const rotation = DIRECTION_ROTATIONS[ship.facing] || 0;
    const transformedOuter = this.transformPoints(outerPoints, cx, cy, rotation);
    const transformedAccent = this.transformPoints(accentPoints, cx, cy, rotation);

    graphics.fillStyle(colorNumber(ship.color), 1);
    graphics.fillPoints(transformedOuter, true);
    graphics.lineStyle(1.8, colorNumber(BATTLE_COLORS.hullOutline), 0.88);
    graphics.strokePoints(transformedOuter, true);

    graphics.fillStyle(colorNumber(ship.color), ship.accentAlpha);
    graphics.fillPoints(transformedAccent, true);

    graphics.fillStyle(0x031018, 1);
    graphics.fillCircle(cx, cy, Math.max(3, radius * 0.16));
  }

  getShipPoints(shipClass, radius) {
    if (shipClass === "bird") {
      return [
        { x: 0, y: -radius * 0.98 },
        { x: radius * 0.16, y: -radius * 0.5 },
        { x: radius * 0.96, y: -radius * 0.18 },
        { x: radius * 1.14, y: radius * 0.06 },
        { x: radius * 0.6, y: radius * 0.12 },
        { x: radius * 0.24, y: radius * 0.52 },
        { x: radius * 0.44, y: radius * 0.96 },
        { x: 0, y: radius * 0.7 },
        { x: -radius * 0.44, y: radius * 0.96 },
        { x: -radius * 0.24, y: radius * 0.52 },
        { x: -radius * 0.6, y: radius * 0.12 },
        { x: -radius * 1.14, y: radius * 0.06 },
        { x: -radius * 0.96, y: -radius * 0.18 },
        { x: -radius * 0.16, y: -radius * 0.5 },
      ];
    }

    return [
      { x: 0, y: -radius * 0.98 },
      { x: radius * 0.72, y: radius * 0.2 },
      { x: radius * 0.18, y: radius * 0.44 },
      { x: 0, y: radius * 0.82 },
      { x: -radius * 0.18, y: radius * 0.44 },
      { x: -radius * 0.72, y: radius * 0.2 },
    ];
  }

  getShipAccentPoints(shipClass, radius) {
    if (shipClass === "bird") {
      return [
        { x: 0, y: -radius * 0.8 },
        { x: radius * 0.14, y: -radius * 0.18 },
        { x: radius * 0.24, y: radius * 0.4 },
        { x: 0, y: radius * 0.54 },
        { x: -radius * 0.24, y: radius * 0.4 },
        { x: -radius * 0.14, y: -radius * 0.18 },
      ];
    }

    return [
      { x: 0, y: -radius * 0.54 },
      { x: radius * 0.18, y: 0 },
      { x: 0, y: radius * 0.42 },
      { x: -radius * 0.18, y: 0 },
    ];
  }

  transformPoints(points, centerX, centerY, rotation) {
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);

    return points.map((point) => new Phaser.Math.Vector2(
      centerX + point.x * cosine - point.y * sine,
      centerY + point.x * sine + point.y * cosine
    ));
  }

  getAnimationGeometry(animation, metrics) {
    const from = this.hexCenter(animation.from.col, animation.from.row, metrics);
    const target = this.hexCenter(animation.to.col, animation.to.row, metrics);
    const dx = target.x - from.x;
    const dy = target.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    const px = -uy;
    const py = ux;
    const impactsAtTarget = animation.hit || animation.blockedByAsteroid;
    const endPoint = impactsAtTarget
      ? target
      : {
          x: target.x + ux * metrics.radius * 1.5 + px * metrics.radius * 0.8 * animation.missSide,
          y: target.y + uy * metrics.radius * 1.5 + py * metrics.radius * 0.8 * animation.missSide,
        };
    const flightProgress = Phaser.Math.Clamp(animation.elapsed / animation.flightMs, 0, 1);
    const impactProgress = Phaser.Math.Clamp((animation.elapsed - animation.flightMs) / animation.impactMs, 0, 1);

    return {
      from,
      target,
      endPoint,
      current: {
        x: Phaser.Math.Linear(from.x, endPoint.x, flightProgress),
        y: Phaser.Math.Linear(from.y, endPoint.y, flightProgress),
      },
      flightProgress,
      impactProgress,
    };
  }

  drawTorpedoAnimation(graphics, metrics) {
    const animation = this.state.animation;

    if (!animation || animation.kind !== "torpedo") {
      return;
    }

    const geometry = this.getAnimationGeometry(animation, metrics);
    const trailColor = animation.boosted ? BATTLE_COLORS.boostedTorpedoTrail : BATTLE_COLORS.torpedoTrail;
    const coreColor = animation.boosted ? BATTLE_COLORS.boostedTorpedoCore : BATTLE_COLORS.torpedoCore;

    graphics.lineStyle(Math.max(3, metrics.radius * 0.22), colorNumber(trailColor), 0.36);
    graphics.beginPath();
    graphics.moveTo(geometry.from.x, geometry.from.y);
    graphics.lineTo(geometry.current.x, geometry.current.y);
    graphics.strokePath();

    graphics.fillStyle(colorNumber(coreColor), 1);
    graphics.fillCircle(geometry.current.x, geometry.current.y, Math.max(3, metrics.radius * 0.22));

    if (geometry.flightProgress >= 1) {
      const impactCenter = animation.hit ? geometry.target : geometry.endPoint;
      const flashAlpha = 1 - geometry.impactProgress;
      const burstRadius = metrics.radius * (0.45 + geometry.impactProgress * 1.6);
      const hitColor = animation.boosted ? BATTLE_COLORS.boostedImpactHit : BATTLE_COLORS.impactHit;

      graphics.lineStyle(
        Math.max(2, metrics.radius * 0.16),
        colorNumber(animation.hit ? hitColor : BATTLE_COLORS.impactMiss),
        flashAlpha
      );
      graphics.strokeCircle(impactCenter.x, impactCenter.y, burstRadius);

      graphics.fillStyle(
        colorNumber(animation.hit ? hitColor : BATTLE_COLORS.impactMiss),
        flashAlpha * (animation.hit ? 0.35 : 0.2)
      );
      graphics.fillCircle(
        impactCenter.x,
        impactCenter.y,
        metrics.radius * (0.3 + geometry.impactProgress * 0.9)
      );
    }
  }
}
