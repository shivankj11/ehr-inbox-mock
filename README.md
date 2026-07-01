# EHR Inbox — SMART Application mock

A static, GitHub Pages–ready mock of a healthcare EHR "SMART Application" inbox
view (top nav bar, folder tabs, mailbox sidebar, message list, reading pane).

Pure HTML/CSS/JS — no build step.

## Preview locally

Open `index.html` directly, or serve the folder:

```bash
cd ehr-inbox-mock
python3 -m http.server 8080
# then visit http://localhost:8080
```

## Deploy to GitHub Pages

1. Create a repo and push these files to the root (or a `docs/` folder):
   ```bash
   git init -b main
   git add .
   git commit -m "EHR inbox mock UI"
   git remote add origin git@github.com:<you>/<repo>.git
   git push -u origin main
   ```
2. In the repo: **Settings → Pages → Build and deployment**
   - Source: **Deploy from a branch**
   - Branch: **main** / root (`/`)  — or `/docs` if you put the files there
3. The site publishes at `https://<you>.github.io/<repo>/`.

`.nojekyll` is included so GitHub Pages serves the files verbatim.

## Files

| File         | Purpose                                                    |
|--------------|------------------------------------------------------------|
| `index.html` | Page structure / content                                   |
| `styles.css` | Layout, colors (Luminai theme tokens), responsive rules    |
| `script.js`  | Message data, folder/tab logic, and the API-hook transports |

## Interactivity

- Click a message → it opens in the reading pane.
- Click **✓ Send to Completed Work** → the message moves out of the current
  folder into **Completed Work** (and can be reopened back to My Requests).
- The move **persists across reloads** via `localStorage` (per browser).
- Click a sidebar folder → the list filters to that folder; the count updates.
- Deep link: `index.html?open=2` opens a specific message on load.
- Clear saved state from the console: `localStorage.removeItem('ehrInboxOverrides')`
  and `localStorage.removeItem('ehrInboxInbound')`.

## Receiving messages from an external source (the "API hook")

GitHub Pages is static — it cannot *receive* an HTTP request and run code. So an
external source can't POST directly to the page. Instead the page is a **client**
that subscribes to a **broker** the external source writes to:

```
external source ──▶ broker ──▶ page reads/subscribes ──▶ new row appears
```

Everything routes through one entry point in `script.js`:

```js
window.receiveMessage({ from, subject, source, body, folder, flagged })
```

Three transports feed it:

1. **`BroadcastChannel`** (works now, no backend) — any same-origin tab/app:
   ```js
   new BroadcastChannel('luminai-ehr').postMessage({ from: 'Dr. Lee', subject: 'Hi' })
   ```
2. **Supabase Realtime** (instant, over the internet) — configured below.
3. **Polling** — set `POLL_URL` to any JSON-array endpoint.

### Wiring Supabase Realtime (SENDMESSAGE / in-basket shape)

The table mirrors the payload `send_inbasket.py` builds; `message_type` picks the
sidebar folder.

1. Create a free project at supabase.com, then in the **SQL editor** run:
   ```sql
   create table inbasket_messages (
     id              bigint generated always as identity primary key,
     created_at      timestamptz default now(),
     message_type    text not null default 'staff-message',
     sender_id       text,
     recipients      jsonb default '[]'::jsonb,
     body            text,
     patient_id      text,
     patient_id_type text
   );
   alter table inbasket_messages enable row level security;
   -- DEMO policies (anon can read + insert). Tighten before real use.
   create policy "anon read"   on inbasket_messages for select to anon using (true);
   create policy "anon insert" on inbasket_messages for insert to anon with check (true);
   -- realtime delivery respects the read policy above:
   alter publication supabase_realtime add table inbasket_messages;
   ```
2. In `script.js`, fill the `SUPABASE` config (Project URL + **anon public** key
   from Settings → API): set `url` and `anonKey`; leave `table` as
   `inbasket_messages`.
3. Insert a message — this is your external API request:
   ```bash
   curl -X POST 'https://<proj>.supabase.co/rest/v1/inbasket_messages' \
     -H "apikey: <anon-key>" -H "Authorization: Bearer <anon-key>" \
     -H "Content-Type: application/json" -H "Prefer: return=minimal" \
     -d '{
       "message_type": "result",
       "sender_id": "Inbox Intake",
       "recipients": ["dr.smith"],
       "body": "Lab result ready: CBC within normal limits.",
       "patient_id": "0337ce1a-4012-7e62-99dc-2547d449bef7",
       "patient_id_type": "FHIRID"
     }'
   ```
   Any open page renders the new row in the mapped folder in under a second.

`message_type` → folder: `result`→Results, `my-requests`→My Requests,
`staff-message`→Staff Messages, `letter-draft`→Letter Drafts,
`forms-approvals`→Forms & Approvals, `patient-message`→Patient Messages,
`new-chart`→New Charts, `follow-up`→Follow-up (unknown → Staff Messages).

**Coming from `send_inbasket.py`:** Supabase differs from the Farseen endpoint in
two ways — (a) auth is `apikey` + `Authorization: Bearer <anon-key>`, not
`Authorization: Basic base64(user:key)`; (b) JSON keys are the snake_case column
names above, not `MessageType`/`SenderID`/`Body`/`PatientID`. Do **not** reuse the
`FARSEEN_AUTH_*` credentials — Supabase issues its own anon key.

The anon key is safe to embed **only with RLS enabled**. For real PHI, don't use
anon inserts on public Pages — front writes with a serverless function holding a
service key. This mock uses fake data only.

## What GitHub Pages can (and can't) do

GitHub Pages is **static hosting** (HTML/CSS/JS on a CDN). No server code runs
at request time.

- **Client-side interactions** (the folder move above, filtering, sorting,
  `localStorage` persistence): fully supported, no backend. ✅
- **Calling external APIs**: your browser JS can `fetch()` any API that allows
  CORS. Pages gives you no backend of its own, and anything in the JS is public
  — so use public/anon keys or per-user tokens, never a secret key. ⚠️
- **Real, shared persistence** (state saved server-side, visible to other users
  or devices; actually "sending" something): needs a backend. Host the frontend
  here, put the backend on a serverless function (Cloudflare Workers / Vercel /
  Netlify) or a BaaS (Supabase / Firebase). ❌ on Pages alone.
- **PHI / real patient data**: do **not** put it on public Pages with
  client-exposed keys (HIPAA). This mock uses fake data only.
