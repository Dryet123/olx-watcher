/**
 * Сборка одного .exe.
 *
 * Схема: esbuild склеивает исходники в один CommonJS-файл, штатный механизм
 * Node (Single Executable Application) пакует его в blob, а postject вшивает
 * этот blob в копию node.exe. На выходе — самодостаточный файл, которому
 * не нужны ни Node, ни node_modules.
 */
import { build } from "esbuild";
import { inject } from "postject";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, rm, copyFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(ROOT, "build");
const DIST = join(ROOT, "dist");
const EXE = join(DIST, "OLX Watcher.exe");
const BUNDLE = join(BUILD, "bundle.cjs");
const BLOB = join(BUILD, "sea.blob");
const SEA_CONFIG = join(BUILD, "sea-config.json");

const FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1) + " МБ";

const SUBSYSTEM_CONSOLE = 3;
const SUBSYSTEM_GUI = 2;

/**
 * node.exe собран как консольное приложение, поэтому Windows открывает при
 * запуске чёрное окно. В заголовке PE есть поле Subsystem — переключаем его
 * на оконное, и окна не появляется вовсе. Управление уходит в значок трея,
 * а логи видно в журнале интерфейса.
 */
async function makeWindowsGui(exePath) {
  const buf = await readFile(exePath);

  const peOffset = buf.readUInt32LE(0x3c);
  if (buf.toString("ascii", peOffset, peOffset + 4) !== "PE\0\0") {
    throw new Error("не нашёл заголовок PE — файл повреждён?");
  }

  // Optional header идёт следом за COFF-заголовком (24 байта), Subsystem — его 68-й байт.
  const at = peOffset + 24 + 68;
  const current = buf.readUInt16LE(at);

  if (current === SUBSYSTEM_GUI) return "уже оконный";
  if (current !== SUBSYSTEM_CONSOLE) {
    throw new Error(`неожиданное значение Subsystem: ${current}`);
  }

  buf.writeUInt16LE(SUBSYSTEM_GUI, at);
  await writeFile(exePath, buf);
  return "готово, консольного окна не будет";
}

async function step(label, fn) {
  process.stdout.write(`  ${label}… `);
  const result = await fn();
  console.log(result ?? "готово");
  return result;
}

async function main() {
  console.log("\nСборка OLX Watcher\n");

  await rm(BUILD, { recursive: true, force: true });
  await mkdir(BUILD, { recursive: true });
  await mkdir(DIST, { recursive: true });

  await step("склеиваю исходники", async () => {
    await build({
      entryPoints: [join(ROOT, "src", "main.js")],
      bundle: true,
      platform: "node",
      target: "node20",
      format: "cjs",
      outfile: BUNDLE,
      legalComments: "none",
      // Приложение должно знать, что работает как .exe: конфиг и состояние
      // берутся из папки рядом с ним, а не из папки с исходниками.
      define: { "globalThis.__OLX_SEA__": "true" },
      // Ветка с import.meta нужна только при запуске из исходников;
      // в сборке она недостижима, предупреждение о ней — шум.
      logOverride: { "empty-import-meta": "silent" },
    });
    const { size } = await stat(BUNDLE);
    return `${mb(size)}`;
  });

  await step("готовлю blob", async () => {
    await writeFile(
      SEA_CONFIG,
      JSON.stringify({
        main: BUNDLE,
        output: BLOB,
        disableExperimentalSEAWarning: true,
        useSnapshot: false,
        useCodeCache: true,
      }),
      "utf8"
    );
    execFileSync(process.execPath, ["--experimental-sea-config", SEA_CONFIG], { stdio: "pipe" });
    const { size } = await stat(BLOB);
    return `${mb(size)}`;
  });

  await step("копирую движок Node", async () => {
    await rm(EXE, { force: true });
    await copyFile(process.execPath, EXE);
    const { size } = await stat(EXE);
    return `${mb(size)}`;
  });

  await step("вшиваю приложение в exe", async () => {
    await inject(EXE, "NODE_SEA_BLOB", await readFile(BLOB), {
      sentinelFuse: FUSE,
      machoSegmentName: undefined,
    });
    const { size } = await stat(EXE);
    return `${mb(size)}`;
  });

  await step("делаю exe оконным", async () => makeWindowsGui(EXE));

  console.log(`\nГотово: ${EXE}`);
  console.log("Запускать можно двойным кликом. config.json, state.json и feed.json");
  console.log("создадутся рядом с exe при первом запуске.\n");
}

main().catch((err) => {
  console.error(`\n✖ Сборка не удалась: ${err.message}\n`);
  process.exit(1);
});
