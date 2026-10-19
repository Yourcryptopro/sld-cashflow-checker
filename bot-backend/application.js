import { randomBytes } from 'node:crypto';

const SUPPORT_ID = 2036418188;
const TTL = 86400;
const questions = [
  'Was möchtest du mit unserer Unterstützung konkret erreichen?',
  'Warum willst du gerade jetzt dabei sein?',
  'Was bist du bereit, an Zeit und eigenem Einsatz einzubringen?'
];
const intro = '🚀 Der Smart Living Daily Inner Circle\n\nDu möchtest nicht nur Tipps sammeln, sondern konkret etwas verändern? Im Inner Circle arbeiten wir gemeinsam an deinen persönlichen Zielen – mit engerer Begleitung durch das SLD-Team und Austausch mit anderen Mitgliedern.\n\nIm Mittelpunkt steht die Umsetzung: klare nächste Schritte, gegenseitige Unterstützung und dein eigener aktiver Beitrag.\n\n📝 Deine Bewerbung bleibt hier bei Alfred. Beantworte drei Fragen und prüfe danach deine Antworten. Erst mit „Bewerbung absenden“ werden alle Antworten und dein Telegram-Kontakt an unser Support-Team übermittelt. Deine Bewerbung ist noch keine Zusage.\n\nEntwürfe werden für maximal 24 Stunden gespeichert. Mit /abbrechen kannst du deinen Entwurf löschen.';

