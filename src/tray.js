import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Значок в области уведомлений. Отдельным процессом PowerShell, потому что
 * из Node до Shell_NotifyIcon не дотянуться без сторонних модулей, а держать
 * приложение без зависимостей важнее.
 *
 * Меню общается с приложением через его же локальный HTTP API.
 */
const TRAY_PS1 = String.raw`
param(
  [Parameter(Mandatory=$true)][int]$Port,
  [string]$ExePath = "",
  [string]$InstanceId = ""
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$script:Base = "http://127.0.0.1:$Port"

function Invoke-App([string]$Path) {
  # Без переносов через обратную кавычку: она закрыла бы JS-шаблон, в котором
  # этот скрипт лежит.
  try {
    Invoke-RestMethod -Uri ($script:Base + $Path) -Method Post -Body '{}' -ContentType 'application/json' -TimeoutSec 10 | Out-Null
  } catch { }
}

$icon = $null
if ($ExePath -and (Test-Path -LiteralPath $ExePath)) {
  try { $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($ExePath) } catch { }
}
if ($null -eq $icon) { $icon = [System.Drawing.SystemIcons]::Application }

$script:Notify = New-Object System.Windows.Forms.NotifyIcon
$script:Notify.Icon = $icon
$script:Notify.Text = "OLX Watcher"
$script:Notify.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip

$itemOpen = $menu.Items.Add("Открыть OLX Watcher")
$itemOpen.add_Click({ Start-Process $script:Base })

$itemCheck = $menu.Items.Add("Проверить сейчас")
$itemCheck.add_Click({ Invoke-App "/api/check" })

[void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))

$itemExit = $menu.Items.Add("Выход")
$itemExit.add_Click({
  Invoke-App "/api/quit"
  $script:Notify.Visible = $false
  [System.Windows.Forms.Application]::Exit()
})

$script:Notify.ContextMenuStrip = $menu
$script:Notify.add_MouseDoubleClick({ Start-Process $script:Base })

# Если приложение упало или его сняли из диспетчера задач, значок не должен
# остаться висеть сиротой. Проверяем не номер процесса, а само приложение:
# номера Windows переиспользует, и сторож принял бы за родителя чужую программу.
$script:Instance = $InstanceId
$script:Misses = 0

function Stop-Tray {
  $script:Notify.Visible = $false
  [System.Windows.Forms.Application]::Exit()
}

$watchdog = New-Object System.Windows.Forms.Timer
$watchdog.Interval = 4000
$watchdog.add_Tick({
  try {
    $state = Invoke-RestMethod -Uri ($script:Base + "/api/state") -Method Get -TimeoutSec 3
    # На порту может оказаться уже другой запуск приложения — например, старый
    # сняли диспетчером и тут же открыли заново. Тогда этот значок лишний.
    if ($script:Instance -and $state.status.instanceId -and $state.status.instanceId -ne $script:Instance) {
      Stop-Tray
      return
    }
    $script:Misses = 0
  } catch {
    $script:Misses = $script:Misses + 1
    if ($script:Misses -ge 2) { Stop-Tray }
  }
})
$watchdog.Start()

$script:Notify.ShowBalloonTip(
  5000, "OLX Watcher",
  "Работает в фоне. Значок — в трее: если его не видно, нажми стрелку вверх рядом с часами.",
  [System.Windows.Forms.ToolTipIcon]::Info
)

[System.Windows.Forms.Application]::Run()
`;

export class Tray {
  constructor({ port, instanceId, onLog } = {}) {
    this.port = port;
    this.instanceId = instanceId ?? "";
    this.onLog = onLog;
    this.child = null;
  }

  start() {
    if (process.platform !== "win32" || this.child) return;

    let scriptPath;
    try {
      scriptPath = join(tmpdir(), "olx-watcher-tray.ps1");
      // BOM обязателен: без него PowerShell 5.1 читает файл как ANSI
      // и калечит кириллицу в пунктах меню до синтаксической ошибки.
      writeFileSync(scriptPath, `﻿${TRAY_PS1}`, "utf8");
    } catch (err) {
      this.onLog?.(`не удалось подготовить значок в трее: ${err.message}`, "warn");
      return;
    }

    try {
      this.child = spawn(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden",
         "-File", scriptPath,
         "-Port", String(this.port),
         "-ExePath", process.execPath,
         "-InstanceId", this.instanceId],
        { windowsHide: true, stdio: "ignore", detached: false }
      );
    } catch (err) {
      this.onLog?.(`значок в трее не запустился: ${err.message}`, "warn");
      this.child = null;
      return;
    }

    this.child.on("exit", () => { this.child = null; });
    this.child.on("error", (err) => {
      this.onLog?.(`значок в трее отвалился: ${err.message}`, "warn");
      this.child = null;
    });
  }

  stop() {
    if (!this.child) return;
    try {
      this.child.kill();
    } catch {
      /* уже умер — не страшно */
    }
    this.child = null;
  }
}
