/**
 * Дополнительные фильтры поверх тех, что уже заданы в самой ссылке OLX.
 * Нужны для того, чего на сайте нет: стоп-слова, отсев агентств и т.п.
 */

const ROOM_WORDS = {
  odnokomnatnye: 1, dvuhkomnatnye: 2, tryohkomnatnye: 3, chetyryohkomnatnye: 4,
  one: 1, two: 2, three: 3, four: 4,
};

function num(x) {
  if (x === null || x === undefined || x === "") return null;
  const n = Number(String(x).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function adArea(ad) {
  const p = ad.params?.total_area;
  if (!p) return null;
  return num(p.key) ?? num(String(p.label ?? "").replace(/[^\d.,]/g, ""));
}

export function adRooms(ad) {
  const p = ad.params?.number_of_rooms_string;
  if (!p) return null;
  if (p.key && ROOM_WORDS[p.key] !== undefined) return ROOM_WORDS[p.key];
  const m = String(p.label ?? "").match(/\d+/);
  return m ? Number(m[0]) : null;
}

export function adFloor(ad) {
  return num(ad.params?.floor?.key ?? ad.params?.floor?.label);
}

function hasWord(haystack, needles) {
  const h = haystack.toLowerCase();
  return needles.some((w) => h.includes(String(w).toLowerCase()));
}

function matchesAny(value, list) {
  if (!value) return false;
  const v = String(value).toLowerCase();
  return list.some((x) => v.includes(String(x).toLowerCase()));
}

/**
 * @returns {{ ok: boolean, reason?: string }}
 */
export function passesFilters(ad, f = {}) {
  const text = `${ad.title}\n${ad.description}`;

  if (f.skipPromoted && ad.promoted) return { ok: false, reason: "промо-объявление" };
  if (f.skipAgencies && ad.business) return { ok: false, reason: "агентство/бизнес-аккаунт" };

  if (f.noCommission && !ad.params?.commission) {
    return { ok: false, reason: "не отмечено «без комиссии»" };
  }

  const price = ad.price?.value;
  if (f.priceMin != null && (price == null || price < f.priceMin)) {
    return { ok: false, reason: `цена ${price ?? "?"} < ${f.priceMin}` };
  }
  if (f.priceMax != null && (price == null || price > f.priceMax)) {
    return { ok: false, reason: `цена ${price ?? "?"} > ${f.priceMax}` };
  }

  const area = adArea(ad);
  if (f.areaMin != null && (area == null || area < f.areaMin)) {
    return { ok: false, reason: `площадь ${area ?? "?"} < ${f.areaMin}` };
  }
  if (f.areaMax != null && (area == null || area > f.areaMax)) {
    return { ok: false, reason: `площадь ${area ?? "?"} > ${f.areaMax}` };
  }

  if (Array.isArray(f.rooms) && f.rooms.length) {
    const rooms = adRooms(ad);
    if (rooms == null || !f.rooms.includes(rooms)) {
      return { ok: false, reason: `комнат: ${rooms ?? "не указано"}` };
    }
  }

  if (f.floorMin != null || f.floorMax != null) {
    const fl = adFloor(ad);
    if (f.floorMin != null && (fl == null || fl < f.floorMin)) {
      return { ok: false, reason: `этаж ${fl ?? "?"} < ${f.floorMin}` };
    }
    if (f.floorMax != null && (fl == null || fl > f.floorMax)) {
      return { ok: false, reason: `этаж ${fl ?? "?"} > ${f.floorMax}` };
    }
  }

  if (Array.isArray(f.districts) && f.districts.length) {
    const where = `${ad.location.district ?? ""} ${ad.location.city ?? ""}`;
    if (!matchesAny(where, f.districts)) {
      return { ok: false, reason: `район «${ad.location.district ?? "?"}» не в списке` };
    }
  }
  if (Array.isArray(f.excludeDistricts) && f.excludeDistricts.length) {
    if (matchesAny(ad.location.district, f.excludeDistricts)) {
      return { ok: false, reason: `район «${ad.location.district}» исключён` };
    }
  }

  if (Array.isArray(f.includeAny) && f.includeAny.length && !hasWord(text, f.includeAny)) {
    return { ok: false, reason: "нет ни одного нужного слова" };
  }
  if (Array.isArray(f.excludeAny) && f.excludeAny.length && hasWord(text, f.excludeAny)) {
    const hit = f.excludeAny.find((w) => text.toLowerCase().includes(String(w).toLowerCase()));
    return { ok: false, reason: `стоп-слово «${hit}»` };
  }

  if (f.maxAgeMinutes != null && ad.createdAt) {
    const ageMin = (Date.now() - new Date(ad.createdAt).getTime()) / 60000;
    if (ageMin > f.maxAgeMinutes) {
      return { ok: false, reason: `объявлению ${Math.round(ageMin / 60)} ч — старее лимита` };
    }
  }

  return { ok: true };
}
