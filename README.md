# Voice Agent Builder

A four-step form. The user fills in who the agent is, what the company does,
and how it should sound, hits **Generate**. The button then becomes **Talk with
your agent**, which opens a page where pressing one button starts a live browser
voice call with the agent they just described.

Built on Retell (voice), Anthropic (prompt compilation) and Supabase (accounts
and database).

## The form

| Step | Fields | Maps to |
|---|---|---|
| 1 Agent | agent name, language, first line, voice (female/male) | `agent_name`, `language`, `begin_message`, `voice_id` |
| 2 Company | company name, what it does, hours, contact and location | the *Company Facts* section of the prompt |
| 3 Conversation | services, tone, goal of the call, rules to avoid | *Style Guardrails*, *Response Guidelines*, *Task* |
| 4 Build | → **Talk with your agent** | `/a/<agentId>` |

Only agent name, company name, and one of description/services are required —
everything else has a sensible default. The Company step is the agent's **only**
source of truth: the prompt explicitly forbids inventing hours, prices or
policies that were not entered.

---

## Architecture

Frontend and backend are separate applications that run, build and deploy
independently.

```
apps/
  web/        Next.js — UI only. No API keys, no business logic.
  api/        NestJS — all business logic, all secrets, all database access.
packages/
  shared/     Types, Zod schemas and constants both sides import.
```

`packages/shared` is what makes the split safe: `AgentSpec` and the validation
rules are defined once, so if the backend changes them the frontend stops
compiling instead of silently drifting.

### Inside the API

Each layer only talks downward — a controller never writes a query, a
repository never knows what Retell is.

```
apps/api/src/
  modules/
    auth/       controller → service              sign-in, refresh, sign-out
    agents/     controller → service → repository create, list, share, call
  infra/
    supabase/   Supabase Auth over REST   ← the only file that knows about Supabase
    retell/     Retell REST client
    prompt/     Anthropic prompt compiler
    captcha/    reCAPTCHA verification
  db/
    schema.ts   Drizzle schema — the source of truth for the tables
    init.sql    one-time setup, run in the Supabase SQL editor
  common/       guards, pipes, decorators, filters, config
```

### How the browser reaches the API

It doesn't, directly. The browser calls the Next.js app's own `/api/*` routes,
which attach the session and forward. That is what lets the auth tokens live in
httpOnly cookies, out of reach of any script on the page.

```
browser ──▶ Next.js /api/*  ──▶  NestJS API  ──▶  Supabase / Retell / Anthropic
        (httpOnly cookies)      (Bearer token)
```

### Route protection

| Route | Auth |
|---|---|
| `/login` | public; redirect to `/` when already signed in |
| `/` (dashboard) | 🔒 signed-in only |
| `/build` (builder form) | 🔒 signed-in only; redirects to `/` at the agent limit |
| `POST /agents` | 🔒 signed-in **+ reCAPTCHA** |
| `GET /agents` | 🔒 returns only the caller's own agents |
| `/a/<agentId>` | **public** — the share link is the product |
| `POST /agents/:id/web-call` | **public**, rate-limited to 5/min per IP |

Registration is closed. There is no sign-up page and no `POST /auth/signup`
endpoint — create accounts by hand in the Supabase dashboard
(**Authentication → Users → Add user**), which is the only place that holds the
service-role key. `/signup` redirects to `/login` so old links still land
somewhere sensible.

## Limits

Both live in [packages/shared/src/constants/limits.ts](packages/shared/src/constants/limits.ts)
so the UI and the API cannot disagree about them.

| Limit | Value | Enforced by |
|---|---|---|
| Agents per account | 3 | `AgentsService.create` counts existing rows before spending anything. The dashboard also hides the build button, but that is presentation. |
| Call duration | 3 minutes | Retell's `max_call_duration_ms` on the agent — it hangs up itself, so the cap survives a tampered page. The browser also counts down and ends the call cleanly a moment earlier. |

The agent limit has a benign race: two simultaneous requests can both pass the
count check and produce a fourth agent. Closing it needs a database constraint
or a lock, which is not worth it at three per account.

---

## Running it locally

**Prerequisites:** Node 20.11+, a Supabase project, a Retell API key, a
reCAPTCHA v2 key pair.

```bash
npm install

# 1. Create the table (once). Paste apps/api/src/db/init.sql into the
#    Supabase dashboard → SQL Editor → New query → Run.

# 2. Fill in the environment.
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# 3. Start everything: shared watcher + API on :4100 + web on :3100.
npm run dev
```

To run them separately, `npm run dev:api` and `npm run dev:web` in two
terminals — the shared package needs building once first
(`npm run build:shared`).

### What you need to supply

| Value | Where to get it | Goes in |
|---|---|---|
| `DATABASE_URL` | Supabase → Settings → Database → Connection string (URI) | `apps/api/.env` |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Supabase → Settings → API | `apps/api/.env` |
| `RETELL_API_KEY` | dashboard.retellai.com → Settings → API Keys | `apps/api/.env` |
| `ANTHROPIC_API_KEY` | console.anthropic.com (optional) | `apps/api/.env` |
| `RECAPTCHA_SECRET_KEY` | google.com/recaptcha/admin | `apps/api/.env` |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | the same reCAPTCHA registration | `apps/web/.env.local` |
| `API_URL` | where the backend runs | `apps/web/.env.local` |

