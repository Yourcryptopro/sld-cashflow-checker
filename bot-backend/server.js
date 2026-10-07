import 'dotenv/config';
import express from 'express';

const app = express();
app.use(express.json());

const token = process.env.TELEGRAM_BOT_TOKEN;
const bookingUrl = process.env.CALL_BOOKING_URL || 'https://smartlivingdaily.io/call';
const webhookSecret = process.env.WEBHOOK_SECRET;
const port = process.env.PORT || 3000;

if (!token) console.warn('TELEGRAM_BOT_TOKEN fehlt. Der Server startet, kann aber keine Telegram-Nachrichten senden.');

function asNumber(value, fallback = 0) {
  const number = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(number) ? number : fallback;
}

function parseStartPayload(text = '') {
  const match = text.trim().match(/^\/start(?:\s+(.+))?$/i);
  if (!match) return null;
  const raw = match[1] || '';
  const normalized = raw.startsWith('?') ? raw.slice(1) : raw;
  const params = new URLSearchParams(normalized);
  const start = params.get('start') || (normalized.startsWith('cashflow_audit') ? 'cashflow_audit' : normalized);
  return { start, params };
}

function euro(value) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
}

function buildRecommendation(data) {
  const score = Math.round(asNumber(data.score, 0));
  const cashflow = asNumber(data.cashflow, 0);
  const ratio = asNumber(data.ratio, 0);
  const leakYear = asNumber(data.leak_year, 0);
  const debt = asNumber(data.debt, 0);
  const subs = asNumber(data.subs, 0);
  const insurance = asNumber(data.insurance, 0);
  const name = data.name ? ` ${data.name}` : '';

  const header = `🧭 *Dein SLD Cashflow-Audit${name}*\n\n` +
    `*Score:* ${score}%\n` +
    `*Fixkostenquote:* ${ratio.toFixed(1)}%\n` +
    `*Freier Cashflow:* ${euro(cashflow)} / Monat\n` +
    `*Rohrleck-Potenzial:* ${euro(leakYear)} / Jahr\n\n`;

  if (score >= 75) {
    return header +
      `🟢 *Starkes Uhrwerk – Wachstum & Hebel*\n\n` +
      `Deine Basis ist stabil. Jetzt geht es darum, den freien Cashflow bewusst zu steuern statt ihn nebenbei versickern zu lassen.\n\n` +
      `*Deine nächsten 3 Schritte:*\n` +
      `1. Richte einen automatischen Invest-Transfer direkt nach Gehaltseingang ein.\n` +
      `2. Prüfe, wie du Kartenausgaben gezielt für Meilen, Cashback oder Reisevorteile nutzt.\n` +
      `3. Plane einen optionalen 1:1 Call mit dem SLD Team für Assetaufbau und Hebel-Strategie.`;
  }

  if (score >= 50) {
    const leakHint = leakYear > 0 ? ` Dein Audit zeigt rund ${euro(leakYear)} jährliches Einsparpotenzial.` : '';
    return header +
      `🟡 *Solides Fundament mit Lecks – jetzt strukturieren*\n\n` +
      `Du bist nicht weit weg von einem stabilen System.${leakHint}\n\n` +
      `*Deine nächsten 3 Schritte:*\n` +
      `1. Prüfe zuerst Abos (${euro(subs)}/Monat) und Versicherungen (${euro(insurance)}/Monat) auf Kündigung, Wechsel oder bessere Konditionen.\n` +
      `2. Baue deine liquide Reserve automatisiert auf mindestens drei Monatsausgaben auf.\n` +
      `3. Mache einen 1:1 Call mit dem SLD Team aus, damit wir deine größten Hebel priorisieren und einen klaren Umsetzungsplan bauen.`;
  }

  const debtHint = debt > 0 ? ` Deine Kredit- und Ratenbelastung liegt bei ${euro(debt)} pro Monat.` : '';
  return header +
    `🔴 *Kritischer Handlungsbedarf – Cashflow zuerst stabilisieren*\n\n` +
    `Deine Fixkosten belasten dein System zu stark.${debtHint}\n\n` +
    `*Deine nächsten 3 Schritte:*\n` +
    `1. Stoppe neue Ratenkäufe und priorisiere teure Schulden bzw. Dispo.\n` +
    `2. Erstelle innerhalb von 48 Stunden eine Liste aller fixen Verträge und markiere Kündigungs- oder Wechselkandidaten.\n` +
    `3. Mache jetzt einen 1:1 Call mit dem SLD Team aus – wir sortieren gemeinsam die Reihenfolge der Maßnahmen und bauen einen machbaren Entlastungsplan.`;
}

async function telegram(method, body) {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN fehlt');
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!result.ok) throw new Error(result.description || 'Telegram API Fehler');
  return result.result;
}

app.get('/health', (req, res) => res.json({ ok: true, service: 'sld-concierge-bot' }));

app.post('/telegram/webhook', async (req, res) => {
  if (webhookSecret && req.get('x-telegram-bot-api-secret-token') !== webhookSecret) {
    return res.sendStatus(401);
  }

  res.sendStatus(200);
  const message = req.body?.message;
  if (!message?.text || !message?.chat?.id) return;

  const parsed = parseStartPayload(message.text);
  if (!parsed) return;

  if (!parsed.start || parsed.start === 'start') {
    await telegram('sendMessage', {
      chat_id: message.chat.id,
      text: '🧭 Willkommen bei Alfred, deinem SLD Concierge. Starte den Cashflow-Check auf der Website und sende mir anschließend dein Ergebnis – dann erhältst du konkrete nächste Schritte.',
      reply_markup: { inline_keyboard: [[{ text: 'Cashflow-Check öffnen', url: 'https://yourcryptopro.github.io/sld-cashflow-checker/' }]] }
    });
    return;
  }

  if (parsed.start !== 'cashflow_audit') return;

  const data = Object.fromEntries(parsed.params.entries());
  const text = buildRecommendation(data);
  await telegram('sendMessage', {
    chat_id: message.chat.id,
    text,
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [[{ text: '📅 1:1 Call mit SLD Team ausmachen', url: bookingUrl }]]
    }
  });
});

app.listen(port, () => console.log(`SLD Concierge Bot läuft auf Port ${port}`));
