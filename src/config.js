import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { CONFIG_PATH } from "./paths.js";

export { CONFIG_PATH, STATE_PATH, FEED_PATH, APP_DIR, IS_EXE } from "./paths.js";

export const DEFAULT_FILTERS = {
  priceMin: null,
  priceMax: null,
  areaMin: null,
  areaMax: null,
  floorMin: null,
  floorMax: null,
  rooms: [],
  districts: [],
  excludeDistricts: [],
  includeAny: [],
  excludeAny: [],
  skipPromoted: false,
  skipAgencies: false,
  noCommission: false,
  maxAgeMinutes: 2880,
};

/** Конфиг по умолчанию зашит в код — чтобы .exe работал без файлов рядом. */
export const DEFAULT_CONFIG = {
  intervalSeconds: 300,
  jitterSeconds: 45,
  pageSize: 40,
  notifyOnFirstRun: false,
  maxNotificationsPerRun: 10,
  uiPort: 8777,
  openBrowser: true,
  autoStart: true,
  notifications: {
    console: true,
    windowsToast: true,
    telegram: { enabled: false, botToken: "", chatIds: [], commandsEnabled: true },
  },
  // Пример, чтобы приложение запустилось сразу после установки.
  // Замени ссылку на свою: настрой фильтры на сайте OLX и скопируй адрес из строки браузера.
  searches: [
    {
      name: "Пример: аренда квартир в Киеве",
      enabled: true,
      url: "https://www.olx.ua/uk/nedvizhimost/kvartiry/dolgosrochnaya-arenda-kvartir/kiev/",
      filters: {
        ...DEFAULT_FILTERS,
        excludeAny: ["подобово", "посуточно", "почасово", "погодинно"],
      },
    },
  ],
};

/**
 * Chat id может прийти списком, строкой через запятую или одиночным старым
 * полем chatId — приводим всё к массиву строк без повторов.
 */
function normalizeChatIds(telegram) {
  const raw = [];
  const from = (v) => {
    if (Array.isArray(v)) raw.push(...v);
    else if (v !== null && v !== undefined) raw.push(...String(v).split(","));
  };
  from(telegram.chatIds);
  from(telegram.chatId); // конфиг прошлой версии

  const seen = new Set();
  const out = [];
  for (const x of raw) {
    const id = String(x).trim();
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** Приводит сырой объект к валидному конфигу. Бросает исключение с понятным текстом. */
export function normalizeConfig(raw) {
  const cfg = { ...DEFAULT_CONFIG, ...raw };

  cfg.intervalSeconds = Math.max(60, Number(cfg.intervalSeconds) || 300);
  cfg.jitterSeconds = Math.max(0, Number(cfg.jitterSeconds ?? 45));
  cfg.pageSize = Math.min(50, Math.max(5, Number(cfg.pageSize) || 40));
  cfg.uiPort = Number(cfg.uiPort) || 8777;
  cfg.notifyOnFirstRun = Boolean(cfg.notifyOnFirstRun);
  cfg.openBrowser = cfg.openBrowser !== false;
  cfg.autoStart = cfg.autoStart !== false;
  cfg.maxNotificationsPerRun = Math.max(1, Number(cfg.maxNotificationsPerRun) || 10);

  const n = { ...DEFAULT_CONFIG.notifications, ...(raw?.notifications ?? {}) };
  n.console = n.console !== false;
  n.windowsToast = n.windowsToast !== false;
  n.telegram = { enabled: false, botToken: "", chatIds: [], commandsEnabled: true, ...(n.telegram ?? {}) };
  n.telegram.enabled = Boolean(n.telegram.enabled);
  n.telegram.commandsEnabled = n.telegram.commandsEnabled !== false;
  n.telegram.botToken = String(n.telegram.botToken ?? "").trim();
  n.telegram.chatIds = normalizeChatIds(n.telegram);
  delete n.telegram.chatId;
  cfg.notifications = n;

  if (!Array.isArray(cfg.searches)) cfg.searches = [];

  const names = new Set();
  cfg.searches = cfg.searches.map((s, i) => {
    const url = String(s?.url ?? "").trim();
    if (!url) throw new Error(`Поиск #${i + 1}: не указана ссылка.`);
    if (!/^https?:\/\/[^/]*olx\./i.test(url)) {
      throw new Error(`Поиск #${i + 1}: ссылка должна вести на сайт OLX.`);
    }

    let name = String(s?.name ?? "").trim() || `Поиск ${i + 1}`;
    while (names.has(name)) name = `${name} (2)`;
    names.add(name);

    const filters = { ...DEFAULT_FILTERS, ...(s?.filters ?? {}) };
    for (const k of ["priceMin", "priceMax", "areaMin", "areaMax", "floorMin", "floorMax", "maxAgeMinutes"]) {
      const v = filters[k];
      filters[k] = v === null || v === undefined || v === "" ? null : Number(v);
      if (filters[k] !== null && !Number.isFinite(filters[k])) filters[k] = null;
    }
    for (const k of ["rooms", "districts", "excludeDistricts", "includeAny", "excludeAny"]) {
      filters[k] = Array.isArray(filters[k])
        ? filters[k].map((x) => (k === "rooms" ? Number(x) : String(x).trim())).filter((x) => x !== "" && !Number.isNaN(x))
        : [];
    }
    for (const k of ["skipPromoted", "skipAgencies", "noCommission"]) {
      filters[k] = Boolean(filters[k]);
    }

    return { name, url, enabled: s?.enabled !== false, filters };
  });

  return cfg;
}

export function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    saveConfig(DEFAULT_CONFIG);
    return normalizeConfig(DEFAULT_CONFIG);
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch (err) {
    throw new Error(`config.json — некорректный JSON: ${err.message}`);
  }
  return normalizeConfig(raw);
}

export function saveConfig(cfg) {
  const tmp = `${CONFIG_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(cfg, null, 2), "utf8");
  renameSync(tmp, CONFIG_PATH);
}
