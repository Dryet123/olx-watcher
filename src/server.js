import { createServer } from "node:http";
import { execFile } from "node:child_process";

import { HTML } from "./ui.js";
import { normalizeConfig, saveConfig } from "./config.js";
import { resolveSearch, fetchOffers, fetchOffersViaHtml } from "./olx.js";
import { passesFilters } from "./filters.js";
import { shortFacts, whereText } from "./format.js";
import { telegramSelfTest } from "./notifiers/telegram.js";
import * as autostart from "./autostart.js";

const LOG_LIMIT = 300;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 2_000_000) {
        reject(new Error("Слишком большой запрос"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error(`Некорректный JSON: ${err.message}`));
      }
    });
    req.on("error", reject);
  });
}

function send(res, code, data, type = "application/json; charset=utf-8") {
  const body = type.startsWith("application/json") ? JSON.stringify(data) : data;
  res.writeHead(code, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

export function openInBrowser(url) {
  if (process.platform === "win32") {
    execFile("cmd", ["/c", "start", "", url], { windowsHide: true }, () => {});
  } else if (process.platform === "darwin") {
    execFile("open", [url], () => {});
  } else {
    execFile("xdg-open", [url], () => {});
  }
}

/**
 * Локальный веб-интерфейс. Слушает только 127.0.0.1 —
 * снаружи, из сети, до него не достучаться.
 */
export function startServer(watcher, { port = 8777, onConfigChange, onQuit } = {}) {
  const log = [];
  watcher.on("log", (entry) => {
    log.unshift(entry);
    if (log.length > LOG_LIMIT) log.length = LOG_LIMIT;
  });

  // Автозапуск — состояние системы, а не наша настройка, поэтому читаем его
  // из реестра, а не храним в конфиге: иначе они разъехались бы. Держим в
  // памяти, чтобы не дёргать PowerShell на каждый опрос интерфейса.
  let autostartOn = false;
  autostart.isEnabled().then((v) => { autostartOn = v; });

  const routes = {
    "GET /": (req, res) => send(res, 200, HTML, "text/html; charset=utf-8"),

    "GET /api/state": (req, res) =>
      send(res, 200, {
        status: watcher.status,
        config: watcher.cfg,
        autostart: { supported: process.platform === "win32", enabled: autostartOn },
        feed: watcher.feed.slice(0, 100),
        log: log.slice(0, 100),
      }),

    "POST /api/autostart": async (req, res, body) => {
      const wanted = Boolean(body.enabled);
      if (wanted) await autostart.enable();
      else await autostart.disable();

      autostartOn = await autostart.isEnabled();
      watcher.log(autostartOn
        ? "Автозапуск вместе с Windows включён."
        : "Автозапуск вместе с Windows выключен.");
      send(res, 200, { ok: true, enabled: autostartOn });
    },

    "POST /api/config": async (req, res, body) => {
      const cfg = normalizeConfig(body.config ?? {});
      saveConfig(cfg);
      watcher.setConfig(cfg);
      watcher.log("Настройки сохранены.");
      onConfigChange?.(cfg);
      send(res, 200, { ok: true, config: cfg });
    },

    "POST /api/start": (req, res) => {
      watcher.start();
      send(res, 200, { ok: true });
    },

    "POST /api/stop": (req, res) => {
      watcher.stop();
      send(res, 200, { ok: true });
    },

    "POST /api/check": async (req, res) => {
      watcher.checkNow();
      send(res, 200, { ok: true });
    },

    "POST /api/reset": (req, res, body) => {
      const name = body.name;
      if (name) {
        watcher.store.forget(name);
        watcher.log(`История поиска «${name}» очищена.`);
      } else {
        for (const s of watcher.cfg.searches) watcher.store.forget(s.name);
        watcher.log("История всех поисков очищена.");
      }
      watcher.store.save();
      send(res, 200, { ok: true });
    },

    "POST /api/clear-feed": (req, res) => {
      watcher.clearFeed();
      send(res, 200, { ok: true });
    },

    "POST /api/quit": (req, res) => {
      send(res, 200, { ok: true });
      // Даём ответу уйти по проводу, только потом гасим процесс.
      setTimeout(() => onQuit?.(), 250);
    },

    "POST /api/preview": async (req, res, body) => {
      const url = String(body.url ?? "").trim();
      if (!/^https?:\/\/[^/]*olx\./i.test(url)) {
        throw new Error("Ссылка должна вести на сайт OLX.");
      }
      const filters = body.filters ?? {};

      let ads;
      try {
        const { apiUrl } = await resolveSearch(url);
        ads = await fetchOffers(apiUrl, { limit: watcher.cfg.pageSize });
      } catch {
        ads = await fetchOffersViaHtml(url);
      }

      const items = [];
      let rejected = 0;
      for (const ad of ads) {
        const verdict = passesFilters(ad, filters);
        if (!verdict.ok) {
          rejected++;
          if (items.length < 40) items.push({ ok: false, reason: verdict.reason, title: ad.title });
          continue;
        }
        items.push({
          ok: true,
          id: ad.id,
          url: ad.url,
          title: ad.title,
          price: ad.price.label,
          where: whereText(ad),
          facts: shortFacts(ad),
          business: ad.business,
          photo: ad.photo,
          createdAt: ad.createdAt,
        });
      }

      send(res, 200, { total: ads.length, matched: ads.length - rejected, items });
    },

    "POST /api/test-notify": async (req, res) => {
      const demo = {
        id: "demo",
        url: "https://www.olx.ua/",
        title: "Проверка связи — это тестовое объявление",
        description: "",
        createdAt: new Date().toISOString(),
        price: { value: 15000, currency: "UAH", label: "15 000 грн.", negotiable: false },
        location: { city: "Київ", district: "Шевченківський", region: null },
        params: {
          total_area: { key: "48", label: "48 м²" },
          number_of_rooms_string: { key: "dvuhkomnatnye", label: "2 кімнати" },
        },
        business: false,
        promoted: false,
        userName: "OLX Watcher",
        photo: null,
      };

      let telegram = "выключен";
      if (watcher.cfg.notifications.telegram?.enabled) {
        try {
          telegram = "бот @" + (await telegramSelfTest(watcher.cfg.notifications.telegram));
        } catch (err) {
          telegram = "ошибка: " + err.message;
        }
      }

      await watcher.deliver(demo, "тест");
      send(res, 200, { ok: true, telegram });
    },
  };

  const server = createServer(async (req, res) => {
    const path = new URL(req.url, "http://127.0.0.1").pathname;
    const handler = routes[`${req.method} ${path}`];

    if (!handler) return send(res, 404, { error: "Не найдено" });

    try {
      const body = req.method === "POST" ? await readBody(req) : null;
      await handler(req, res, body);
    } catch (err) {
      if (!res.headersSent) send(res, 400, { error: err.message });
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", (err) => {
      if (err.code === "EADDRINUSE") {
        reject(new Error(
          `Порт ${port} уже занят. Возможно, приложение уже запущено — ` +
          `открой http://127.0.0.1:${port} или смени uiPort в config.json.`
        ));
      } else {
        reject(err);
      }
    });
    server.listen(port, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${port}` }));
  });
}
