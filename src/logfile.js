import { appendFileSync, statSync, renameSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";

import { APP_DIR } from "./paths.js";

const LOG_PATH = join(APP_DIR, "olx-watcher.log");
const PREV_PATH = join(APP_DIR, "olx-watcher.prev.log");
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Журнал в интерфейсе живёт только в памяти и пропадает вместе с приложением.
 * Разобраться потом, почему в такой-то час ничего не пришло, без файла нельзя —
 * поэтому дублируем события на диск.
 */
function rotateIfBig() {
  try {
    if (!existsSync(LOG_PATH)) return;
    if (statSync(LOG_PATH).size < MAX_BYTES) return;
    if (existsSync(PREV_PATH)) unlinkSync(PREV_PATH);
    renameSync(LOG_PATH, PREV_PATH);
  } catch {
    /* не смогли повернуть — не повод терять само событие */
  }
}

const MARK = { info: " ", warn: "!", error: "X", muted: "." };

export function writeLog(entry) {
  try {
    rotateIfBig();
    const at = new Date(entry.at ?? Date.now());
    const stamp = at.toISOString().replace("T", " ").slice(0, 19);
    const mark = MARK[entry.level] ?? " ";
    appendFileSync(LOG_PATH, `${stamp} ${mark} ${entry.text}\n`, "utf8");
  } catch {
    /* диск может быть занят или недоступен — приложение из-за этого не падает */
  }
}

export function logPath() {
  return LOG_PATH;
}
