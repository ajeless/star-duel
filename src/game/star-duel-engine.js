import { COMMAND_TYPES } from "./star-duel-protocol.js";

export const BOARD_COLS = 33;
export const BOARD_ROWS = 33;
export const MOVE_RANGE = 3;

const MAX_ACTIONS = 2;
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

const SCENARIOS = {
  smoke: {
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
  },
};

function shuffle(array, random) {
  const copy = array.map((item) => ({ ...item }));

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

export class StarDuelEngine {
  constructor({ scenarioName = null, random = Math.random } = {}) {
    this.random = random;
    this.scenario = scenarioName ? SCENARIOS[scenarioName] ?? null : null;
    this.events = [];
    this.state = this.createInitialState();
  }

  getState() {
    return this.state;
  }

  getSnapshot() {
    return structuredClone(this.state);
  }

  replaceState(nextState) {
    this.events = [];
    this.state = structuredClone(nextState);
  }

  flushEvents() {
    const events = [...this.events];
    this.events = [];
    return events;
  }

  resetGame() {
    this.events = [];
    this.state = this.createInitialState();
  }

  applyCommand(command) {
    switch (command.type) {
      case COMMAND_TYPES.rotateLeft:
        this.rotateActiveShip(-1);
        return true;
      case COMMAND_TYPES.rotateRight:
        this.rotateActiveShip(1);
        return true;
      case COMMAND_TYPES.beginMove:
        this.beginMoveAction();
        return true;
      case COMMAND_TYPES.moveForward:
        this.moveShipForward();
        return true;
      case COMMAND_TYPES.endMove:
        this.endMoveAction();
        return true;
      case COMMAND_TYPES.toggleShields:
        this.toggleShields();
        return true;
      case COMMAND_TYPES.fireTorpedo:
        this.fireTorpedo();
        return true;
      case COMMAND_TYPES.endTurn:
        this.endTurnEarly();
        return true;
      case COMMAND_TYPES.resetBattle:
        this.resetGame();
        return true;
      default:
        return false;
    }
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

  endMoveAction() {
    const ship = this.getActivePlayer();

    if (!this.state.moveContext?.actionCommitted) {
      this.finishMoveMode(`${ship.label} canceled movement before committing an action.`);
      this.setStatus(`${ship.label} canceled movement.`);
      return;
    }

    this.finishMoveMode(`${ship.label} locked movement after ${this.state.moveContext.stepsTaken} hexes.`);
    this.setStatus(`${ship.label} ended movement.`);
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
    const hit = blocker ? false : this.random() * 100 < chance;
    const damageAmount = boosted
      ? Math.round(TORPEDO_DAMAGE * DAMAGE_POWERUP_MULTIPLIER)
      : TORPEDO_DAMAGE;

    if (blocker) {
      this.addLog(`${attacker.label} fired${boosted ? " a crystal-boosted torpedo" : ""}, but asteroid debris blocked the firing lane at ${this.coordinateText(blocker)}.`);
    } else {
      this.addLog(`${attacker.label} fired${boosted ? " a crystal-boosted torpedo" : ""} from ${distance} hexes with a ${chance}% hit chance.`);
    }

    this.beginTorpedoAnimation(attacker, defender, distance, chance, hit, {
      impactTile: blocker || {
        col: defender.col,
        row: defender.row,
      },
      blockedByAsteroid: Boolean(blocker),
    });
    this.state.animation.damageAmount = damageAmount;
    this.state.animation.boosted = boosted;
    this.events.push({
      type: "torpedo_launched",
      attackerId: attacker.id,
      boosted,
      blockedByAsteroid: Boolean(blocker),
    });
  }

  endTurnEarly() {
    this.endTurn("ended the turn early");
  }

  getActivePlayer() {
    return this.state.players[this.state.activeIndex];
  }

  getOpponent(index = this.state.activeIndex) {
    return this.state.players[index === 0 ? 1 : 0];
  }

  getHitChance(distance) {
    if (distance <= 0) {
      return 100;
    }

    return Math.max(0, 95 - (distance - 1) * 5);
  }

  getDistance(a, b) {
    const aCube = oddRToCube(a.col, a.row);
    const bCube = oddRToCube(b.col, b.row);

    return Math.max(
      Math.abs(aCube.x - bCube.x),
      Math.abs(aCube.y - bCube.y),
      Math.abs(aCube.z - bCube.z)
    );
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

  getAsteroidBlocker(attacker, defender) {
    const path = this.getHexLine(attacker, defender);

    for (const tile of path.slice(1, -1)) {
      if (this.hasAsteroidAt(tile.col, tile.row)) {
        return tile;
      }
    }

    return null;
  }

  coordinateText(target) {
    return `${String(target.col + 1).padStart(2, "0")} / ${String(target.row + 1).padStart(2, "0")}`;
  }

  createInitialState() {
    const startingIndex = this.scenario?.startingIndex ?? Math.floor(this.random() * PLAYER_CONFIG.length);
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
    const occupied = new Set(players.map((player) => tileKey(player.col, player.row)));

    if (this.scenario) {
      const asteroids = cloneTiles(this.scenario.asteroids, occupied);
      const powerups = cloneTiles(this.scenario.powerups, occupied);
      return { asteroids, powerups };
    }

    const asteroids = pickBoardTiles(ASTEROID_COORDINATE_POOL, ASTEROID_COUNT, occupied, this.random);
    const powerups = pickBoardTiles(POWERUP_COORDINATE_POOL, POWERUP_COUNT, occupied, this.random);
    return { asteroids, powerups };
  }

  getPowerupIndexAt(col, row) {
    return this.state.powerups.findIndex((powerup) => powerup.col === col && powerup.row === row);
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

  getHexLine(a, b) {
    const distance = this.getDistance(a, b);

    if (distance === 0) {
      return [{ col: a.col, row: a.row }];
    }

    const from = oddRToCube(a.col, a.row);
    const to = oddRToCube(b.col, b.row);
    const path = [];

    for (let step = 0; step <= distance; step += 1) {
      const t = distance === 0 ? 0 : step / distance;
      const cube = cubeRound(cubeLerp(from, to, t));
      path.push(cubeToOddR(cube));
    }

    return path;
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
    this.events.push({
      type: "code_red",
      playerId: ship.id,
    });
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
      missSide: this.random() < 0.5 ? -1 : 1,
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
      this.setStatus(`${attacker.label}'s ${animation.boosted ? "boosted " : ""}torpedo struck an asteroid at ${this.coordinateText(animation.to)}.`);
      this.addLog(`${attacker.label}'s ${animation.boosted ? "boosted " : ""}torpedo impacted asteroid debris at ${this.coordinateText(animation.to)}.`);
      this.events.push({
        type: "torpedo_impact",
        outcome: "asteroid",
        attackerId: attacker.id,
        defenderId: defender.id,
        boosted: animation.boosted,
      });
      return;
    }

    if (animation.hit) {
      const damage = this.applyDamage(defender, animation.damageAmount);
      animation.damage = damage;
      this.maybeTriggerCodeRed(defender);
      this.setStatus(`${attacker.label} scored a ${animation.boosted ? "boosted " : ""}hit. ${damage.absorbed} shield and ${damage.hullDamage} hull damage applied.`);
      this.addLog(`${attacker.label} hit ${defender.label} for ${animation.damageAmount} total damage${animation.boosted ? " with a crystal boost" : ""}.`);
      this.events.push({
        type: "torpedo_impact",
        outcome: "hit",
        attackerId: attacker.id,
        defenderId: defender.id,
        boosted: animation.boosted,
      });
      return;
    }

    this.setStatus(`${attacker.label} missed the ${animation.boosted ? "boosted " : ""}shot.`);
    this.addLog(`${attacker.label} missed${animation.boosted ? " with a crystal boost" : ""}.`);
    this.events.push({
      type: "torpedo_impact",
      outcome: "miss",
      attackerId: attacker.id,
      defenderId: defender.id,
      boosted: animation.boosted,
    });
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
}

function tileKey(col, row) {
  return `${col},${row}`;
}

function cloneTiles(pool, occupied) {
  const selected = [];

  for (const tile of pool) {
    const key = tileKey(tile.col, tile.row);

    if (occupied.has(key)) {
      continue;
    }

    occupied.add(key);
    selected.push({ ...tile });
  }

  return selected;
}

function pickBoardTiles(pool, count, occupied, random) {
  return cloneTiles(shuffle(pool, random).slice(0, count), occupied);
}

function oddRToCube(col, row) {
  const x = col - (row - (row & 1)) / 2;
  const z = row;
  const y = -x - z;
  return { x, y, z };
}

function cubeToOddR(cube) {
  return {
    col: cube.x + (cube.z - (cube.z & 1)) / 2,
    row: cube.z,
  };
}

function cubeLerp(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

function cubeRound(cube) {
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
