import { telegramHtml } from "./format.js";

const API = "https://api.telegram.org/bot";
const POLL_TIMEOUT = 30; // секунд держим соединение открытым

const COMMANDS = [
  { command: "status", description: "Что сейчас происходит" },
  { command: "last", description: "Последние находки: /last 5" },
  { command: "check", description: "Проверить прямо сейчас" },
  { command: "pause", description: "Остановить слежение" },
  { command: "resume", description: "Включить слежение" },
  { command: "searches", description: "Список поисков" },
  { command: "on", description: "Включить поиск: /on 1" },
  { command: "off", description: "Выключить поиск: /off 1" },
  { command: "help", description: "Все команды" },
];

const HELP =
  "<b>Команды</b>\n\n" +
  "/status — слежу или нет, когда следующая проверка\n" +
  "/last — последние находки, можно указать сколько: /last 10\n" +
  "/check — проверить прямо сейчас\n" +
  "/pause — приостановить слежение\n" +
  "/resume — продолжить\n" +
  "/searches — список поисков с номерами\n" +
  "/on 1 — включить поиск №1\n" +
  "/off 1 — выключить поиск №1\n" +
  "/help — это сообщение";

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function whenText(iso) {
  if (!iso) return "неизвестно когда";
  const sec = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  if (sec <= 0) return "вот-вот";
  if (sec < 60) return `через ${sec} сек`;
  return `через ${Math.floor(sec / 60)} мин ${sec % 60} сек`;
}

/**
 * Бот с командами: тем же ботом, что шлёт уведомления, можно и управлять.
 * Работает на long polling — никаких webhook и внешних адресов не нужно.
 */
export class TelegramBot {
  constructor(watcher, { onConfigChange } = {}) {
    this.watcher = watcher;
    this.onConfigChange = onConfigChange;
    this.running = false;
    this.offset = 0;
    this.controller = null;
    this.warnedConflict = false;
  }

  get cfg() {
    return this.watcher.cfg.notifications.telegram ?? {};
  }

  get chatIds() {
    return this.cfg.chatIds ?? [];
  }

  /**
   * Незнакомому чату бот не отвечает — иначе любой посторонний узнавал бы,
   * что бот жив. Но в журнал пишем: так можно добавить свой второй аккаунт,
   * не открывая бота всем подряд. Каждый чат отмечаем один раз.
   */
  noteUnknownChat(chatId, chat) {
    this.seenUnknown ??= new Set();
    const key = String(chatId);
    if (this.seenUnknown.has(key)) return;
    this.seenUnknown.add(key);

    const who = [chat?.first_name, chat?.username && `@${chat.username}`].filter(Boolean).join(" ");
    this.log(
      `боту написал чат ${key}${who ? ` (${who})` : ""} — его нет в списке, ответа не даю. ` +
      "Если это твой аккаунт, добавь этот id в настройках через запятую.",
      "warn"
    );
  }

  /** Сообщить остальным подключённым чатам о том, что кто-то изменил состояние. */
  async announce(exceptChatId, text) {
    for (const id of this.chatIds) {
      if (String(id) === String(exceptChatId)) continue;
      await this.send(id, text);
    }
  }

  log(text, level = "info") {
    this.watcher.emit("log", { level, text: `Telegram: ${text}`, at: new Date().toISOString() });
  }

