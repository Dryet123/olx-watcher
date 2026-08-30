const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * GET с ретраями и экспоненциальным backoff.
 * OLX иногда отдаёт 403/429 — тогда ждём и пробуем снова.
 */
export async function httpGet(url, opts = {}) {
  const {
    accept = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    lang = "uk,ru;q=0.9,en;q=0.8",
    timeoutMs = 25000,
    retries = 3,
    json = false,
  } = opts;

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(Math.min(30000, 1500 * 2 ** (attempt - 1)));
    try {
      const res = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "User-Agent": UA,
          Accept: json ? "application/json, text/plain, */*" : accept,
          "Accept-Language": lang,
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
        // 4xx кроме 408/429 повторять смысла нет
        if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
          throw lastErr;
        }
        continue;
      }
      return json ? await res.json() : await res.text();
    } catch (err) {
      lastErr = err;
      if (err instanceof Error && /HTTP 4\d\d/.test(err.message) && !/HTTP (408|429)/.test(err.message)) {
        throw err;
      }
    }
  }
  throw lastErr ?? new Error(`Не удалось загрузить ${url}`);
}

export { sleep };