export function createApplications({ redis, telegram }) {
  const send = (chatId, text, buttons = []) => telegram('sendMessage', {
    chat_id: chatId, text, disable_web_page_preview: true,
    ...(buttons.length ? { reply_markup: { inline_keyboard: buttons } } : {})
  });
  const button = (text, data) => [{ text, callback_data: data }];
  const save = (key, state) => redis.set(key, JSON.stringify(state), { EX: TTL });
  const controls = (state) => [button('❌ Abbrechen', `ic:cancel:${state.id}`)];
  const ask = (chatId, state) => send(chatId,
    `Frage ${state.answers.length + 1} von 3\n\n${questions[state.answers.length]}\n\nBitte antworte als Text (maximal 700 Zeichen).`, controls(state));
  const review = (chatId, state) => send(chatId,
    '📝 Deine Bewerbung\n\n' + questions.map((q, i) => `${i + 1}. ${q}\n${state.answers[i]}`).join('\n\n') +
    '\n\nBeim Absenden erhält @SmartLivingSupport deine drei Antworten und deinen Telegram-Kontakt. Möchtest du diese Bewerbung absenden?', [
      button('✅ Bewerbung absenden', `ic:submit:${state.id}`),
      button('✏️ Antworten neu bearbeiten', `ic:edit:${state.id}`),
      ...controls(state)
    ]);

  return async function handleApplication(update) {
    const callback = update?.callback_query;
    const message = update?.message;
    const chat = callback?.message?.chat || message?.chat;
    const user = callback?.from || message?.from;
    if (!chat || chat.type !== 'private' || !user || user.is_bot) return false;
    const data = callback?.data || '';
    const isApplication = data === 'sld_application' || data.startsWith('ic:');
    const command = message?.text?.trim() || '';
    if (callback && !isApplication) return false;
    if (!redis?.isReady) {
      if (!isApplication) return false;
      await telegram('answerCallbackQuery', { callback_query_id: callback.id });
      await send(chat.id, 'Die Bewerbung ist gerade nicht verfügbar. Bitte versuche es später erneut.');
      return true;
    }
    const key = `ic:draft:${user.id}`;
    if (!callback && /^\/(start|menu)(?:@\w+)?(?:\s|$)/i.test(command)) return false;
    let raw = await redis.get(key);
    if (!callback && !raw && !/^\/(abbrechen|cancel)$/i.test(command)) return false;
    const lockKey = `ic:lock:${user.id}`;
    const lockId = randomBytes(16).toString('hex');
    const locked = await redis.set(lockKey, lockId, { NX: true, EX: 90 });
    if (!locked) throw new Error('Application conversation busy; retry update');
    try {
      const seenKey = Number.isSafeInteger(update.update_id) ? `ic:update:${update.update_id}` : null;
      if (seenKey && await redis.exists(seenKey)) return true;
      if (callback) await telegram('answerCallbackQuery', { callback_query_id: callback.id });
      raw = await redis.get(key);
      let state = raw ? JSON.parse(raw) : null;
      const process = async () => {
        if (data === 'sld_application') {
          await send(chat.id, intro, [button('📝 Bewerbung starten / fortsetzen', 'ic:begin'), button('⬅️ Zurück zum Menü', 'sld_menu')]);
          return;
        }
        if (data === 'ic:begin') {
          if (state?.status === 'submitted') {
            await send(chat.id, 'Deine Bewerbung wurde bereits übermittelt. Wir melden uns bei dir.');
            return;
          }
          if (state?.status === 'sending') {
            await send(chat.id, 'Die Zustellung deiner Bewerbung wird geprüft. Bitte nicht erneut absenden. Bei Rückfragen wende dich an @SmartLivingSupport.');
            return;
          }
          if (!state) {
            state = { id: randomBytes(8).toString('hex'), answers: [], status: 'draft', createdAt: new Date().toISOString() };
            await save(key, state);
          }
          if (state.answers.length === 3) await review(chat.id, state);
          else await ask(chat.id, state);
          return;
        }
        if (/^\/(abbrechen|cancel)$/i.test(command)) {
          if (state?.status === 'sending' || state?.status === 'submitted') {
            await send(chat.id, 'Eine bereits übermittelte oder in Zustellung befindliche Bewerbung lässt sich hier nicht zurückrufen. Bitte kontaktiere @SmartLivingSupport.');
            return;
          }
          await redis.del(key);
          await send(chat.id, 'Dein Bewerbungsentwurf wurde gelöscht. Es wurde nichts an den Support gesendet. Mit /menu kommst du zurück.');
          return;
        }
        if (callback) {
          const [, action, id] = data.split(':');
          if (!state || state.id !== id) {
            await send(chat.id, 'Dieser Bewerbungsbutton ist abgelaufen. Öffne mit /menu die Bewerbung erneut.');
            return;
          }
          if (state.status === 'submitted' || state.status === 'sending') {
            await send(chat.id, state.status === 'submitted' ? 'Deine Bewerbung wurde bereits übermittelt. Wir melden uns bei dir.' : 'Die Zustellung wird geprüft. Bitte nicht erneut absenden. Bei Rückfragen wende dich an @SmartLivingSupport.');
            return;
          }
          if (action === 'cancel') {
            await redis.del(key);
            await send(chat.id, 'Bewerbung abgebrochen. Dein Entwurf wurde gelöscht und nichts an den Support gesendet. Mit /menu kommst du zurück.');
          } else if (action === 'edit') {
            state.id = randomBytes(8).toString('hex');
            state.answers = [];
            await save(key, state);
            await ask(chat.id, state);
          } else if (action === 'submit') {
            if (state.answers.length !== 3 || state.answers.some(a => typeof a !== 'string' || !a.trim())) {
              await send(chat.id, 'Bitte beantworte zuerst alle drei Fragen.');
              return;
            }
            const name = [user.first_name, user.last_name].filter(Boolean).join(' ').slice(0, 150);
            const contact = user.username ? `@${user.username}` : `tg://user?id=${user.id}`;
            const text = `📩 Vollständige Inner-Circle-Bewerbung\n\nBewerbungs-ID: ${state.id}\nName: ${name}\nKontakt: ${contact}\nTelegram-ID: ${user.id}\n\n` + questions.map((q, i) => `${i + 1}. ${q}\n${state.answers[i]}`).join('\n\n');
            state.status = 'sending';
            await save(key, state);
            try {
              const sent = await telegram('sendMessage', { chat_id: SUPPORT_ID, text, disable_web_page_preview: true });
              state.status = 'submitted';
              state.supportMessageId = sent.message_id;
              await save(key, state);
            } catch (error) {
              console.error('Application delivery needs review:', state.id, error.message);
              await send(chat.id, 'Die Zustellung konnte noch nicht sicher bestätigt werden. Bitte nicht erneut absenden. Wende dich bei Rückfragen mit deiner Bewerbungs-ID ' + state.id + ' an @SmartLivingSupport.');
              return;
            }
            await send(chat.id, '✅ Deine vollständige Bewerbung wurde an unser Support-Team übermittelt. Wir prüfen deine Antworten und melden uns bei dir. Das ist noch keine Aufnahmebestätigung.');
          }
          return;
        }
        if (!state || state.status !== 'draft') return;
        if (state.answers.length === 3) {
          await review(chat.id, state);
          return;
        }
        const answer = message?.text?.trim();
        if (!answer || answer.startsWith('/') || answer.length > 700) {
          await send(chat.id, 'Bitte beantworte die aktuelle Frage mit einer Textnachricht von 1 bis 700 Zeichen. Zum Abbrechen: /abbrechen.');
          return;
        }
        state.answers.push(answer);
        await save(key, state);
        if (state.answers.length === 3) await review(chat.id, state);
        else await ask(chat.id, state);
      };
      await process();
      if (seenKey) await redis.set(seenKey, '1', { EX: TTL });
      return true;
    } finally {
      await redis.eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end", { keys: [lockKey], arguments: [lockId] });
    }
  };
}
