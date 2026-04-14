import "./styles.css";
import { StarDuelApp } from "./game/star-duel-app.js";

const ui = {
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
