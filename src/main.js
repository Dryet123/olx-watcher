import { loadConfig, saveConfig, IS_EXE, APP_DIR } from "./config.js";
import { Store } from "./store.js";
import { Watcher } from "./engine.js";
import { startServer, openInBrowser } from "./server.js";
import { TelegramBot } from "./telegram-bot.js";
import { passesFilters } from "./filters.js";
import { headline, bodyLines } from "./format.js";
import { resolveSearch, fetchOffers, fetchOffersViaHtml } from "./olx.js";

const ts = () => new Date().toLocaleTimeString("ru-RU", { hour12: false });

function attachConsoleLog(watcher) {
  watcher.on("log", ({ level, text }) => {
    const prefix = { error: "✖", warn: "⚠", muted: " " }[level] ?? "·";
    console.log(`[${ts()}] ${prefix} ${text}`);
  });
}

function makeBot(watcher) {
  return new TelegramBot(watcher, {
    onConfigChange: (next) => saveConfig(next),
  });
}

/** Основной режим: локальный веб-интерфейс. */
async function runUi(cfg, watcher) {
  attachConsoleLog(watcher);
  const bot = makeBot(watcher);

  let started;
  try {
    started = await startServer(watcher, {
      port: cfg.uiPort,
      onConfigChange: () => { bot.stop(); bot.start(); },
    });
  } catch (err) {
    console.error(`\n✖ ${err.message}\n`);
    if (IS_EXE) {
      console.log("Окно закроется через 15 секунд.");
      await new Promise((r) => setTimeout(r, 15000));
    }
    process.exit(1);
  }

  console.log("\n  OLX Watcher");
  console.log(`  Интерфейс: ${started.url}`);
  console.log(`  Настройки и история: ${APP_DIR}`);
  console.log("  Закрыть это окно — остановить слежение.\n");

  if (cfg.openBrowser) openInBrowser(started.url);
  if (cfg.autoStart) watcher.start();
  bot.start();

  const shutdown = () => {
    console.log("\nОстанавливаюсь…");
    bot.stop();
    watcher.stop();
    watcher.store.save();
    started.server.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

/** Разовый показ того, что находится по фильтрам. Ничего не сохраняет. */
async function runTest(cfg) {
  for (const search of cfg.searches) {
    console.log(`\n=== ${search.name}${search.enabled ? "" : " (выключен)"}`);
    console.log(`    ${search.url}`);

    let ads;
    try {
      const { apiUrl } = await resolveSearch(search.url);
      ads = await fetchOffers(apiUrl, { limit: cfg.pageSize });
    } catch {
      try {
        ads = await fetchOffersViaHtml(search.url);
      } catch (err) {
        console.error(`    ✖ ${err.message}`);
        continue;
      }
    }

    let ok = 0;
    for (const ad of ads) {
      if (!passesFilters(ad, search.filters).ok) continue;
      ok++;
      console.log(`  ✔ ${headline(ad).slice(0, 78)}`);
      console.log(`      ${bodyLines(ad).join(" · ")}`);
      console.log(`      ${ad.url}`);
    }
    console.log(`    Итого: ${ok} из ${ads.length} проходят фильтры.`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args.find((a) => !a.startsWith("-")) ?? "ui";
  const verbose = args.includes("--verbose") || args.includes("-v");

  const cfg = loadConfig();
  const store = new Store();
  const watcher = new Watcher(cfg, store);

  switch (cmd) {
    case "ui":
      await runUi(cfg, watcher);
      break;

    case "watch": {
      attachConsoleLog(watcher);
      const bot = makeBot(watcher);
      watcher.start();
      bot.start();
      process.on("SIGINT", () => {
        bot.stop();
        watcher.stop();
        store.save();
        process.exit(0);
      });
      break;
    }

    case "once":
      attachConsoleLog(watcher);
      await watcher.runOnce({ verbose });
      break;

    case "test":
      await runTest(cfg);
      break;

    case "test-notify":
      attachConsoleLog(watcher);
      await watcher.deliver(
        {
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
        },
        "тест"
      );
      break;

    case "reset":
      for (const s of cfg.searches) store.forget(s.name);
      store.save();
      console.log("История просмотренных объявлений очищена.");
      break;

    default:
      console.log("Команды: ui (по умолчанию) | watch | once [-v] | test | test-notify | reset");
      process.exit(1);
  }
}

main().catch(async (err) => {
  console.error(`\n✖ ${err.message}\n`);
  if (IS_EXE) {
    console.log("Окно закроется через 15 секунд.");
    await new Promise((r) => setTimeout(r, 15000));
  }
  process.exit(1);
});
