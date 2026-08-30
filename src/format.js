import { adArea, adRooms, adFloor } from "./filters.js";

export function shortFacts(ad) {
  const bits = [];
  const rooms = adRooms(ad);
  const area = adArea(ad);
  const floor = adFloor(ad);
  const totalFloors = ad.params?.total_floors?.label;

  if (rooms != null) bits.push(`${rooms}к`);
  if (area != null) bits.push(`${area} м²`);
  if (floor != null) bits.push(totalFloors ? `${floor}/${totalFloors} эт.` : `${floor} эт.`);
  if (ad.params?.commission) bits.push("без комиссии");
  return bits.join(" · ");
}

export function whereText(ad) {
  return [ad.location.city, ad.location.district].filter(Boolean).join(", ");
}

export function ageText(ad) {
  if (!ad.createdAt) return "";
  const min = Math.round((Date.now() - new Date(ad.createdAt).getTime()) / 60000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} ч назад`;
  return `${Math.round(h / 24)} дн назад`;
}

/** Однострочник для консоли и заголовка тоста. */
export function headline(ad) {
  const price = ad.price.label ?? "цена не указана";
  return `${price} — ${ad.title}`;
}

export function bodyLines(ad) {
  return [
    [whereText(ad), shortFacts(ad)].filter(Boolean).join(" · "),
    [ad.business ? "агентство" : "частное", ageText(ad)].filter(Boolean).join(" · "),
  ].filter(Boolean);
}

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Сообщение для Telegram (parse_mode: HTML). */
export function telegramHtml(ad, searchName) {
  const price = ad.price.label ?? "цена не указана";
  const facts = shortFacts(ad);
  const lines = [
    `<b>${esc(price)}</b>`,
    `<a href="${esc(ad.url)}">${esc(ad.title)}</a>`,
    "",
    [whereText(ad), facts].filter(Boolean).map(esc).join(" · "),
    `${ad.business ? "🏢 агентство" : "👤 частное"}${ad.userName ? ` · ${esc(ad.userName)}` : ""} · ${esc(ageText(ad))}`,
  ];
  if (searchName) lines.push(`\n<i>поиск: ${esc(searchName)}</i>`);
  return lines.filter((l) => l !== undefined).join("\n");
}