Both `.env.example` files ship with Google's official reCAPTCHA **test keys**,
which always pass — enough to run the app before registering your own. Replace
them before deploying; they accept anything.

Register `localhost` **and** your production domain on the same reCAPTCHA
widget, or the checkbox will fail in one environment or the other.

The API validates its whole environment at boot and refuses to start with a
readable list of what is missing, rather than failing later inside a request.

---

## How agent creation works

Creating an agent is a **two-call sequence** against Retell, both server-side:

| Step | Endpoint | Purpose |
|---|---|---|
| 1 | `POST /create-retell-llm` | The brain. `general_prompt` carries tone + instructions → returns `llm_id`. |
| 2 | `POST /create-agent` | Wires the brain to a `voice_id` → returns `agent_id`. |

The shareable page then uses a third call:

| Step | Endpoint | Purpose |
|---|---|---|
| 3 | `POST /v2/create-web-call` | Mints a short-lived `access_token` for the browser SDK. |

**Retell does not host a public "talk to this agent" page.** The only web-call
primitive is `create-web-call`, which returns a token you feed to their Web SDK
in a browser you control. So the URL we generate points at *our* page,
`/a/<agentId>`, which mints the token server-side and starts the call.

```
Browser ──POST /api/agents──▶ Next.js ──▶ API   verify reCAPTCHA
                                            → compile prompt (Claude)
                                            → POST /create-retell-llm  → llm_id
                                            → POST /create-agent       → agent_id
                                            → save to the registry
                                        ◀── { agentId, url }

/a/<id> ──POST /api/agents/<id>/web-call──▶ API ──▶ POST /v2/create-web-call
                                                ◀── { accessToken }
        ──▶ retell-client-js-sdk joins the call in the browser
```

`RETELL_API_KEY` never leaves the API. The client only ever receives an
`access_token` scoped to one call.

## Prompt compilation

The filled-in form is sent to Claude (`claude-opus-4-8`) as an intake form and
expanded into Retell's recommended prompt structure — **Identity / Company Facts
/ Style Guardrails / Response Guidelines / Task** — before being written to
`general_prompt`. See
[apps/api/src/infra/prompt/prompt-compiler.service.ts](apps/api/src/infra/prompt/prompt-compiler.service.ts).

If `ANTHROPIC_API_KEY` is unset or the call fails, `renderSpec()` in the same
file builds the same five sections deterministically from the fields, with no
model call. The app produces a working agent either way — Claude only makes the
wording better.

## Storage

Agents live in Postgres, accessed through Drizzle. The schema is
[apps/api/src/db/schema.ts](apps/api/src/db/schema.ts); every agent carries a
`user_id` foreign key to `auth.users`.

```bash
npm run db:generate   # diff the schema, write a versioned .sql migration
npm run db:push       # apply it
```

Ownership is enforced in `AgentsRepository` — every user-scoped query filters on
`user_id`. Row Level Security is enabled on the table as well, which blocks the
separate PostgREST path Supabase exposes to anyone holding the anon key.

**The registry is not on the critical path for playback.** Retell permanently
stores every agent we create, so `AgentsService.getPublicView()` falls back to
`GET /get-agent/{id}` whenever our database is unreachable. Share links and web
calls keep working through a database outage; the only thing lost is the company
name shown above the agent's name.

Saving is best-effort for the same reason: by the time we write the row, the
agent already exists in Retell and the share link already works, so a database
blip must not turn a successful creation into an error the user sees. It is
logged loudly instead — the agent will be missing from its owner's list.

---

## Deploying

Two builds, two processes.

```bash
npm run build          # shared → api → web

npm run start:api      # node apps/api/dist/main.js   (PORT, default 4100)
npm run start:web      # next start                   (port 3100)
```

Or with Docker — note the build context is the **repo root**, because both
images need `packages/shared`:

```bash
docker build -f apps/api/Dockerfile -t agent-api .
docker build -f apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_RECAPTCHA_SITE_KEY=your_site_key \
  -t agent-web .
```

`NEXT_PUBLIC_*` variables are baked into the client bundle at build time, not
read at runtime — that is why the site key is a build arg rather than an
environment variable on the container.

Set `CORS_ORIGIN` on the API to the frontend's public origin, and `API_URL` on
the frontend to the API's. The API listens on `0.0.0.0` and trusts one proxy
hop, so it works behind nginx or Cloudflare unchanged.

Health checks: `GET /health` (process up) and `GET /health/ready` (database
reachable too).

## Not built yet

- Phone-number attachment (`POST /create-phone-number` + agent binding)
- Editing or deleting an agent after creation
- Password reset
- Cloudflare edge rules (WAF + rate limiting) — planned, not yet configured
