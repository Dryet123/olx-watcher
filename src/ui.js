/**
 * Страница интерфейса целиком. Лежит строкой в коде, а не файлом на диске,
 * чтобы .exe оставался одним файлом.
 *
 * Внутри шаблона нет обратных кавычек и подстановок — клиентский JS
 * специально собирает строки конкатенацией, чтобы ничего не экранировать.
 */
export const HTML = String.raw`<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OLX Watcher</title>
<style>
  :root {
    --bg: #f6f7f9;
    --panel: #ffffff;
    --panel-2: #f0f2f5;
    --text: #16181d;
    --muted: #6b7280;
    --line: #e2e5ea;
    --accent: #2563eb;
    --accent-text: #ffffff;
    --ok: #15803d;
    --ok-bg: #dcfce7;
    --warn: #b45309;
    --err: #b91c1c;
    --err-bg: #fee2e2;
    --radius: 10px;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f1115;
      --panel: #171a21;
      --panel-2: #1e222b;
      --text: #e6e8ec;
      --muted: #9099a8;
      --line: #2a2f3a;
      --accent: #3b82f6;
      --ok: #4ade80;
      --ok-bg: #14321f;
      --warn: #fbbf24;
      --err: #f87171;
      --err-bg: #3a1a1a;
    }
  }

  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font: 14px/1.5 "Segoe UI", system-ui, -apple-system, sans-serif;
  }
  a { color: inherit; }

  .topbar {
    position: sticky; top: 0; z-index: 10;
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    padding: 12px 18px;
    background: var(--panel);
    border-bottom: 1px solid var(--line);
  }
  .brand { font-weight: 650; font-size: 15px; margin-right: 4px; }
  .spacer { flex: 1; }

  .pill {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 4px 11px; border-radius: 999px;
    background: var(--panel-2); color: var(--muted);
    font-size: 12.5px; white-space: nowrap;
  }
  .pill.on { background: var(--ok-bg); color: var(--ok); }
  .pill.err { background: var(--err-bg); color: var(--err); }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
  .pill.on .dot { animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }

  button {
    font: inherit; cursor: pointer;
    padding: 7px 14px; border-radius: 8px;
    border: 1px solid var(--line); background: var(--panel-2); color: var(--text);
  }
  button:hover { border-color: var(--accent); }
  button:disabled { opacity: .5; cursor: default; }
  button.primary { background: var(--accent); color: var(--accent-text); border-color: transparent; }
  button.danger { color: var(--err); }
  button.small { padding: 4px 10px; font-size: 12.5px; }

  .tabs { display: flex; gap: 4px; padding: 12px 18px 0; flex-wrap: wrap; }
  .tab {
    padding: 8px 15px; border-radius: 8px 8px 0 0;
    border: 1px solid transparent; border-bottom: none;
    background: none; color: var(--muted);
  }
  .tab.active { background: var(--panel); border-color: var(--line); color: var(--text); }
  .tab .badge {
    display: inline-block; margin-left: 6px; padding: 0 6px;
    border-radius: 999px; background: var(--accent); color: #fff; font-size: 11px;
  }

  .panel {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 0 var(--radius) var(--radius) var(--radius);
    margin: 0 18px 18px;
    padding: 18px;
  }
  .panel[hidden] { display: none; }

  h2 { font-size: 15px; margin: 0 0 4px; }
  .hint { color: var(--muted); font-size: 12.5px; margin: 0 0 14px; }

  .card-list { display: grid; gap: 10px; }
  .card {
    display: flex; gap: 12px; text-decoration: none;
    border: 1px solid var(--line); border-radius: var(--radius);
    padding: 10px; background: var(--panel-2);
  }
  .card:hover { border-color: var(--accent); }
  .card img {
    width: 108px; height: 86px; object-fit: cover;
    border-radius: 7px; background: var(--line); flex: none;
  }
  .card .noimg {
    width: 108px; height: 86px; border-radius: 7px; flex: none;
    background: var(--line); display: grid; place-items: center;
    color: var(--muted); font-size: 11px;
  }
  .card-body { min-width: 0; flex: 1; }
  .price { font-weight: 650; font-size: 15px; }
  .title { margin: 2px 0 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta, .sub { color: var(--muted); font-size: 12.5px; }
  .tag {
    display: inline-block; padding: 1px 7px; border-radius: 999px;
    background: var(--panel); font-size: 11.5px; margin-right: 6px;
  }

  .search-card {
    border: 1px solid var(--line); border-radius: var(--radius);
    padding: 14px; margin-bottom: 12px; background: var(--panel-2);
  }
  .search-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
  .search-head input[type=text] { flex: 1; min-width: 180px; font-weight: 600; }

  label { display: block; font-size: 12.5px; color: var(--muted); margin-bottom: 3px; }
  input[type=text], input[type=number], input[type=password], select {
    width: 100%; font: inherit; padding: 6px 9px;
    border: 1px solid var(--line); border-radius: 7px;
    background: var(--panel); color: var(--text);
  }
  input:focus, select:focus { outline: 2px solid var(--accent); outline-offset: -1px; }

  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
  .row { display: flex; gap: 16px; flex-wrap: wrap; align-items: center; }
  .check { display: flex; align-items: center; gap: 7px; color: var(--text); font-size: 13.5px; }
  .check input { width: auto; }
  fieldset { border: 1px solid var(--line); border-radius: 8px; padding: 12px; margin: 12px 0 0; }
  legend { padding: 0 6px; color: var(--muted); font-size: 12.5px; }

  .actions { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
  .sticky-save {
    position: sticky; bottom: 0; margin: 16px -18px -18px;
    padding: 12px 18px; background: var(--panel);
    border-top: 1px solid var(--line); display: flex; gap: 10px; align-items: center;
  }

  .log { font-family: Consolas, "Cascadia Mono", monospace; font-size: 12.5px; }
  .log div { padding: 3px 0; border-bottom: 1px solid var(--line); }
  .log .warn { color: var(--warn); }
  .log .error { color: var(--err); }
  .log .muted { color: var(--muted); }
  .log time { color: var(--muted); margin-right: 8px; }

  .empty { color: var(--muted); text-align: center; padding: 36px 12px; }
  .toast {
    position: fixed; bottom: 18px; right: 18px; z-index: 50;
    background: var(--panel); border: 1px solid var(--line);
    border-radius: 9px; padding: 11px 15px; max-width: 360px;
    box-shadow: 0 8px 26px rgba(0,0,0,.18);
  }
  .toast.err { border-color: var(--err); color: var(--err); }
  .rejected { color: var(--muted); font-size: 12.5px; padding: 3px 0; }
</style>
</head>
<body>

<div class="topbar">
  <span class="brand">OLX Watcher</span>
  <span id="statusPill" class="pill"><span class="dot"></span><span id="statusText">загрузка…</span></span>
  <span id="nextPill" class="pill" hidden></span>
  <span class="spacer"></span>
  <button id="btnCheck">Проверить сейчас</button>
  <button id="btnToggle" class="primary">Старт</button>
</div>

<div class="tabs">
  <button class="tab active" data-tab="feed">Лента <span id="feedBadge" class="badge" hidden>0</span></button>
  <button class="tab" data-tab="searches">Поиски</button>
  <button class="tab" data-tab="settings">Настройки</button>
  <button class="tab" data-tab="log">Журнал</button>
</div>

<section class="panel" id="panel-feed">
  <h2>Найденные объявления</h2>
  <p class="hint">Здесь появляется всё, что подошло под фильтры после запуска слежения. Клик открывает объявление на OLX.</p>
  <div id="feed" class="card-list"></div>
  <div class="actions"><button id="btnClearFeed" class="small">Очистить ленту</button></div>
</section>

<section class="panel" id="panel-searches" hidden>
  <h2>Поиски</h2>
  <p class="hint">Настрой фильтры на сайте OLX, скопируй ссылку из адресной строки и вставь сюда. Фильтры ниже — дополнительные, поверх ссылки.</p>
  <div id="searches"></div>
  <div class="actions"><button id="btnAddSearch">+ Добавить поиск</button></div>
  <div class="sticky-save">
    <button id="btnSaveSearches" class="primary">Сохранить</button>
    <span class="hint" style="margin:0">Изменения применяются сразу, перезапуск не нужен.</span>
  </div>
</section>

<section class="panel" id="panel-settings" hidden>
  <h2>Настройки</h2>
  <p class="hint">Общие параметры и каналы уведомлений.</p>
  <div id="settings"></div>
  <div class="sticky-save">
    <button id="btnSaveSettings" class="primary">Сохранить</button>
    <button id="btnTestNotify">Проверить уведомления</button>
    <button id="btnResetAll" class="danger">Сбросить всю историю</button>
  </div>
</section>

<section class="panel" id="panel-log" hidden>
  <h2>Журнал</h2>
  <p class="hint">Последние события. Полезно, если что-то идёт не так.</p>
  <div id="log" class="log"></div>
</section>

<script>
"use strict";

var state = { config: null, status: null, feed: [], log: [], autostart: { supported: false, enabled: false } };
var activeTab = "feed";
var seenFeedIds = new Set();
var unseenCount = 0;

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function api(path, body) {
  var opts = { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  return fetch(path, opts).then(function (r) {
    return r.json().then(function (data) {
      if (!r.ok) throw new Error(data.error || ("Ошибка " + r.status));
      return data;
    });
  });
}

function toast(text, isError) {
  var el = document.createElement("div");
  el.className = "toast" + (isError ? " err" : "");
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(function () { el.remove(); }, isError ? 7000 : 3500);
}

function ago(iso) {
  if (!iso) return "";
  var min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "только что";
  if (min < 60) return min + " мин назад";
  var h = Math.round(min / 60);
  if (h < 24) return h + " ч назад";
  return Math.round(h / 24) + " дн назад";
}

/* ---------- получение состояния ---------- */

function refresh() {
  return api("/api/state").then(function (data) {
    state.status = data.status;
    state.feed = data.feed;
    state.log = data.log;
    state.autostart = data.autostart || { supported: false, enabled: false };
    if (!state.config) { state.config = data.config; renderSearches(); renderSettings(); }
    renderStatus();
    syncAutostart();
    renderFeed();
    renderLog();
  }).catch(function (err) {
    var pill = document.getElementById("statusPill");
    pill.className = "pill err";
    document.getElementById("statusText").textContent = "нет связи с приложением";
  });
}

function renderStatus() {
  var st = state.status;
  var pill = document.getElementById("statusPill");
  var text = document.getElementById("statusText");
  var next = document.getElementById("nextPill");

  if (st.lastError) {
    pill.className = "pill err";
    text.textContent = st.lastError.slice(0, 70);
  } else if (st.busy) {
    pill.className = "pill on";
    text.textContent = "проверяю…";
  } else if (st.running) {
    pill.className = "pill on";
    text.textContent = "слежу";
  } else {
    pill.className = "pill";
    text.textContent = "остановлено";
  }

  if (st.running && st.nextRunAt && !st.busy) {
    var sec = Math.max(0, Math.round((new Date(st.nextRunAt).getTime() - Date.now()) / 1000));
    next.hidden = false;
    next.textContent = "следующая проверка через " + Math.floor(sec / 60) + ":" + ("0" + (sec % 60)).slice(-2);
  } else {
    next.hidden = true;
  }

  document.getElementById("btnToggle").textContent = st.running ? "Стоп" : "Старт";
  document.getElementById("btnToggle").className = st.running ? "" : "primary";
  document.getElementById("btnCheck").disabled = st.busy;
}

/*
 * Настройки рисуются один раз, чтобы не сбивать ввод. Но состояние автозапуска
 * сервер узнаёт с задержкой (лезет в реестр), да и переключить его могли из
 * меню значка — поэтому эту галочку держим в актуальном виде отдельно.
 */
function syncAutostart() {
  var el = document.getElementById("chkAutostart");
  if (!el || el.getAttribute("data-busy") === "1") return;
  el.disabled = !state.autostart.supported;
  el.checked = !!state.autostart.enabled;
}

function renderFeed() {
  var box = document.getElementById("feed");
  if (!state.feed.length) {
    box.innerHTML = '<div class="empty">Пока пусто. Нажми «Старт» — первая проверка запомнит то, что уже висит на OLX, ' +
      'а дальше сюда будут падать только новые объявления.</div>';
    return;
  }

  var fresh = 0;
  var html = state.feed.map(function (a) {
    if (!seenFeedIds.has(a.id)) { seenFeedIds.add(a.id); fresh++; }
    var img = a.photo
      ? '<img src="' + esc(a.photo) + '" alt="" loading="lazy">'
      : '<div class="noimg">без фото</div>';
    return '<a class="card" href="' + esc(a.url) + '" target="_blank" rel="noopener">' +
      img +
      '<div class="card-body">' +
        '<div class="price">' + esc(a.price || "цена не указана") + '</div>' +
        '<div class="title">' + esc(a.title) + '</div>' +
        '<div class="meta">' + esc([a.where, a.facts].filter(Boolean).join(" · ")) + '</div>' +
        '<div class="sub">' +
          '<span class="tag">' + (a.business ? "агентство" : "частное") + '</span>' +
          esc(ago(a.createdAt)) + ' · найдено ' + esc(ago(a.foundAt)) + ' · ' + esc(a.searchName) +
        '</div>' +
      '</div></a>';
  }).join("");

  box.innerHTML = html;

  if (activeTab !== "feed") {
    unseenCount += fresh;
    var badge = document.getElementById("feedBadge");
    badge.hidden = unseenCount === 0;
    badge.textContent = unseenCount;
  }
}

function renderLog() {
  var box = document.getElementById("log");
  if (!state.log.length) { box.innerHTML = '<div class="empty">Пока ничего не произошло.</div>'; return; }
  box.innerHTML = state.log.map(function (e) {
    var t = new Date(e.at).toLocaleTimeString("ru-RU", { hour12: false });
    return '<div class="' + esc(e.level) + '"><time>' + t + '</time>' + esc(e.text) + '</div>';
  }).join("");
}

/* ---------- редактор конфига ---------- */

function setPath(path, value) {
  var parts = path.split(".");
  var obj = state.config;
  for (var i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
  obj[parts[parts.length - 1]] = value;
}

function numOrNull(v) {
  if (v === "" || v == null) return null;
  var n = Number(v);
  return isNaN(n) ? null : n;
}

function listToText(arr) { return (arr || []).join(", "); }
function textToList(t) {
  return String(t).split(",").map(function (x) { return x.trim(); }).filter(Boolean);
}

function field(label, path, value, type, placeholder) {
  return '<div><label>' + esc(label) + '</label>' +
    '<input type="' + (type || "text") + '" data-path="' + esc(path) + '"' +
    ' value="' + esc(value == null ? "" : value) + '"' +
    ' placeholder="' + esc(placeholder || "") + '"></div>';
}

function check(label, path, value) {
  return '<label class="check"><input type="checkbox" data-path="' + esc(path) + '"' +
    (value ? " checked" : "") + '>' + esc(label) + '</label>';
}

function renderSearches() {
  var box = document.getElementById("searches");
  if (!state.config.searches.length) {
    box.innerHTML = '<div class="empty">Ни одного поиска. Нажми «Добавить поиск».</div>';
    return;
  }

  box.innerHTML = state.config.searches.map(function (s, i) {
    var p = "searches." + i;
    var f = s.filters;
    var rooms = [1, 2, 3, 4, 5].map(function (r) {
      return '<label class="check"><input type="checkbox" data-room="' + r + '" data-index="' + i + '"' +
        (f.rooms.indexOf(r) >= 0 ? " checked" : "") + '>' + r + 'к</label>';
    }).join("");

    return '<div class="search-card" data-index="' + i + '">' +
      '<div class="search-head">' +
        '<label class="check"><input type="checkbox" data-path="' + p + '.enabled"' +
          (s.enabled ? " checked" : "") + '>вкл</label>' +
        '<input type="text" data-path="' + p + '.name" value="' + esc(s.name) + '" placeholder="Название поиска">' +
      '</div>' +

      '<div><label>Ссылка на поиск OLX</label>' +
      '<input type="text" data-path="' + p + '.url" value="' + esc(s.url) + '" placeholder="https://www.olx.ua/..."></div>' +

      '<fieldset><legend>Цена, площадь, этаж</legend><div class="grid">' +
        field("Цена от", p + ".filters.priceMin", f.priceMin, "number") +
        field("Цена до", p + ".filters.priceMax", f.priceMax, "number") +
        field("Площадь от, м²", p + ".filters.areaMin", f.areaMin, "number") +
        field("Площадь до, м²", p + ".filters.areaMax", f.areaMax, "number") +
        field("Этаж от", p + ".filters.floorMin", f.floorMin, "number") +
        field("Этаж до", p + ".filters.floorMax", f.floorMax, "number") +
      '</div></fieldset>' +

      '<fieldset><legend>Комнаты</legend><div class="row">' + rooms +
        '<span class="hint" style="margin:0">ничего не отмечено — любые</span></div></fieldset>' +

      '<fieldset><legend>Слова и районы</legend><div class="grid">' +
        field("Стоп-слова (через запятую)", p + ".filters.excludeAny", listToText(f.excludeAny), "text", "подобово, посуточно") +
        field("Обязательные слова (хотя бы одно)", p + ".filters.includeAny", listToText(f.includeAny), "text", "без комиссии") +
        field("Только эти районы", p + ".filters.districts", listToText(f.districts), "text", "Печерський, Шевченківський") +
        field("Исключить районы", p + ".filters.excludeDistricts", listToText(f.excludeDistricts), "text") +
      '</div></fieldset>' +

      '<fieldset><legend>Прочее</legend><div class="row">' +
        check("Только частные (без агентств)", p + ".filters.skipAgencies", f.skipAgencies) +
        check("Пропускать платные «поднятые»", p + ".filters.skipPromoted", f.skipPromoted) +
        check("Только «без комиссии»", p + ".filters.noCommission", f.noCommission) +
      '</div>' +
      '<div style="max-width:260px;margin-top:10px">' +
        field("Не старше, минут", p + ".filters.maxAgeMinutes", f.maxAgeMinutes, "number") +
        '<span class="hint">OLX подмешивает старые платные объявления и ротирует их — это ограничение их отсекает. 2880 = двое суток.</span>' +
      '</div></fieldset>' +

      '<div class="actions">' +
        '<button class="small" data-act="preview" data-index="' + i + '">Проверить фильтры</button>' +
        '<button class="small" data-act="reset" data-index="' + i + '">Сбросить историю</button>' +
        '<button class="small danger" data-act="delete" data-index="' + i + '">Удалить</button>' +
      '</div>' +
      '<div class="preview" data-preview="' + i + '"></div>' +
    '</div>';
  }).join("");
}

function renderSettings() {
  var c = state.config;
  var t = c.notifications.telegram;

  document.getElementById("settings").innerHTML =
    '<fieldset><legend>Проверка</legend><div class="grid">' +
      field("Интервал, секунд", "intervalSeconds", c.intervalSeconds, "number") +
      field("Разброс интервала, секунд", "jitterSeconds", c.jitterSeconds, "number") +
      field("Объявлений за раз (до 50)", "pageSize", c.pageSize, "number") +
      field("Не больше уведомлений за проход", "maxNotificationsPerRun", c.maxNotificationsPerRun, "number") +
    '</div><div class="row" style="margin-top:12px">' +
      check("Уведомлять и о том, что уже есть на сайте (первый запуск)", "notifyOnFirstRun", c.notifyOnFirstRun) +
    '</div></fieldset>' +

    '<fieldset><legend>Каналы уведомлений</legend><div class="row">' +
      check("Всплывающие окна Windows", "notifications.windowsToast", c.notifications.windowsToast) +
      check("Вывод в консоль", "notifications.console", c.notifications.console) +
      check("Telegram", "notifications.telegram.enabled", t.enabled) +
    '</div><div class="grid" style="margin-top:12px">' +
      field("Токен бота (@BotFather)", "notifications.telegram.botToken", t.botToken, "text", "123456:AA...") +
      field("Chat ID (несколько — через запятую)", "notifications.telegram.chatIds", listToText(t.chatIds), "text", "123456789, 987654321") +
    '</div>' +
    '<div class="row" style="margin-top:12px">' +
      check("Отвечать на команды в Telegram", "notifications.telegram.commandsEnabled", t.commandsEnabled) +
    '</div>' +
    '<p class="hint" style="margin-top:10px">Telegram нужен, чтобы уведомления приходили на телефон. ' +
    'Создай бота у @BotFather, напиши ему любое сообщение, потом открой ' +
    'https://api.telegram.org/bot&lt;ТОКЕН&gt;/getUpdates и возьми оттуда chat id. ' +
    'Chat ID можно и не искать: включи Telegram с одним токеном, сохрани, напиши боту /start — ' +
    'он ответит твоим chat id. Несколько аккаунтов — перечисли их id через запятую: ' +
    'уведомления придут всем, команды примутся от любого.</p>' +
    '<p class="hint">С включёнными командами боту можно писать: /status, /last, /check, ' +
    '/pause, /resume, /searches, /on 1, /off 1.</p>' +
    '</fieldset>' +

    '<fieldset><legend>Приложение</legend><div class="grid">' +
      field("Порт интерфейса", "uiPort", c.uiPort, "number") +
    '</div><div class="row" style="margin-top:12px">' +
      check("Открывать браузер при запуске", "openBrowser", c.openBrowser) +
      check("Начинать слежение сразу при запуске", "autoStart", c.autoStart) +
      check("Значок в трее", "tray", c.tray) +
    '</div>' +
    '<div class="row" style="margin-top:12px">' +
      '<label class="check"><input type="checkbox" id="chkAutostart"' +
        (state.autostart && state.autostart.enabled ? " checked" : "") +
        (state.autostart && state.autostart.supported ? "" : " disabled") +
        '>Запускать вместе с Windows</label>' +
      '<span class="hint" style="margin:0">применяется сразу, кнопка «Сохранить» не нужна</span>' +
    '</div>' +
    '<p class="hint" style="margin-top:10px">Порт и значок в трее применятся после перезапуска приложения. ' +
    'Значок может прятаться под стрелкой вверх рядом с часами — перетащи его оттуда к часам, ' +
    'чтобы был всегда на виду.</p>' +
    '</fieldset>';
}

/* ---------- обработка ввода ---------- */

var LIST_FIELDS = ["excludeAny", "includeAny", "districts", "excludeDistricts", "chatIds"];

document.addEventListener("input", function (e) {
  var el = e.target;
  var path = el.getAttribute("data-path");
  if (!path || !state.config) return;

  var value;
  if (el.type === "checkbox") value = el.checked;
  else if (el.type === "number") value = numOrNull(el.value);
  else if (LIST_FIELDS.indexOf(path.split(".").pop()) >= 0) value = textToList(el.value);
  else value = el.value;

  setPath(path, value);
});

document.addEventListener("change", function (e) {
  var el = e.target;

  // Автозапуск — состояние системы, а не поле конфига: применяем сразу
  // и переспрашиваем сервер, что получилось на самом деле.
  if (el.id === "chkAutostart") {
    var wanted = el.checked;
    el.setAttribute("data-busy", "1");
    el.disabled = true;
    api("/api/autostart", { enabled: wanted }).then(function (d) {
      state.autostart.enabled = d.enabled;
      el.checked = d.enabled;
      toast(d.enabled ? "Будет запускаться вместе с Windows" : "Автозапуск выключен");
    }).catch(function (err) {
      el.checked = !wanted;
      toast(err.message, true);
    }).finally(function () {
      el.removeAttribute("data-busy");
      el.disabled = false;
    });
    return;
  }

  var room = el.getAttribute("data-room");
  if (!room) return;
  var s = state.config.searches[Number(el.getAttribute("data-index"))];
  var r = Number(room);
  var idx = s.filters.rooms.indexOf(r);
  if (el.checked && idx < 0) s.filters.rooms.push(r);
  if (!el.checked && idx >= 0) s.filters.rooms.splice(idx, 1);
  s.filters.rooms.sort();
});

/* ---------- действия ---------- */

function saveConfig() {
  return api("/api/config", { config: state.config }).then(function (data) {
    state.config = data.config;
    toast("Сохранено");
    return data.config;
  }).catch(function (err) { toast(err.message, true); throw err; });
}

document.addEventListener("click", function (e) {
  var btn = e.target.closest("button");
  if (!btn) return;

  var tab = btn.getAttribute("data-tab");
  if (tab) {
    activeTab = tab;
    document.querySelectorAll(".tab").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-tab") === tab);
    });
    ["feed", "searches", "settings", "log"].forEach(function (name) {
      document.getElementById("panel-" + name).hidden = name !== tab;
    });
    if (tab === "feed") {
      unseenCount = 0;
      document.getElementById("feedBadge").hidden = true;
    }
    return;
  }

  var act = btn.getAttribute("data-act");
  var i = Number(btn.getAttribute("data-index"));

  if (act === "delete") {
    if (!confirm("Удалить поиск «" + state.config.searches[i].name + "»?")) return;
    state.config.searches.splice(i, 1);
    renderSearches();
    saveConfig().then(renderSearches);
    return;
  }

  if (act === "reset") {
    api("/api/reset", { name: state.config.searches[i].name })
      .then(function () { toast("История очищена — следующая проверка снимет базу заново."); })
      .catch(function (err) { toast(err.message, true); });
    return;
  }

  if (act === "preview") {
    var s = state.config.searches[i];
    var box = document.querySelector('[data-preview="' + i + '"]');
    box.innerHTML = '<p class="hint">Загружаю…</p>';
    btn.disabled = true;

    api("/api/preview", { url: s.url, filters: s.filters }).then(function (data) {
      var okItems = data.items.filter(function (x) { return x.ok; });
      var head = '<p class="hint">Подходит ' + data.matched + ' из ' + data.total + ' объявлений на первой странице.</p>';

      if (!okItems.length) {
        var reasons = data.items.filter(function (x) { return !x.ok; }).slice(0, 8).map(function (x) {
          return '<div class="rejected">– ' + esc(x.title.slice(0, 60)) + ' → ' + esc(x.reason) + '</div>';
        }).join("");
        box.innerHTML = head + '<p class="hint">Ничего не прошло фильтры. Причины:</p>' + reasons;
        return;
      }

      box.innerHTML = head + '<div class="card-list">' + okItems.slice(0, 6).map(function (a) {
        var img = a.photo ? '<img src="' + esc(a.photo) + '" alt="" loading="lazy">' : '<div class="noimg">без фото</div>';
        return '<a class="card" href="' + esc(a.url) + '" target="_blank" rel="noopener">' + img +
          '<div class="card-body"><div class="price">' + esc(a.price || "цена не указана") + '</div>' +
          '<div class="title">' + esc(a.title) + '</div>' +
          '<div class="meta">' + esc([a.where, a.facts].filter(Boolean).join(" · ")) + '</div>' +
          '<div class="sub"><span class="tag">' + (a.business ? "агентство" : "частное") + '</span>' +
          esc(ago(a.createdAt)) + '</div></div></a>';
      }).join("") + '</div>';
    }).catch(function (err) {
      box.innerHTML = '<p class="hint" style="color:var(--err)">' + esc(err.message) + '</p>';
    }).finally(function () { btn.disabled = false; });
    return;
  }

  switch (btn.id) {
    case "btnToggle":
      api(state.status.running ? "/api/stop" : "/api/start", {}).then(refresh);
      break;
    case "btnCheck":
      api("/api/check", {}).then(function () { toast("Проверяю…"); setTimeout(refresh, 400); });
      break;
    case "btnAddSearch":
      state.config.searches.push({
        name: "Новый поиск", enabled: true, url: "",
        filters: {
          priceMin: null, priceMax: null, areaMin: null, areaMax: null,
          floorMin: null, floorMax: null, rooms: [],
          districts: [], excludeDistricts: [], includeAny: [], excludeAny: [],
          skipPromoted: false, skipAgencies: false, noCommission: false,
          maxAgeMinutes: 2880,
        },
      });
      renderSearches();
      break;
    case "btnSaveSearches":
      saveConfig().then(renderSearches);
      break;
    case "btnSaveSettings":
      saveConfig().then(renderSettings);
      break;
    case "btnTestNotify":
      btn.disabled = true;
      api("/api/test-notify", {}).then(function (d) {
        toast("Уведомления отправлены. Telegram: " + d.telegram);
      }).catch(function (err) { toast(err.message, true); })
        .finally(function () { btn.disabled = false; });
      break;
    case "btnResetAll":
      if (!confirm("Забыть все просмотренные объявления? Следующая проверка снимет базу заново.")) return;
      api("/api/reset", {}).then(function () { toast("История очищена."); });
      break;
    case "btnClearFeed":
      api("/api/clear-feed", {}).then(function () { seenFeedIds.clear(); refresh(); });
      break;
  }
});

refresh();
setInterval(refresh, 2000);
</script>
</body>
</html>`;