  async call(method, payload, { timeoutMs = 20000, signal } = {}) {
    const res = await fetch(`${API}${this.cfg.botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: signal ?? AbortSignal.timeout(timeoutMs),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) throw new Error(data.description ?? `HTTP ${res.status}`);
    return data.result;
  }

  send(chatId, text, extra = {}) {
    return this.call("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...extra,
    }).catch((err) => this.log(`не смог ответить: ${err.message}`, "warn"));
  }

  async start() {
    if (this.running) return;
    if (!this.cfg.enabled || !this.cfg.botToken) return;
    if (this.cfg.commandsEnabled === false) return;

    let me;
    try {
      me = await this.call("getMe", {});
    } catch (err) {
      this.log(`бот не запустился — ${err.message}`, "error");
      return;
    }

    this.running = true;
    this.log(`бот @${me.username} принимает команды.`);
    this.call("setMyCommands", { commands: COMMANDS }).catch(() => {});
    this.loop();
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.controller) this.controller.abort();
  }

  async loop() {
    while (this.running) {
      const startedAt = Date.now();
      try {
        this.controller = new AbortController();
        const updates = await this.call(
          "getUpdates",
          { offset: this.offset, timeout: POLL_TIMEOUT, allowed_updates: ["message"] },
          { signal: this.controller.signal }
        );

        this.warnedConflict = false;
        for (const u of updates) {
          this.offset = u.update_id + 1;
          if (u.message) await this.handleMessage(u.message).catch((err) => this.log(err.message, "warn"));
        }

        // Обычно Telegram держит соединение открытым до POLL_TIMEOUT. Если ответ
        // пришёл мгновенно и пустым (прокси не понял timeout), не крутимся вхолостую.
        if (!updates.length && Date.now() - startedAt < 1000) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      } catch (err) {
        if (!this.running) break;
        if (err.name === "AbortError" || err.name === "TimeoutError") continue;

        if (/Conflict/i.test(err.message)) {
          // Тем же токеном опрашивает кто-то ещё — второй экземпляр приложения.
          if (!this.warnedConflict) {
            this.log("тем же ботом уже кто-то управляет — команды могут теряться.", "warn");
            this.warnedConflict = true;
          }
        } else {
          this.log(`опрос сорвался (${err.message}), пробую снова.`, "warn");
        }
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  async handleMessage(msg) {
    const chatId = msg.chat?.id;
    const text = String(msg.text ?? "").trim();
    if (!chatId || !text.startsWith("/")) return;

    // Токен могут узнать посторонние, поэтому слушаемся только своих чатов.
    const allowed = this.chatIds.some((id) => String(id) === String(chatId));
    if (!allowed) {
      if (!this.chatIds.length) {
        await this.send(chatId,
          "Похоже, chat id ещё не настроен.\n\n" +
          `Твой chat id: <code>${esc(chatId)}</code>\n\n` +
          "Впиши его в настройках приложения — и бот начнёт слушаться команд.\n" +
          "Там можно указать несколько через запятую, если вас двое.");
      } else {
        this.noteUnknownChat(chatId, msg.chat);
      }
      return;
    }

    const [rawCmd, ...args] = text.split(/\s+/);
    const cmd = rawCmd.split("@")[0].slice(1).toLowerCase();

    switch (cmd) {
      case "start":
      case "help":
        return this.send(chatId, HELP);
      case "status":
        return this.cmdStatus(chatId);
      case "last":
        return this.cmdLast(chatId, args[0]);
      case "check":
        return this.cmdCheck(chatId);
      case "pause":
        this.watcher.stop();
        this.announce(chatId, "Слежение приостановил кто-то из вас. /resume — продолжить.");
        return this.send(chatId, "Слежение приостановлено. /resume — продолжить.");
      case "resume":
        this.watcher.start();
        this.announce(chatId, "Слежение снова включено.");
        return this.send(chatId, "Слежу дальше.");
      case "searches":
        return this.cmdSearches(chatId);
      case "on":
        return this.cmdToggle(chatId, args[0], true);
      case "off":
        return this.cmdToggle(chatId, args[0], false);
      default:
        return this.send(chatId, "Не знаю такой команды. /help — список.");
    }
  }

  cmdStatus(chatId) {
    const st = this.watcher.status;
    const lines = [];

    if (st.busy) lines.push("<b>Проверяю прямо сейчас…</b>");
    else if (st.running) lines.push(`<b>Слежу.</b> Следующая проверка ${whenText(st.nextRunAt)}.`);
    else lines.push("<b>Слежение остановлено.</b> /resume — включить.");

    if (st.lastError) lines.push(`\n⚠ ${esc(st.lastError)}`);

    lines.push("");
    for (const s of st.searches) {
      lines.push(
        `${s.enabled ? "🟢" : "⚪"} <b>${esc(s.name)}</b>\n` +
        `   просмотрено ${s.seen}, отправлено ${s.notified}`
      );
    }

    return this.send(chatId, lines.join("\n"));
  }

  async cmdLast(chatId, countArg) {
    const n = Math.min(20, Math.max(1, Number(countArg) || 5));
    const items = this.watcher.feed.slice(0, n);

    if (!items.length) {
      return this.send(chatId, "Пока ничего не нашлось. /status — что происходит.");
    }

    for (const item of items) {
      await this.send(chatId, this.feedItemHtml(item), { link_preview_options: { is_disabled: false } });
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  feedItemHtml(item) {
    return [
      `<b>${esc(item.price ?? "цена не указана")}</b>`,
      `<a href="${esc(item.url)}">${esc(item.title)}</a>`,
      "",
      esc([item.where, item.facts].filter(Boolean).join(" · ")),
      `${item.business ? "🏢 агентство" : "👤 частное"} · <i>${esc(item.searchName)}</i>`,
    ].join("\n");
  }

  async cmdCheck(chatId) {
    if (this.watcher.busy) return this.send(chatId, "Уже проверяю, погоди секунду.");

    await this.send(chatId, "Проверяю…");
    // Считаем по возвращённому числу, а не по приросту ленты: та упирается
    // в свой потолок, и на полной ленте прирост всегда был бы нулевым.
    const found = await this.watcher.runOnce();

    // Про сами находки уже прилетели отдельные уведомления — здесь только итог.
    return this.send(chatId, found > 0
      ? `Нашёл ${found} — они выше.`
      : "Ничего нового.");
  }

  cmdSearches(chatId) {
    const list = this.watcher.cfg.searches;
    if (!list.length) return this.send(chatId, "Ни одного поиска не настроено.");

    const lines = list.map((s, i) =>
      `${i + 1}. ${s.enabled ? "🟢" : "⚪"} <b>${esc(s.name)}</b>`
    );
    lines.push("\n/on 1 или /off 1 — включить или выключить.");
    return this.send(chatId, lines.join("\n"));
  }

  cmdToggle(chatId, indexArg, enabled) {
    const i = Number(indexArg) - 1;
    const search = this.watcher.cfg.searches[i];
    if (!search) {
      return this.send(chatId, "Нет поиска с таким номером. /searches — список.");
    }

    search.enabled = enabled;
    this.onConfigChange?.(this.watcher.cfg);
    const what = `${enabled ? "Включил" : "Выключил"} «${esc(search.name)}»`;
    this.announce(chatId, `${what} — это сделал кто-то из вас.`);
    return this.send(chatId, `${what}.`);
  }
}
