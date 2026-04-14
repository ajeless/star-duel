import Phaser from "phaser";
import startAlertUrl from "../../assets/sounds/start_red_alert.mp3";
import explosionUrl from "../../assets/sounds/explosion.mp3";
import codeRedUrl from "../../assets/sounds/code_red_31.mp3";
import torpedoAwayUrl from "../../assets/sounds/torpedo_away.mp3";
import {
  BOARD_COLS,
  BOARD_ROWS,
  StarDuelEngine,
} from "./star-duel-engine.js";
import {
  COMMAND_TYPES,
  createCommand,
} from "./star-duel-protocol.js";
import { StarDuelOnlineClient } from "../network/star-duel-online-client.js";
import {
  startCloudflareQuickTunnel,
  stopCloudflareQuickTunnel,
} from "../network/local-hosting-client.js";

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

const DIRECTION_ROTATIONS = {
  nw: -Math.PI / 6,
  ne: Math.PI / 6,
  e: Math.PI / 2,
  w: -Math.PI / 2,
  sw: (-5 * Math.PI) / 6,
  se: (5 * Math.PI) / 6,
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
    this.engine = new StarDuelEngine({ scenarioName: this.readScenarioName() });
    this.state = this.engine.getState();
    this.sessionMode = "local";
    this.screen = "mode-select";
    this.onlineClient = null;
    this.onlineUnsubscribers = [];
    this.onlineState = this.createOnlineState();
    this.codeRedAudio = null;
    this.pendingOpeningAlert = false;
    this.boundKeydown = this.handleKeydown.bind(this);
    this.boundResize = this.handleResize.bind(this);
    this.boundPointer = this.flushPendingOpeningAlert.bind(this);
    this.stars = this.createStarfield();

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

    this.initializeLaunchpad();
    this.updateViewUi();
  }

  attachScene(scene) {
    this.scene = scene;
    this.handleResize();
    this.resetGame();
  }

  readScenarioName() {
    if (typeof window === "undefined") {
      return null;
    }

    const params = new URLSearchParams(window.location.search);
    return params.get("scenario");
  }

  defaultServerUrl() {
    if (typeof window === "undefined") {
      return "http://127.0.0.1:2567";
    }

    return `${window.location.protocol}//${window.location.hostname}:2567`;
  }

  defaultPublicAppUrl() {
    if (typeof window === "undefined") {
      return "http://127.0.0.1:4173";
    }

    return window.location.origin;
  }

  createOnlineState(patch = {}) {
    return {
      connecting: false,
      connected: false,
      roomId: "",
      seatIndex: null,
      role: null,
      players: [],
      status: "Local hot-seat battle live. Use Change Mode to pick a different command path.",
      serverUrl: this.defaultServerUrl(),
      publicAppUrl: this.defaultPublicAppUrl(),
      publicServerUrl: this.defaultServerUrl(),
      inviteLink: "",
      hostingProvider: null,
      hostedByThisClient: false,
      ...patch,
    };
  }

  initializeLaunchpad() {
    this.ui.hostServerUrlInput.value = this.onlineState.serverUrl;
    this.ui.joinServerUrlInput.value = this.onlineState.serverUrl;

    const invite = this.readInviteParams();
    if (invite.roomId || invite.serverUrl) {
      this.ui.joinInviteInput.value = invite.inviteLink;
      this.ui.joinRoomIdInput.value = invite.roomId;
      this.ui.joinServerUrlInput.value = invite.serverUrl || this.defaultServerUrl();
      this.screen = "join-setup";
      this.onlineState.status = invite.roomId
        ? `Invite detected for room ${invite.roomId}. Join when ready.`
        : "Invite detected. Verify the room details, then join when ready.";
    }
  }

  readInviteParams() {
    if (typeof window === "undefined") {
      return { roomId: "", serverUrl: "", inviteLink: "" };
    }

    const currentUrl = new URL(window.location.href);
    const roomId = currentUrl.searchParams.get("room")?.trim() || "";
    const serverUrl = currentUrl.searchParams.get("server")?.trim() || "";

    return {
      roomId,
      serverUrl,
      inviteLink: roomId || serverUrl ? currentUrl.toString() : "",
    };
  }

  isOnlineMode() {
    return this.sessionMode === "online";
  }

  isOnlineConnected() {
    return this.isOnlineMode() && this.onlineState.connected && this.onlineClient;
  }

  getPerspectivePlayerIndex() {
    return this.isOnlineConnected() && Number.isInteger(this.onlineState.seatIndex)
      ? this.onlineState.seatIndex
      : null;
  }

  getBoardPerspectiveOffset() {
    return this.getPerspectivePlayerIndex() === 1 ? Math.PI : 0;
  }

  projectCoordinate(col, row) {
    if (this.getPerspectivePlayerIndex() !== 1) {
      return { col, row };
    }

    return {
      col: BOARD_COLS - 1 - col,
      row: BOARD_ROWS - 1 - row,
    };
  }

  isBattleView() {
    return this.screen === "battle";
  }

  getConnectedPlayerCount() {
    return this.onlineState.players.filter((player) => player.connected).length;
  }

  getSeatLabel(fallback = "Seat: pending") {
    if (!Number.isInteger(this.onlineState.seatIndex)) {
      return fallback;
    }

    return this.onlineState.seatIndex === 0 ? "Seat: Player 1" : "Seat: Player 2";
  }

  updateNetworkState(patch) {
    this.onlineState = {
      ...this.onlineState,
      ...patch,
    };
    this.syncOnlineScreenState();
    this.updateViewUi();
  }

  updateViewUi() {
    const isOnline = this.isOnlineMode();
    const connectedCount = this.getConnectedPlayerCount();
    const isBattleView = this.isBattleView();

    this.ui.launchpad.hidden = isBattleView;
    this.ui.battleShell.hidden = !isBattleView;

    this.ui.modeSelectScreen.hidden = this.screen !== "mode-select";
    this.ui.hostSetupScreen.hidden = this.screen !== "host-setup";
    this.ui.joinSetupScreen.hidden = this.screen !== "join-setup";

    this.ui.sessionModeChip.textContent = isOnline ? "Online Session" : "Local Hot-Seat";
    this.ui.networkRoomChip.textContent = isOnline && this.onlineState.roomId
      ? `Room: ${this.onlineState.roomId}`
      : "Room: local";
    this.ui.networkSeatChip.textContent = isOnline
      ? this.getSeatLabel("Seat: pending")
      : "Seat: shared bridge";
    this.ui.networkPresenceChip.textContent = isOnline
      ? `Crew: ${connectedCount}/2 connected`
      : "Crew: 2 local captains";
    this.ui.networkStatusText.textContent = isOnline
      ? this.onlineState.status
      : "Local hot-seat battle live. Use Change Mode to pick a different command path.";

    this.ui.hostStatusText.textContent = this.screen === "host-setup"
      ? this.onlineState.status
      : "Hosting will generate and copy a temporary Cloudflare invite link.";
    this.ui.joinStatusText.textContent = this.screen === "join-setup"
      ? this.onlineState.status
      : "Paste a valid invite link to join the duel.";

    this.ui.copyInviteButton.hidden = !isOnline || !this.onlineState.inviteLink;
    this.ui.copyInviteButton.disabled = !this.onlineState.inviteLink;

    this.ui.shell.classList.remove("app-shell--online-seat-0", "app-shell--online-seat-1");

    if (this.getPerspectivePlayerIndex() === 0) {
      this.ui.shell.classList.add("app-shell--online-seat-0");
    } else if (this.getPerspectivePlayerIndex() === 1) {
      this.ui.shell.classList.add("app-shell--online-seat-1");
    }

    if (isBattleView) {
      this.handleResize();
    }
  }

  syncOnlineScreenState() {
    if (!this.isOnlineMode()) {
      return;
    }

    if (this.onlineState.connected && this.screen !== "battle") {
      this.screen = "battle";
    }
  }

  seedFieldValue(input, value) {
    if (!input.value.trim()) {
      input.value = value;
    }
  }

  async showModeSelect() {
    await this.disconnectOnlineSession();
    this.sessionMode = "local";
    this.screen = "mode-select";
    this.onlineState = this.createOnlineState({
      status: "Choose a command path before bringing the battle UI online.",
    });
    this.updateViewUi();
  }

  async startLocalBattle() {
    await this.disconnectOnlineSession();
    this.sessionMode = "local";
    this.screen = "battle";
    this.onlineState = this.createOnlineState();
    this.updateViewUi();
    this.resetGame();
  }

  showHostSetup() {
    this.screen = "host-setup";
    this.seedFieldValue(this.ui.hostServerUrlInput, this.defaultServerUrl());
    this.onlineState = this.createOnlineState({
      status: "Host Match will request temporary Cloudflare Quick Tunnel links from the local server.",
    });
    this.updateViewUi();
  }

  showJoinSetup() {
    this.screen = "join-setup";
    this.seedFieldValue(this.ui.joinServerUrlInput, this.defaultServerUrl());
    this.onlineState = this.createOnlineState({
      status: "Paste the invite link your host shared with you.",
    });
    this.updateViewUi();
  }

  validateUrlInput(rawValue, label) {
    const value = rawValue.trim();

    try {
      return new URL(value).toString();
    } catch {
      throw new Error(`${label} must be a full URL, including protocol and port.`);
    }
  }

  getHostSetupValues() {
    return {
      localServerUrl: this.validateUrlInput(
        this.ui.hostServerUrlInput.value || this.defaultServerUrl(),
        "Local Server URL"
      ),
      clientTargetUrl: this.defaultPublicAppUrl(),
    };
  }

  getJoinSetupValues() {
    const inviteLink = this.ui.joinInviteInput.value.trim();
    let roomId = this.ui.joinRoomIdInput.value.trim();
    let serverUrl = this.ui.joinServerUrlInput.value.trim() || this.defaultServerUrl();

    if (inviteLink) {
      try {
        const inviteUrl = new URL(inviteLink);
        roomId = inviteUrl.searchParams.get("room")?.trim() || roomId;
        serverUrl = inviteUrl.searchParams.get("server")?.trim() || serverUrl;
      } catch {
        if (!roomId && !inviteLink.includes("://") && !inviteLink.includes("/")) {
          roomId = inviteLink;
        }
      }
    }

    if (!roomId) {
      throw new Error("Enter a room code or paste a valid invite link.");
    }

    return {
      inviteLink,
      roomId,
      serverUrl: this.validateUrlInput(serverUrl, "Server URL"),
    };
  }

  buildInviteLink(roomId, publicBaseUrl, publicServerUrl) {
    const inviteUrl = new URL(publicBaseUrl);
    inviteUrl.searchParams.set("mode", "join");
    inviteUrl.searchParams.set("room", roomId);
    inviteUrl.searchParams.set("server", publicServerUrl);
    return inviteUrl.toString();
  }

  async tryCopyText(text) {
    if (!text || !navigator.clipboard?.writeText) {
      return false;
    }

    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  async copyInviteLink() {
    if (!this.onlineState.inviteLink) {
      return;
    }

    const copied = await this.tryCopyText(this.onlineState.inviteLink);
    if (copied) {
      this.updateNetworkState({
        status: "Invite link copied to clipboard.",
      });
      return;
    }

    this.updateNetworkState({
      status: "Clipboard access is unavailable in this browser. Copy the invite link manually from the top bar.",
    });
  }

  async stopHostedAccess() {
    if (this.onlineState.hostingProvider !== "cloudflare-quick" || !this.onlineState.hostedByThisClient) {
      return;
    }

    try {
      await stopCloudflareQuickTunnel({
        serverUrl: this.onlineState.serverUrl || this.defaultServerUrl(),
      });
    } catch {}
  }

  async hostOnlineMatch() {
    let setup;

    try {
      setup = this.getHostSetupValues();
    } catch (error) {
      this.onlineState = this.createOnlineState({
        status: error.message,
      });
      this.screen = "host-setup";
      this.updateViewUi();
      return;
    }

    let hostedAccess;

    try {
      this.onlineState = this.createOnlineState({
        status: "Requesting Cloudflare Quick Tunnel links from the local server...",
      });
      this.screen = "host-setup";
      this.updateViewUi();

      hostedAccess = await startCloudflareQuickTunnel({
        serverUrl: setup.localServerUrl,
        clientTargetUrl: setup.clientTargetUrl,
        serverTargetUrl: setup.localServerUrl,
      });
    } catch (error) {
      this.onlineState = this.createOnlineState({
        status: `Unable to prepare Cloudflare Quick Tunnel hosting: ${error.message}`,
      });
      this.screen = "host-setup";
      this.updateViewUi();
      return;
    }

    await this.connectOnline({
      modeLabel: "hosting",
      serverUrl: setup.localServerUrl,
      connect: (client) => client.hostMatch(),
      successStatus: (roomId) => `Room ${roomId} is live. Waiting for the opposing captain to join.`,
      successScreen: "battle",
      screenOnFailure: "host-setup",
      extraState: {
        publicAppUrl: hostedAccess.publicAppUrl,
        publicServerUrl: hostedAccess.publicServerUrl,
        hostingProvider: "cloudflare-quick",
        hostedByThisClient: true,
      },
      onSuccess: async (roomId) => {
        const inviteLink = this.buildInviteLink(roomId, hostedAccess.publicAppUrl, hostedAccess.publicServerUrl);
        const copied = await this.tryCopyText(inviteLink);
        this.updateNetworkState({
          inviteLink,
          publicAppUrl: hostedAccess.publicAppUrl,
          publicServerUrl: hostedAccess.publicServerUrl,
          status: copied
            ? `Invite copied. Room ${roomId} is waiting for the opposing captain.`
            : `Room ${roomId} is live. Copy the invite link from the top bar and send it to your challenger.`,
        });
      },
    });
  }

  async joinOnlineMatch() {
    let setup;

    try {
      setup = this.getJoinSetupValues();
    } catch (error) {
      this.onlineState = this.createOnlineState({
        status: error.message,
      });
      this.screen = "join-setup";
      this.updateViewUi();
      return;
    }

    await this.connectOnline({
      modeLabel: "joining",
      serverUrl: setup.serverUrl,
      connect: (client) => client.joinMatch(setup.roomId),
      successStatus: (joinedRoomId) => `Joined room ${joinedRoomId}. Stand by while the host bridge finishes sync.`,
      successScreen: "battle",
      screenOnFailure: "join-setup",
      extraState: {
        serverUrl: setup.serverUrl,
        publicServerUrl: setup.serverUrl,
        inviteLink: setup.inviteLink,
        hostingProvider: null,
        hostedByThisClient: false,
      },
      onSuccess: () => {
        this.ui.joinRoomIdInput.value = setup.roomId;
        this.ui.joinServerUrlInput.value = setup.serverUrl;
      },
    });
  }

  async connectOnline({ modeLabel, serverUrl, connect, successStatus, successScreen, screenOnFailure, extraState = {}, onSuccess = null }) {
    await this.disconnectOnlineSession();

    const client = new StarDuelOnlineClient({ serverUrl });

    this.onlineClient = client;
    this.sessionMode = "online";
    this.screen = successScreen;
    this.bindOnlineClient(client);
    this.onlineState = this.createOnlineState({
      connecting: true,
      connected: false,
      serverUrl,
      ...extraState,
      status: `${modeLabel === "hosting" ? "Hosting" : "Joining"} online session via ${serverUrl}...`,
    });
    this.updateViewUi();

    try {
      const roomId = await connect(client);
      this.screen = successScreen;
      this.updateNetworkState({
        connecting: false,
        connected: true,
        roomId,
        status: successStatus(roomId),
      });
      if (typeof onSuccess === "function") {
        onSuccess(roomId);
      }
    } catch (error) {
      await this.disconnectOnlineSession();
      this.sessionMode = "local";
      this.screen = screenOnFailure;
      this.onlineState = this.createOnlineState({
        serverUrl,
        ...extraState,
        status: `Unable to ${modeLabel} online session: ${error.message}`,
      });
      this.updateViewUi();
    }
  }

  bindOnlineClient(client) {
    this.onlineUnsubscribers = [
      client.on("snapshot", (payload) => {
        this.applyRemoteSnapshot(payload);
      }),
      client.on("presence", (payload) => {
        const previousCount = this.getConnectedPlayerCount();
        const players = payload.players ?? [];
        const connectedCount = players.filter((player) => player.connected).length;
        this.updateNetworkState({
          players,
          status: connectedCount >= 2
            ? "Both captains connected. Online battle live."
            : this.onlineState.role === "player1"
              ? `Room ${this.onlineState.roomId || "pending"} is open. Waiting for the opposing captain to dock.`
              : `Connected to room ${this.onlineState.roomId || "pending"}. Waiting for the host bridge to come online.`,
        });
        if (previousCount < 2 && connectedCount >= 2) {
          this.requestOpeningAlert();
        }
      }),
      client.on("roomInfo", (payload) => {
        this.updateNetworkState({
          roomId: payload.roomId,
          seatIndex: payload.seatIndex,
          role: payload.role,
          status: `Connected to room ${payload.roomId} as ${payload.role === "player1" ? "Player 1" : "Player 2"}. Waiting for full crew readiness.`,
        });
      }),
      client.on("serverEvents", (payload) => {
        this.applyRemoteEvents(payload);
      }),
      client.on("roomError", (payload) => {
        this.updateNetworkState({
          status: payload.message,
        });
      }),
      client.on("leave", () => {
        if (this.isOnlineMode()) {
          this.updateNetworkState({
            connected: false,
            players: [],
            status: "Disconnected from the online room. Choose a mode to reconnect or return to local hot-seat.",
          });
        }
      }),
    ];
  }

  async disconnectOnlineSession() {
    const client = this.onlineClient;
    const hostedAccessWasActive = this.onlineState.hostedByThisClient;

    this.onlineUnsubscribers.forEach((unsubscribe) => unsubscribe());
    this.onlineUnsubscribers = [];
    this.onlineClient = null;

    if (client) {
      try {
        await client.leaveMatch();
      } catch {}
    }

    if (hostedAccessWasActive) {
      await this.stopHostedAccess();
    }
  }

  syncState() {
    this.state = this.engine.getState();
  }

  resetGame() {
    if (this.isOnlineConnected()) {
      this.issueOnlineCommand(COMMAND_TYPES.resetBattle);
      return;
    }

    this.engine.resetGame();
    this.syncState();
    this.renderUi();
    this.requestOpeningAlert();
  }

  tick(delta) {
    if (!this.isOnlineMode()) {
      this.engine.tick(delta);
      this.syncState();
      this.processEngineEvents();
    }
    this.renderUi();
  }

  processEngineEvents() {
    this.processGameplayEvents(this.engine.flushEvents());
  }

  processGameplayEvents(events) {
    events.forEach((event) => {
      switch (event.type) {
        case "torpedo_launched":
          this.playTorpedoLaunchSound();
          break;
        case "torpedo_impact":
          if (event.outcome === "hit" || event.outcome === "asteroid") {
            this.playSound(SOUND_KEYS.explosion);
          }
          break;
        case "code_red":
          this.playCodeRedSound();
          break;
        default:
          break;
      }
    });
  }

  applyRemoteSnapshot(snapshot) {
    if (!snapshot?.state) {
      return;
    }

    this.engine.replaceState(snapshot.state);
    this.syncState();
    this.updateNetworkState({
      roomId: snapshot.roomId ?? this.onlineState.roomId,
      players: snapshot.players ?? this.onlineState.players,
    });
    this.renderUi();
  }

  applyRemoteEvents(payload) {
    this.processGameplayEvents(payload?.events ?? []);
  }

  issueCommand(commandType, payload = {}) {
    if (this.isOnlineMode()) {
      this.issueOnlineCommand(commandType, payload);
      return;
    }

    this.issueLocalCommand(commandType, payload);
  }

  issueLocalCommand(commandType, payload = {}) {
    this.engine.applyCommand(createCommand(commandType, payload));
    this.syncState();
    this.processEngineEvents();
  }

  issueOnlineCommand(commandType, payload = {}) {
    if (!this.isOnlineConnected()) {
      this.updateNetworkState({
        status: "Connect to an online room before issuing commands.",
      });
      return;
    }

    try {
      this.onlineClient.sendCommand(createCommand(commandType, payload));
    } catch (error) {
      this.updateNetworkState({
        status: `Unable to send command: ${error.message}`,
      });
    }
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
    if (!this.isBattleView()) {
      return;
    }

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
      this.issueCommand(COMMAND_TYPES.rotateLeft);
      return true;
    }

    if (key === "arrowright") {
      this.issueCommand(COMMAND_TYPES.rotateRight);
      return true;
    }

    if (key === "arrowup") {
      this.issueCommand(COMMAND_TYPES.moveForward);
      return true;
    }

    if (key === "arrowdown") {
      this.issueCommand(COMMAND_TYPES.endMove);
      return true;
    }

    return false;
  }

  handleCommandKey(key) {
    switch (key) {
      case "arrowleft":
        this.issueCommand(COMMAND_TYPES.rotateLeft);
        return true;
      case "arrowright":
        this.issueCommand(COMMAND_TYPES.rotateRight);
        return true;
      case "m":
        this.issueCommand(COMMAND_TYPES.beginMove);
        return true;
      case "s":
        this.issueCommand(COMMAND_TYPES.toggleShields);
        return true;
      case "f":
        this.issueCommand(COMMAND_TYPES.fireTorpedo);
        return true;
      case "e":
        this.issueCommand(COMMAND_TYPES.endTurn);
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
    return this.engine.getActivePlayer();
  }

  getOpponent(index = this.state.activeIndex) {
    return this.engine.getOpponent(index);
  }

  getDistance(a, b) {
    return this.engine.getDistance(a, b);
  }

  getNeighbor(col, row, direction) {
    return this.engine.getNeighbor(col, row, direction);
  }

  hasAsteroidAt(col, row) {
    return this.engine.hasAsteroidAt(col, row);
  }

  getAsteroidBlocker(attacker, defender) {
    return this.engine.getAsteroidBlocker(attacker, defender);
  }

  coordinateText(target) {
    return this.engine.coordinateText(target);
  }

  renderUi() {
    const active = this.getActivePlayer();
    const perspectivePlayerIndex = this.getPerspectivePlayerIndex();
    const isPerspectiveTurn = perspectivePlayerIndex === null || perspectivePlayerIndex === this.state.activeIndex;
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
            : this.isOnlineMode()
              ? isPerspectiveTurn
                ? `${active.actionsLeft} action${active.actionsLeft === 1 ? "" : "s"} remaining on your bridge.`
                : "Enemy bridge has initiative. Stand by for their maneuver."
              : `${active.actionsLeft} action${active.actionsLeft === 1 ? "" : "s"} remaining. Pass the keyboard when the turn ends.`;

    this.ui.turnBanner.classList.remove("turn-banner--player-0", "turn-banner--player-1");
    this.ui.turnBanner.classList.add(`turn-banner--player-${bannerPlayerIndex}`);
    this.ui.turnBannerLabel.textContent = label;
    this.ui.turnBannerPlayer.textContent = playerText;
    this.ui.turnBannerPlayer.style.color = this.state.players[bannerPlayerIndex].color;
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
      const hitChance = this.engine.getHitChance(range);
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
    const projected = this.projectCoordinate(col, row);

    return {
      x: metrics.offsetX + Math.sqrt(3) * metrics.radius * (projected.col + 0.5 * (projected.row & 1)),
      y: metrics.offsetY + metrics.radius * 1.5 * projected.row,
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
      if (this.engine.isInBounds(neighbor.col, neighbor.row)) {
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
    const rotation = (DIRECTION_ROTATIONS[ship.facing] || 0) + this.getBoardPerspectiveOffset();
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
