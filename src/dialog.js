import { execFileSync } from "node:child_process";

/**
 * Собранный exe работает без консоли, поэтому сообщение об ошибке запуска
 * иначе никто бы не увидел: окно просто не открылось бы, и всё.
 */
export function showError(message, title = "OLX Watcher") {
  if (process.platform !== "win32") return;

  const script =
    "Add-Type -AssemblyName System.Windows.Forms;" +
    "[System.Windows.Forms.MessageBox]::Show($env:OLX_MSG, $env:OLX_TITLE," +
    "[System.Windows.Forms.MessageBoxButtons]::OK," +
    "[System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null";

  try {
    execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      {
        // Текст передаём через окружение, а не в командную строку — так его
        // не надо экранировать и он не сломается на кавычках.
        env: { ...process.env, OLX_MSG: message, OLX_TITLE: title },
        timeout: 120000,
        windowsHide: true,
        stdio: "ignore",
      }
    );
  } catch {
    /* показать не вышло — не повод падать ещё и здесь */
  }
}
