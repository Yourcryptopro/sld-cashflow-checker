# SLD Concierge Bot Backend

Dieses Backend empfängt Telegram-Updates über `/telegram/webhook` und antwortet auf Cashflow-Audits mit scoreabhängigen Handlungsempfehlungen. Jede Antwort kann einen Button **„1:1 Call mit SLD Team ausmachen“** enthalten.

## Was der Bot bewertet

- **75–98 %:** Wachstum & Hebel – automatisiertes Investieren, Card-/Travel-Hebel und optionaler Strategie-Call.
- **50–74 %:** Optimierung – Abos und Versicherungen prüfen, Rücklage aufbauen und 1:1 Call zur Priorisierung der Hebel.
- **Unter 50 %:** Sofortmaßnahmen – Raten stoppen, Fixkosten durchgehen und klarer 1:1 Call mit dem SLD Team.

## Railway einrichten

1. Öffne [railway.app](https://railway.app) und melde dich mit GitHub an.
2. Klicke auf **New Project** → **Deploy from GitHub repo**.
3. Wähle das Repository **`Yourcryptopro/sld-cashflow-checker`** aus.
4. Öffne die Service-Einstellungen und trage bei **Root Directory** ein:

   ```
   bot-backend
   ```

5. Öffne **Variables** und lege diese Werte an:

   | Variable | Wert |
   |---|---|
   | `TELEGRAM_BOT_TOKEN` | Token deines Bots aus BotFather. Nie in GitHub speichern. |
   | `CALL_BOOKING_URL` | Echte URL für deine SLD-Call-Buchung. Vorläufig: `https://smartlivingdaily.io/call` |
   | `WEBHOOK_SECRET` | Ein langes, zufälliges Geheimnis, z. B. mit Passwortmanager erzeugt. |

6. Railway führt das Deployment automatisch aus. Falls nötig: **Redeploy** klicken.
7. Öffne **Settings** → **Networking** → **Generate Domain**.
8. Kopiere die erzeugte Railway-Domain, z. B. `https://dein-bot-production.up.railway.app`.
9. Öffne im Browser:

   ```
   https://DEINE-RAILWAY-DOMAIN/health
   ```

   Erwartete Antwort:

   ```json
   {"ok":true,"service":"sld-concierge-bot"}
   ```

## Telegram-Webhook setzen

Ersetze die drei Platzhalter in dieser Adresse und öffne sie **einmal** im Browser:

```text
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://<DEINE-RAILWAY-DOMAIN>/telegram/webhook&secret_token=<WEBHOOK_SECRET>
```

Wenn alles passt, zeigt Telegram eine Antwort mit `"ok":true`.

> **Achtung:** Den echten Bot-Token niemals teilen, in GitHub eintragen oder in Screenshots zeigen.

## Test in Telegram

Sende dem Bot nach dem erfolgreichen Webhook-Test diese Nachricht:

```text
/start cashflow_audit&score=60&cashflow=250&ratio=58.4&leak_year=720&subs=45&insurance=120&debt=0
```

Erwartet wird eine gelbe Optimierungsantwort mit dem Call-Button.

## Wichtige Deep-Link-Einschränkung

Telegram Deep Links unterstützen keine beliebig langen Audit-Daten. Für den echten Produktfluss sollte die Website daher später nur eine kurze Audit-ID senden, z. B.:

```text
/start audit_Ab12Xy
```

Das Backend lädt die vollständigen Audit-Werte dann anhand dieser ID von einer kleinen Datenbank oder API. Die aktuelle Datei ist bereits darauf vorbereitet, `audit_<id>` zu erkennen. Für die vollständige Audit-ID-Übergabe braucht es als nächsten Ausbau einen kleinen Speicher-/API-Endpunkt.

## Sicherheit

- Den Telegram Bot Token nie in GitHub, die Website, Browser-Screenshots oder Chats schreiben.
- Wenn ein Token versehentlich veröffentlicht wurde, ihn sofort in BotFather widerrufen und einen neuen Token erzeugen.
- `WEBHOOK_SECRET` in Railway setzen und denselben Wert beim `setWebhook`-Aufruf verwenden.
