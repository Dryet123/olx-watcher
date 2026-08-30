import { telegramHtml } from "../format.js";

/**
 * Отправка в Telegram. Нужен бот (@BotFather) и хотя бы один chat id.
 * Уведомление уходит всем перечисленным чатам.
 */
export async function notifyTelegram(ad, searchName, cfg) {
  const { botToken, chatIds } = cfg;
  if (!botToken || !chatIds?.length) return;

  const text = telegramHtml(ad, searchName);
  const method = ad.photo ? "sendPhoto" : "sendMessage";

  for (const chatId of chatIds) {
    const payload = ad.photo
      ? { chat_id: chatId, photo: ad.photo, caption: text, parse_mode: "HTML" }
      : { chat_id: chatId, text, parse_mode: "HTML", link_preview_options: { is_disabled: false } };

    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20000),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) {
        console.warn(`⚠ Telegram отклонил сообщение для ${chatId}: ${data.description ?? res.status}`);
      }
    } catch (err) {
      // Один недоступный чат не должен мешать остальным получить уведомление.
      console.warn(`⚠ Не удалось отправить в Telegram (${chatId}): ${err.message}`);
    }
  }
}

/** Проверка настроек Telegram — используется командой test-notify. */
export async function telegramSelfTest(cfg) {
  const res = await fetch(`https://api.telegram.org/bot${cfg.botToken}/getMe`, {
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Токен бота не принят: ${data.description ?? res.status}`);
  return data.result.username;
}
