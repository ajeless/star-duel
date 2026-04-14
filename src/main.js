import "./styles.css";
import { StarDuelApp } from "./game/star-duel-app.js";

const ui = {
  shell: document.querySelector(".app-shell"),
  launchpad: document.getElementById("launchpad"),
  battleShell: document.getElementById("battle-shell"),
  modeSelectScreen: document.getElementById("screen-mode-select"),
  hostSetupScreen: document.getElementById("screen-host-setup"),
  joinSetupScreen: document.getElementById("screen-join-setup"),
  root: document.getElementById("game-root"),
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
  chooseLocalButton: document.getElementById("choose-local-button"),
  chooseHostButton: document.getElementById("choose-host-button"),
  chooseJoinButton: document.getElementById("choose-join-button"),
  hostServerUrlInput: document.getElementById("host-server-url-input"),
  hostStatusText: document.getElementById("host-status-text"),
  hostBackButton: document.getElementById("host-back-button"),
  hostCreateButton: document.getElementById("host-create-button"),
  joinInviteInput: document.getElementById("join-invite-input"),
  joinRoomIdInput: document.getElementById("join-room-id-input"),
  joinServerUrlInput: document.getElementById("join-server-url-input"),
  joinStatusText: document.getElementById("join-status-text"),
  joinBackButton: document.getElementById("join-back-button"),
  joinMatchButton: document.getElementById("join-match-button"),
  copyInviteButton: document.getElementById("copy-invite-button"),
  changeModeButton: document.getElementById("change-mode-button"),
  sessionModeChip: document.getElementById("session-mode-chip"),
  networkRoomChip: document.getElementById("network-room-chip"),
  networkSeatChip: document.getElementById("network-seat-chip"),
  networkPresenceChip: document.getElementById("network-presence-chip"),
  networkStatusText: document.getElementById("network-status-text"),
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
      boost: document.getElementById("player-1-boost"),
      actions: document.getElementById("player-1-actions"),
      range: document.getElementById("player-1-range"),
      hitChance: document.getElementById("player-1-hit-chance"),
      position: document.getElementById("player-1-position"),
    },
    {
      hull: document.getElementById("player-2-hull"),
      shield: document.getElementById("player-2-shield"),
      shieldState: document.getElementById("player-2-shield-state"),
      torpedoes: document.getElementById("player-2-torpedoes"),
      boost: document.getElementById("player-2-boost"),
      actions: document.getElementById("player-2-actions"),
      range: document.getElementById("player-2-range"),
      hitChance: document.getElementById("player-2-hit-chance"),
      position: document.getElementById("player-2-position"),
    },
  ],
};

const app = new StarDuelApp(ui);

ui.resetButton.addEventListener("click", () => {
  app.resetGame();
});

ui.chooseLocalButton.addEventListener("click", () => {
  app.startLocalBattle();
});

ui.chooseHostButton.addEventListener("click", () => {
  app.showHostSetup();
});

ui.chooseJoinButton.addEventListener("click", () => {
  app.showJoinSetup();
});

ui.hostBackButton.addEventListener("click", () => {
  app.showModeSelect();
});

ui.hostCreateButton.addEventListener("click", () => {
  app.hostOnlineMatch();
});

ui.joinBackButton.addEventListener("click", () => {
  app.showModeSelect();
});

ui.joinMatchButton.addEventListener("click", () => {
  app.joinOnlineMatch();
});

ui.copyInviteButton.addEventListener("click", () => {
  app.copyInviteLink();
});

ui.changeModeButton.addEventListener("click", () => {
  app.showModeSelect();
});
