import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";

import { FEED_PATH } from "./paths.js";
import { Store } from "./store.js";
import { resolveSearch, fetchOffers, fetchOffersViaHtml } from "./olx.js";
import { passesFilters } from "./filters.js";
import { shortFacts, whereText } from "./format.js";
import { sleep } from "./http.js";
import { notifyConsole } from "./notifiers/console.js";
import { notifyToast } from "./notifiers/toast.js";
import { notifyTelegram } from "./notifiers/telegram.js";

const FEED_LIMIT = 300;

/** Урезанное объявление — только то, что показывает UI. */
function toFeedItem(ad, searchName) {
  return {
    id: ad.id,
    searchName,
    url: ad.url,
    title: ad.title,
    price: ad.price.label,
    priceValue: ad.price.value,
    where: whereText(ad),
    facts: shortFacts(ad),
    business: ad.business,
    photo: ad.photo,
    createdAt: ad.createdAt,
    foundAt: new Date().toISOString(),
  };
}

function loadFeed() {
  if (!existsSync(FEED_PATH)) return [];
  try {
    const data = JSON.parse(readFileSync(FEED_PATH, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Движок слежения. Управляется и из консоли, и из UI,
 * поэтому обо всём сообщает событиями, а не печатью в stdout.
 */
export class Watcher extends EventEmitter {
  constructor(cfg, store = new Store()) {
    super();
    this.cfg = cfg;
    this.store = store;
    this.feed = loadFeed();
    // Метка конкретного запуска: по ней значок в трее понимает, что приложение
    // не просто перезапустилось на том же порту, а сменилось — и уходит.
    this.instanceId = randomUUID();
    this.running = false;
    this.busy = false;
    this.nextRunAt = null;
    this.lastError = null;
    this.timer = null;
    this.wakeUp = null;
  }

  setConfig(cfg) {
    this.cfg = cfg;
  }

  log(text, level = "info") {
    this.emit("log", { level, text, at: new Date().toISOString() });
  }

  get status() {
    return {
      instanceId: this.instanceId,
      running: this.running,
      busy: this.busy,
      nextRunAt: this.nextRunAt,
      lastError: this.lastError,
      searches: this.cfg.searches.map((s) => {
        const e = this.store.entry(s.name);
        return {
          name: s.name,
          enabled: s.enabled,
          url: s.url,
          seen: e.seen.length,
          notified: e.notified ?? 0,
          lastRun: e.lastRun,
        };
      }),
    };
  }

  async apiUrlFor(search) {
    const cached = this.store.getApiUrl(search.name, search.url);
    if (cached) return cached;

    this.log(`Разбираю ссылку поиска «${search.name}»…`);
    const { apiUrl, total } = await resolveSearch(search.url);
    this.store.setApiUrl(search.name, apiUrl, search.url);
    this.log(`Готово: по этим фильтрам сейчас ${total ?? "?"} объявлений.`);
    return apiUrl;
  }

  async fetchAds(search) {
    try {
      return await fetchOffers(await this.apiUrlFor(search), { limit: this.cfg.pageSize });
    } catch (err) {
      this.log(`API не ответил (${err.message}). Пробую через HTML-страницу…`, "warn");
      this.store.setApiUrl(search.name, null);
      return await fetchOffersViaHtml(search.url);
    }
  }

  async deliver(ad, searchName) {
    const n = this.cfg.notifications;
    if (n.console) notifyConsole(ad, searchName);
    if (n.windowsToast) await notifyToast(ad, searchName);
    if (n.telegram?.enabled) await notifyTelegram(ad, searchName, n.telegram);
  }

  pushFeed(item) {
    this.feed.unshift(item);
    if (this.feed.length > FEED_LIMIT) this.feed.length = FEED_LIMIT;
    try {
      const tmp = `${FEED_PATH}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.feed), "utf8");
      renameSync(tmp, FEED_PATH);
    } catch {
      /* лента — вещь необязательная, ошибку записи переживём */
    }
  }

  clearFeed() {
    this.feed = [];
    try {
      writeFileSync(FEED_PATH, "[]", "utf8");
    } catch {
      /* см. выше */
    }
  }

  /** Один проход по всем включённым поискам. */
  async runOnce({ verbose = false } = {}) {
    if (this.busy) return 0;
    this.busy = true;
    this.emit("change");

    let totalNew = 0;
    try {
      for (const search of this.cfg.searches) {
        if (!search.enabled) continue;

        let ads;
        try {
          ads = await this.fetchAds(search);
        } catch (err) {
          this.lastError = `«${search.name}»: ${err.message}`;
          this.log(this.lastError, "error");
          this.emit("change");
          continue;
        }

        const firstRun = this.store.isFirstRun(search.name);
        const unseen = ads.filter((ad) => !this.store.isSeen(search.name, ad.id));

        const matched = [];
        const rejected = [];
        for (const ad of unseen) {
          const verdict = passesFilters(ad, search.filters);
          if (verdict.ok) matched.push(ad);
          else rejected.push({ ad, reason: verdict.reason });
        }

        const isBaseline = firstRun && !this.cfg.notifyOnFirstRun;
        const toSend = isBaseline ? [] : matched.slice(0, this.cfg.maxNotificationsPerRun);

        // Подошедшее, что не влезло в лимит за проход, намеренно НЕ помечаем
        // просмотренным — иначе оно потерялось бы навсегда. Придёт следующей проверкой.
        const heldBack = isBaseline
          ? new Set()
          : new Set(matched.slice(this.cfg.maxNotificationsPerRun).map((a) => a.id));

        // Остальное помечаем, включая отсеянное фильтрами, чтобы не проверять повторно.
        this.store.markSeen(
          search.name,
          ads.filter((a) => !heldBack.has(a.id)).map((a) => a.id)
        );

        if (isBaseline) {
          this.log(
            `«${search.name}»: первый запуск — запомнил ${ads.length} объявлений как базу, ` +
            `уведомления не шлю. Дальше только новые.`
          );
          this.store.touch(search.name, 0);
          this.store.save();
          this.emit("change");
          continue;
        }
        for (const ad of toSend) {
          const item = toFeedItem(ad, search.name);
          this.pushFeed(item);
          this.emit("found", item);
          await this.deliver(ad, search.name);
          totalNew++;
          await sleep(400);
        }

        const skipped = matched.length - toSend.length;
        if (skipped > 0) {
          this.log(
            `Ещё ${skipped} подходящих придержал — лимит за один проход. ` +
            `Придут следующей проверкой.`,
            "warn"
          );
        }

        this.log(
          `«${search.name}»: проверено ${ads.length}, новых ${unseen.length}, подошло ${matched.length}` +
          (skipped > 0 ? ` (показано ${toSend.length})` : "")
        );

        if (verbose && rejected.length) {
          for (const { ad, reason } of rejected.slice(0, 15)) {
            this.log(`отсеяно: ${ad.title.slice(0, 60)} → ${reason}`, "muted");
          }
        }

        this.lastError = null;
        this.store.touch(search.name, toSend.length);
        this.store.save();
        this.emit("change");
        await sleep(1200); // не долбим OLX очередью запросов
      }
    } finally {
      this.busy = false;
      this.emit("change");
    }

    return totalNew;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastError = null;
    const active = this.cfg.searches.filter((s) => s.enabled).length;
    this.log(`Слежение включено: ${active} поиск(ов), проверка каждые ~${Math.round(this.cfg.intervalSeconds / 60)} мин.`);
    this.emit("change");
    this.loop();
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    this.nextRunAt = null;
    if (this.timer) clearTimeout(this.timer);
    if (this.wakeUp) this.wakeUp();
    this.log("Слежение выключено.");
    this.emit("change");
  }

  /** Досрочная проверка, не сбивая расписание цикла. */
  async checkNow() {
    if (this.busy) return 0;
    if (this.running && this.wakeUp) {
      this.wakeUp();
      return 0;
    }
    return await this.runOnce();
  }

  async loop() {
    while (this.running) {
      try {
        await this.runOnce();
      } catch (err) {
        this.lastError = err.message;
        this.log(`Ошибка прохода: ${err.message}`, "error");
      }
      if (!this.running) break;

      const jitter = Math.round((Math.random() * 2 - 1) * this.cfg.jitterSeconds);
      const waitSec = Math.max(60, this.cfg.intervalSeconds + jitter);
      this.nextRunAt = new Date(Date.now() + waitSec * 1000).toISOString();
      this.emit("change");

      await new Promise((resolve) => {
        this.timer = setTimeout(resolve, waitSec * 1000);
        this.wakeUp = () => {
          clearTimeout(this.timer);
          this.wakeUp = null;
          resolve();
        };
      });
    }
    this.nextRunAt = null;
    this.emit("change");
  }
}
