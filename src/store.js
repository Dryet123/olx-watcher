import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";

import { STATE_PATH } from "./paths.js";

/** Сколько ID держим в памяти на каждый поиск (защита от разрастания файла). */
const MAX_IDS_PER_SEARCH = 4000;

export class Store {
  constructor(path = STATE_PATH) {
    this.path = path;
    this.data = { searches: {} };
    if (existsSync(path)) {
      try {
        this.data = JSON.parse(readFileSync(path, "utf8"));
        this.data.searches ??= {};
      } catch {
        console.warn(`⚠ Файл состояния повреждён, начинаю с чистого: ${path}`);
      }
    }
  }

  entry(name) {
    this.data.searches[name] ??= { seen: [], apiUrl: null, sourceUrl: null, lastRun: null, notified: 0, baselined: false };
    const e = this.data.searches[name];
    e.seenSet ??= new Set(e.seen);
    return e;
  }

  isSeen(name, id) {
    return this.entry(name).seenSet.has(id);
  }

  markSeen(name, ids) {
    const e = this.entry(name);
    for (const id of ids) {
      if (!e.seenSet.has(id)) {
        e.seenSet.add(id);
        e.seen.push(id);
      }
    }
    if (e.seen.length > MAX_IDS_PER_SEARCH) {
      const dropped = e.seen.splice(0, e.seen.length - MAX_IDS_PER_SEARCH);
      for (const id of dropped) e.seenSet.delete(id);
    }
  }

  /**
   * Снята ли уже базовая линия по этому поиску.
   *
   * Считать по пустому списку просмотренных нельзя: поиск может какое-то время
   * вообще ничего не находить, и тогда первое же появившееся объявление ушло бы
   * в базу вместо уведомления.
   */
  isFirstRun(name) {
    const e = this.entry(name);
    if (e.baselined) return false;
    // В состоянии, записанном прошлой версией, этого поля нет — там признаком
    // служит непустой список просмотренных.
    return e.seen.length === 0;
  }

  markBaselined(name) {
    this.entry(name).baselined = true;
  }

  /**
   * Отдаёт разобранную ссылку API, только если она получена из той же ссылки поиска.
   * Поменял url в конфиге — кеш сбрасывается сам.
   */
  getApiUrl(name, sourceUrl) {
    const e = this.entry(name);
    if (!e.apiUrl) return null;
    if (sourceUrl && e.sourceUrl !== sourceUrl) return null;
    return e.apiUrl;
  }

  setApiUrl(name, apiUrl, sourceUrl = null) {
    const e = this.entry(name);
    e.apiUrl = apiUrl;
    e.sourceUrl = apiUrl ? sourceUrl : null;
  }

  touch(name, notifiedCount = 0) {
    const e = this.entry(name);
    e.lastRun = new Date().toISOString();
    e.notified += notifiedCount;
  }

  forget(name) {
    delete this.data.searches[name];
  }

  save() {
    const plain = { searches: {} };
    for (const [name, e] of Object.entries(this.data.searches)) {
      plain.searches[name] = {
        seen: e.seen,
        baselined: Boolean(e.baselined),
        apiUrl: e.apiUrl,
        sourceUrl: e.sourceUrl ?? null,
        lastRun: e.lastRun,
        notified: e.notified ?? 0,
      };
    }
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(plain, null, 2), "utf8");
    renameSync(tmp, this.path);
  }
}
