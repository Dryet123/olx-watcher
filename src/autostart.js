import { execFile } from "node:child_process";
import { join } from "node:path";

import { IS_EXE, APP_DIR } from "./paths.js";

const RUN_KEY = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const ENTRY = "OLX Watcher";

/**
 * Автозапуск живёт в ветке реестра текущего пользователя — прав администратора
 * не нужно, на других пользователей машины не влияет, убирается тем же способом.
 */
function run(script, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      {
        // Значения передаём окружением, а не в строке команды: в пути к
        // приложению бывают пробелы и кавычки, экранировать их — лишний риск.
        env: { ...process.env, OLX_KEY: RUN_KEY, OLX_ENTRY: ENTRY, ...extraEnv },
        timeout: 20000,
        windowsHide: true,
      },
      (err, stdout) => (err ? reject(err) : resolve(String(stdout).trim()))
    );
  });
}

/** Команда, которую Windows выполнит при входе в систему. */
export function startupCommand() {
  // Флаг --startup гасит открытие браузера: при каждом включении компьютера
  // всплывающая вкладка раздражала бы.
  return IS_EXE
    ? `"${process.execPath}" --startup`
    : `"${process.execPath}" "${join(APP_DIR, "src", "main.js")}" --startup`;
}

export async function isEnabled() {
  if (process.platform !== "win32") return false;
  try {
    const out = await run(
      "$v = (Get-ItemProperty -Path $env:OLX_KEY -Name $env:OLX_ENTRY -ErrorAction SilentlyContinue)." +
      "$env:OLX_ENTRY; if ($v) { $v } else { '' }"
    );
    return out.length > 0;
  } catch {
    return false;
  }
}

export async function enable() {
  if (process.platform !== "win32") throw new Error("Автозапуск умеет только Windows.");
  await run(
    "if (-not (Test-Path $env:OLX_KEY)) { New-Item -Path $env:OLX_KEY -Force | Out-Null };" +
    "Set-ItemProperty -Path $env:OLX_KEY -Name $env:OLX_ENTRY -Value $env:OLX_CMD",
    { OLX_CMD: startupCommand() }
  );
}

export async function disable() {
  if (process.platform !== "win32") return;
  await run(
    "Remove-ItemProperty -Path $env:OLX_KEY -Name $env:OLX_ENTRY -ErrorAction SilentlyContinue"
  );
}

/**
 * Записанная команда может устареть — например, exe перенесли в другую папку.
 * Тогда автозапуск указывает в никуда, и починить это лучше молча.
 */
export async function refreshIfStale() {
  if (process.platform !== "win32") return;
  try {
    const current = await run(
      "$v = (Get-ItemProperty -Path $env:OLX_KEY -Name $env:OLX_ENTRY -ErrorAction SilentlyContinue)." +
      "$env:OLX_ENTRY; if ($v) { $v } else { '' }"
    );
    if (current && current !== startupCommand()) await enable();
  } catch {
    /* не критично: автозапуск просто останется прежним */
  }
}
