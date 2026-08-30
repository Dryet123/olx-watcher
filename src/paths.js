import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

/**
 * Приложение живёт в двух видах: как исходники (node src/main.js)
 * и как собранный .exe. Конфиг и состояние должны лежать рядом с тем,
 * что пользователь реально запустил.
 */
function detectSea() {
  // Сборщик подставляет сюда true — это надёжнее, чем угадывать в рантайме.
  if (typeof globalThis.__OLX_SEA__ !== "undefined") return Boolean(globalThis.__OLX_SEA__);
  try {
    const require = createRequire(import.meta.url);
    return require("node:sea").isSea();
  } catch {
    return false;
  }
}

function sourceRoot() {
  // Только для запуска из исходников. В сборке сюда не заходим: там IS_EXE
  // истинно и путь берётся от самого exe.
  try {
    return fileURLToPath(new URL("..", import.meta.url));
  } catch {
    return process.cwd();
  }
}

export const IS_EXE = detectSea();
export const APP_DIR = IS_EXE ? dirname(process.execPath) : sourceRoot();

export const CONFIG_PATH = join(APP_DIR, "config.json");
export const STATE_PATH = join(APP_DIR, "state.json");
export const FEED_PATH = join(APP_DIR, "feed.json");
