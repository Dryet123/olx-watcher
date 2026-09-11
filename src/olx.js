import { httpGet } from "./http.js";

/**
 * OLX отдаёт страницу поиска с JSON-состоянием внутри:
 *   window.__PRERENDERED_STATE__= "{\"listing\":{...}}"
 * Значение — JSON-строка, внутри которой ещё один JSON.
 */
export function extractPrerenderedState(html) {
  const key = "__PRERENDERED_STATE__=";
  const start = html.indexOf(key);
  if (start === -1) return null;

  let i = start + key.length;
  while (i < html.length && html[i] !== '"') i++;
  if (i >= html.length) return null;

  let j = i + 1;
  while (j < html.length) {
    if (html[j] === "\\") { j += 2; continue; }
    if (html[j] === '"') break;
    j++;
  }
  if (j >= html.length) return null;

  try {
    return JSON.parse(JSON.parse(html.slice(i, j + 1)));
  } catch {
    return null;
  }
}

/**
 * Превращает обычную ссылку поиска OLX (любая страна, любые фильтры)
 * в ссылку внутреннего JSON API со всеми уже применёнными фильтрами.
 * Возвращает { apiUrl, total, origin }.
 */
export async function resolveSearch(searchUrl) {
  const parsed = new URL(searchUrl);

  // Уже готовая ссылка на API — используем как есть.
  if (parsed.pathname.includes("/api/v1/offers")) {
    return { apiUrl: normalizeApiUrl(parsed.toString()), total: null, origin: parsed.origin };
  }

  const html = await httpGet(searchUrl, { lang: langForHost(parsed.host) });
  const state = extractPrerenderedState(html);
  const self = state?.listing?.listing?.links?.self;

  if (!self) {
    throw new Error(
      `Не удалось разобрать страницу поиска: ${searchUrl}\n` +
      `Проверь, что ссылка ведёт на список объявлений OLX (а не на конкретное объявление).`
    );
  }

  return {
    apiUrl: normalizeApiUrl(self),
    total: state.listing.listing.totalElements ?? null,
    origin: parsed.origin,
  };
}

/** Убирает пагинацию и принудительно ставит сортировку «сначала новые». */
function normalizeApiUrl(apiUrl) {
  const u = new URL(apiUrl);
  u.searchParams.delete("offset");
  u.searchParams.delete("limit");
  u.searchParams.set("sort_by", "created_at:desc");
  return u.toString();
}

function langForHost(host) {
  if (host.endsWith(".ua")) return "uk,ru;q=0.9,en;q=0.8";
  if (host.endsWith(".pl")) return "pl,en;q=0.8";
  if (host.endsWith(".ro")) return "ro,en;q=0.8";
  if (host.endsWith(".bg")) return "bg,en;q=0.8";
  if (host.endsWith(".kz")) return "ru,en;q=0.8";
  if (host.endsWith(".pt")) return "pt,en;q=0.8";
  return "en;q=0.9";
}

/** Забирает свежие объявления через JSON API. */
export async function fetchOffers(apiUrl, { limit = 40, offset = 0 } = {}) {
  const u = new URL(apiUrl);
  u.searchParams.set("limit", String(limit));
  u.searchParams.set("offset", String(offset));

  const data = await httpGet(u.toString(), { json: true, lang: langForHost(u.host) });
  if (!Array.isArray(data?.data)) {
    throw new Error("API OLX вернул неожиданный ответ (нет поля data)");
  }

  const promoted = new Set(data.metadata?.promoted ?? []);
  return normalizeMany(data.data, (ad, idx) => normalizeApiAd(ad, promoted.has(idx)));
}

/** Резервный путь: парсим объявления прямо из HTML страницы поиска. */
export async function fetchOffersViaHtml(searchUrl) {
  const u = new URL(searchUrl);
  u.searchParams.set("search[order]", "created_at:desc");

  const html = await httpGet(u.toString(), { lang: langForHost(u.host) });
  const state = extractPrerenderedState(html);
  const ads = state?.listing?.listing?.ads;
  if (!Array.isArray(ads)) throw new Error("Не удалось получить объявления из HTML");

  const promoted = new Set(state.listing.listing.metaData?.promoted ?? []);
  return normalizeMany(ads, (ad, idx) => normalizeStateAd(ad, promoted.has(idx)));
}

