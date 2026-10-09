import 'dotenv/config';
import express from 'express';
import { randomBytes } from 'node:crypto';
import { createClient } from 'redis';

const app = express();
app.use(express.json({ limit: '16kb' }));
const token = process.env.TELEGRAM_BOT_TOKEN;
const bookingUrl = process.env.CALL_BOOKING_URL || 'https://smartlivingdaily.io/call';
const webhookSecret = process.env.WEBHOOK_SECRET;
const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://yourcryptopro.github.io';
const port = process.env.PORT || 3000;
const AUDIT_TTL_SECONDS = 30 * 60;
const redisUrl = process.env.REDIS_URL;

const redis = redisUrl ? createClient({ url: redisUrl }) : null;
if (redis) {
  redis.on('error', (error) => console.error('Redis connection error:', error.message));
  await redis.connect();
} else {
  console.error('REDIS_URL fehlt. Audit-Endpunkt wird nicht verfügbar sein, bis Redis eingerichtet ist.');
}

app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && origin !== allowedOrigin) return res.sendStatus(403);
  if (origin) {
    res.set('Access-Control-Allow-Origin', allowedOrigin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function cleanAudit(input) {
  const c = input?.costs || {};
  const keys = ['housing','mobility','insurance','subs','groceries','debt','other'];
  const costs = Object.fromEntries(keys.map(k => [k, Math.max(0, Math.min(10000000, num(c[k])))]));
  const score = Math.round(Math.max(0, Math.min(100, num(input?.score))));
  const cashflow = Math.max(-10000000, Math.min(10000000, num(input?.cashflow)));
  const ratio = Math.max(0, Math.min(1000, num(input?.ratio)));
  const leak_year = Math.max(0, Math.min(10000000, num(input?.leak_year)));
  const card = Math.max(0, Math.min(10000000, num(input?.card)));
  const reserve = Math.max(0, Math.min(100000000, num(input?.reserve)));
  if (!input || !Number.isFinite(Number(input.score)) || !Number.isFinite(Number(input.cashflow)) || !Number.isFinite(Number(input.ratio))) throw new Error('Invalid audit values');
  return { score, cashflow, ratio, leak_year, costs, card, reserve };
}
function euro(value) {
  return new Intl.NumberFormat('de-DE', { style:'currency', currency:'EUR', maximumFractionDigits:0 }).format(value);
}
function recommendation(a) {
  const header = `🧭 *Dein SLD Cashflow-Audit*\n\n*Score:* ${a.score}%\n*Fixkostenquote:* ${a.ratio.toFixed(1)}%\n*Freier Cashflow:* ${euro(a.cashflow)} / Monat\n*Modellhaftes Rohrleck-Potenzial:* ${euro(a.leak_year)} / Jahr\n\n`;
  if (a.score >= 75) return header + `🟢 *Starkes Uhrwerk – Wachstum & Hebel*\n\nDeine Kennzahlen deuten auf eine solide Basis hin.\n\n*Deine nächsten Schritte:*\n1. Prüfe, ob ein automatischer Transfer in Rücklagen oder langfristige Anlagen zu deinem Risikoprofil passt.\n2. Prüfe Gebühren und Konditionen deiner Karte, bevor du Prämien optimierst.\n3. Optional: Besprich im 1:1 Call mit dem SLD Team, welche nächsten Schritte zu deinen Zielen passen.`;
  if (a.score >= 50) return header + `🟡 *Solides Fundament – jetzt optimieren*\n\nDas Audit deutet auf mögliche Optimierungsfelder hin.\n\n*Deine nächsten Schritte:*\n1. Prüfe Abos (${euro(a.costs.subs)}/Monat) und Versicherungen (${euro(a.costs.insurance)}/Monat) auf Bedarf, Leistungen und Konditionen.\n2. Lege ein realistisches monatliches Sparziel für deine liquide Reserve fest.\n3. Vereinbare einen 1:1 Call mit dem SLD Team, um die größten Hebel zu priorisieren.`;
  return header + `🔴 *Cashflow zuerst stabilisieren*\n\nDer Score signalisiert, dass eine genauere Prüfung sinnvoll ist. Das Audit ist eine grobe Orientierung, keine individuelle Finanzberatung.\n\n*Deine nächsten Schritte:*\n1. Erfasse alle Einnahmen und verpflichtenden Ausgaben vollständig; prüfe besonders teure Ratenverpflichtungen.\n2. Pausiere neue nicht notwendige Ratenkäufe, bis du den monatlichen Spielraum kennst.\n3. Vereinbare zeitnah einen 1:1 Call mit dem SLD Team, um einen realistischen Entlastungsplan zu besprechen.`;
}
async function telegram(method, body) {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN fehlt');
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body) });
  const result = await response.json();
  if (!result.ok) throw new Error(result.description || 'Telegram API error');
  return result.result;
}
app.get('/health', (req,res) => res.json({ok:true,service:'sld-concierge-bot',auditStore:redis?.isReady?'redis':'unavailable'}));
app.post('/api/audits', async (req,res) => {
  try {
    if (!redis?.isReady) return res.status(503).json({error:'Audit-Speicher ist noch nicht bereit. Bitte später erneut versuchen.'});
    const audit = cleanAudit(req.body);
    const id = randomBytes(12).toString('base64url');
    await redis.set(`audit:${id}`, JSON.stringify(audit), { EX: AUDIT_TTL_SECONDS, NX: true });
    res.status(201).json({ startPayload:`audit_${id}` });
  } catch (error) { res.status(400).json({error:error.message || 'Invalid audit'}); }
});
app.post('/telegram/webhook', async (req,res) => {
  if (webhookSecret && req.get('x-telegram-bot-api-secret-token') !== webhookSecret) return res.sendStatus(401);
  const message = req.body?.message;
  if (!message?.text || !message?.chat?.id) return res.sendStatus(200);
  const match = message.text.trim().match(/^\/start(?:\s+([A-Za-z0-9_-]{1,64}))?/);
  if (!match) return res.sendStatus(200);
  res.sendStatus(200);
  try {
    const payload = match[1] || '';
    if (payload.startsWith('audit_')) {
      if (!redis?.isReady) {
        await telegram('sendMessage',{chat_id:message.chat.id,text:'Der Audit-Speicher ist gerade nicht erreichbar. Bitte starte den Check erneut.'});
        return;
      }
      const id = payload.slice('audit_'.length);
      const raw = await redis.getDel(`audit:${id}`);
      if (!raw) {
        await telegram('sendMessage',{chat_id:message.chat.id,text:'Dieser Audit-Link ist abgelaufen oder wurde bereits verwendet. Bitte erstelle den Check auf der Website erneut.'});
        return;
      }
      const audit = JSON.parse(raw);
      await telegram('sendMessage',{chat_id:message.chat.id,text:recommendation(audit),parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'📅 1:1 Call mit SLD Team ausmachen',url:bookingUrl}]]},disable_web_page_preview:true});
      return;
    }
    if (payload.startsWith('cashflow_audit')) {
      await telegram('sendMessage',{chat_id:message.chat.id,text:'Bitte öffne den Cashflow-Check auf der Website und nutze dort „Ergebnis an Alfred senden“. So kann ich dein persönliches Ergebnis abrufen.'});
      return;
    }
    await telegram('sendMessage',{chat_id:message.chat.id,text:'🧭 Willkommen bei Alfred, deinem SLD Concierge. Erstelle zuerst deinen Cashflow-Check auf der Website und sende das Ergebnis hierher.'});
  } catch (error) { console.error('Telegram update failed:',error); }
});
app.listen(port,()=>console.log(`SLD Concierge Bot läuft auf Port ${port}`));
