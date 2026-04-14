import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const baseUrl = process.env.STAR_DUEL_URL || "http://127.0.0.1:4173/";
const smokeUrl = new URL(baseUrl);
smokeUrl.searchParams.set("scenario", "smoke");
const targetUrl = smokeUrl.toString();
const screenshotPath = resolve(".artifacts", "browser-smoke.png");

mkdirSync(resolve(".artifacts"), { recursive: true });

const executablePath = findChromeExecutable();

if (!executablePath) {
  console.error("Unable to find a Chrome executable. Set CHROME_EXECUTABLE_PATH to override.");
  process.exit(1);
}

const browser = await chromium.launch({
  headless: true,
  executablePath,
});

const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
const pageErrors = [];
const consoleErrors = [];

page.on("pageerror", (error) => {
  pageErrors.push(error.message);
});

page.on("console", (message) => {
  if (message.type() === "error") {
    consoleErrors.push(message.text());
  }
});

try {
  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#game-root canvas");
  await page.waitForTimeout(400);

  await page.click("#game-root");

  await page.keyboard.press("m");
  await expectStatusContains(page, "plotting movement");

  await page.keyboard.press("ArrowUp");
  await expectStatusContains(page, "moved");

  await page.keyboard.press("ArrowUp");
  await expectStatusContains(page, "collected a crystal powerup");
  await page.waitForFunction(() => {
    const activeHud = document.querySelector(".hud.active");
    const boostValue = activeHud?.querySelector("[id$='-boost']")?.textContent || "";
    return boostValue.trim() === "1";
  });

  await page.keyboard.press("ArrowUp");
  await expectStatusContains(page, "Asteroid debris blocks the plotted course.");

  await page.keyboard.press("ArrowDown");
  await expectStatusContains(page, "ended movement");

  await page.keyboard.press("f");
  await page.waitForFunction(() => {
    const text = document.querySelector("#status-text")?.textContent || "";
    return text.includes("struck an asteroid");
  });
  await page.waitForFunction(() => {
    const firstLog = document.querySelector("#log-list li")?.textContent || "";
    return firstLog.includes("impacted asteroid debris");
  });
  await page.waitForFunction(() => {
    const activeHud = document.querySelector(".hud.active");
    const boostValue = activeHud?.querySelector("[id$='-boost']")?.textContent || "";
    const hitChance = activeHud?.querySelector("[id$='-hit-chance']")?.textContent || "";
    return boostValue.trim() === "0" && hitChance.includes("BLOCKED");
  });

  await page.screenshot({ path: screenshotPath, fullPage: true });

  if (pageErrors.length > 0 || consoleErrors.length > 0) {
    throw new Error(
      [
        ...pageErrors.map((error) => `Page error: ${error}`),
        ...consoleErrors.map((error) => `Console error: ${error}`),
      ].join("\n")
    );
  }

  console.log(`Browser smoke test passed against ${targetUrl}`);
  console.log(`Screenshot: ${screenshotPath}`);
} finally {
  await browser.close();
}

async function expectStatusContains(page, expectedText) {
  await page.waitForFunction((text) => {
    const status = document.querySelector("#status-text")?.textContent || "";
    return status.includes(text);
  }, expectedText);
}

function findChromeExecutable() {
  if (process.env.CHROME_EXECUTABLE_PATH) {
    return process.env.CHROME_EXECUTABLE_PATH;
  }

  const candidates = {
    linux: [
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium-browser",
      "/usr/bin/chromium",
    ],
    darwin: [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ],
    win32: [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      `${process.env.LOCALAPPDATA || ""}\\Google\\Chrome\\Application\\chrome.exe`,
    ],
  };

  for (const candidate of candidates[process.platform] || []) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}