/**
 * Одно объявление неожиданной формы не должно стоить нам всей выдачи:
 * пропускаем такое и берём остальные.
 */
function normalizeMany(items, normalize) {
  const out = [];
  let broken = 0;
  items.forEach((item, idx) => {
    try {
      out.push(normalize(item, idx));
    } catch {
      broken++;
    }
  });
  if (broken) console.warn(`⚠ Пропущено объявлений неожиданного вида: ${broken}`);
  return out;
}

const PHOTO_SIZE = "600x800";

/**
 * Фото приходит по-разному: строкой, объектом со ссылкой, объектом с одним
 * именем файла. Раньше объект без поля link улетал в replace и ронял весь
 * проход — из-за одной картинки терялась вся выдача.
 */
function photoUrl(photo) {
  if (!photo) return null;

  let link = typeof photo === "string" ? photo : photo.link ?? photo.url ?? null;

  if (typeof link !== "string" && typeof photo?.filename === "string") {
    link = `https://ireland.apollo.olxcdn.com:443/v1/files/${photo.filename}/image;s={width}x{height}`;
  }
  if (typeof link !== "string") return null;

  return link.replace("{width}x{height}", PHOTO_SIZE);
}

/** Объект из /api/v1/offers (snake_case). */
function normalizeApiAd(ad, promotedByIndex) {
  const params = {};
  for (const p of ad.params ?? []) {
    const v = p.value ?? {};
    params[p.key] = {
      name: p.name,
      label: v.label ?? null,
      key: v.key ?? null,
      raw: v,
    };
  }

  const priceVal = params.price?.raw ?? {};

  return {
    id: String(ad.id),
    url: ad.url,
    title: ad.title ?? "",
    description: ad.description ?? "",
    createdAt: ad.created_time ?? null,
    refreshedAt: ad.last_refresh_time ?? null,
    price: {
      value: typeof priceVal.value === "number" ? priceVal.value : null,
      currency: priceVal.currency ?? null,
      label: priceVal.label ?? null,
      negotiable: Boolean(priceVal.negotiable),
    },
    location: {
      city: ad.location?.city?.name ?? null,
      district: ad.location?.district?.name ?? null,
      region: ad.location?.region?.name ?? null,
    },
    params,
    business: Boolean(ad.business),
    promoted: promotedByIndex || Boolean(ad.promotion?.top_ad),
    userName: ad.user?.name ?? null,
    photo: photoUrl(ad.photos?.[0]),
  };
}

/** Объект из __PRERENDERED_STATE__ (camelCase, другая форма price/params). */
function normalizeStateAd(ad, promotedByIndex) {
  const params = {};
  for (const p of ad.params ?? []) {
    params[p.key] = {
      name: p.name,
      label: p.value ?? null,
      key: p.normalizedValue ?? null,
      raw: p,
    };
  }

  const rp = ad.price?.regularPrice ?? {};

  return {
    id: String(ad.id),
    url: ad.url,
    title: ad.title ?? "",
    description: ad.description ?? "",
    createdAt: ad.createdTime ?? null,
    refreshedAt: ad.lastRefreshTime ?? null,
    price: {
      value: typeof rp.value === "number" ? rp.value : null,
      currency: rp.currencyCode ?? null,
      label: ad.price?.displayValue ?? null,
      negotiable: Boolean(rp.negotiable),
    },
    location: {
      city: ad.location?.cityName ?? null,
      district: ad.location?.districtName ?? null,
      region: ad.location?.regionName ?? null,
    },
    params,
    business: Boolean(ad.isBusiness),
    promoted: promotedByIndex || Boolean(ad.isPromoted),
    userName: ad.user?.name ?? null,
    photo: photoUrl(ad.photos?.[0]),
  };
}
