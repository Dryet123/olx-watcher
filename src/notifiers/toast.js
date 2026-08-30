import { execFile } from "node:child_process";
import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { headline, bodyLines } from "../format.js";

/**
 * Скрипт зашит в код, а не лежит файлом рядом — иначе .exe был бы неполным.
 * При первом уведомлении разворачиваем его во временную папку.
 */
const TOAST_PS1 = String.raw`
param(
  [Parameter(Mandatory=$true)][string]$Title,
  [Parameter(Mandatory=$true)][string]$Body,
  [string]$Url = "",
  [string]$AppId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
)
$ErrorActionPreference = 'Stop'
[void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
[void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime]

function Esc([string]$s) {
  if ($null -eq $s) { return "" }
  $s.Replace('&','&amp;').Replace('<','&lt;').Replace('>','&gt;').Replace('"','&quot;')
}

$launchAttr = ''
if ($Url -ne '') { $launchAttr = ' activationType="protocol" launch="' + (Esc $Url) + '"' }

$xml = @"
<toast$launchAttr duration="long">
  <visual>
    <binding template="ToastGeneric">
      <text>$(Esc $Title)</text>
      <text>$(Esc $Body)</text>
    </binding>
  </visual>
  <audio src="ms-winsoundevent:Notification.Default"/>
</toast>
"@

$doc = New-Object Windows.Data.Xml.Dom.XmlDocument
$doc.LoadXml($xml)
$toast = New-Object Windows.UI.Notifications.ToastNotification $doc
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($AppId).Show($toast)
`;

let scriptPath = null;

function ensureScript() {
  if (scriptPath && existsSync(scriptPath)) return scriptPath;
  const target = join(tmpdir(), "olx-watcher-toast.ps1");
  writeFileSync(target, TOAST_PS1, "utf8");
  scriptPath = target;
  return target;
}

/** Уведомление Windows. Клик по нему открывает объявление в браузере. */
export function notifyToast(ad, searchName) {
  if (process.platform !== "win32") return Promise.resolve();

  const title = `OLX · ${searchName}`;
  const body = `${headline(ad)}\n${bodyLines(ad).join(" · ")}`;

  return new Promise((resolve) => {
    let path;
    try {
      path = ensureScript();
    } catch (err) {
      console.warn(`⚠ Не удалось подготовить скрипт уведомлений: ${err.message}`);
      return resolve();
    }

    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", path,
       "-Title", title, "-Body", body, "-Url", ad.url ?? ""],
      { timeout: 15000, windowsHide: true },
      (err, _stdout, stderr) => {
        if (err) console.warn(`⚠ Не удалось показать уведомление Windows: ${stderr || err.message}`);
        resolve();
      }
    );
  });
}
