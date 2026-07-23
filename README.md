# Internal Voice Agent

A four-step form. The user fills in who the agent is, what the company does,
and how it should sound, hits **Generate**. The button then becomes **Talk with
your agent**, which opens a page where pressing one button starts a live browser
voice call with the agent they just described.

Built as a demo surface: the point is to let a client hear their own agent
within a minute of describing it.

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

## Setup

```bash
npm install
cp .env.example .env.local   # fill in RETELL_API_KEY
npm run dev                  # http://localhost:3000
```

`ANTHROPIC_API_KEY` is optional — see *Prompt compilation* below.
`NEXT_PUBLIC_APP_URL` only affects the text of the generated link.

## How it works

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
Browser  ──POST /api/agents──▶  compile prompt (Claude)
                                 → POST /create-retell-llm   → llm_id
                                 → POST /create-agent        → agent_id
                                 → save to store
                             ◀── { agentId, url }

/a/<id>  ──POST /api/agents/<id>/web-call──▶ POST /v2/create-web-call
                                          ◀── { accessToken }
         ──▶ retell-client-js-sdk joins the call in the browser
```

`RETELL_API_KEY` never reaches the browser. The client only ever receives an
`access_token` scoped to one call.

## Prompt compilation

The filled-in form is sent to Claude (`claude-opus-4-8`) as an intake form, and
expanded into Retell's recommended prompt structure — **Identity / Company Facts
/ Style Guardrails / Response Guidelines / Task** — before being written to
`general_prompt`. See [lib/compile-prompt.ts](lib/compile-prompt.ts).

If `ANTHROPIC_API_KEY` is unset or the call fails, `renderSpec()` in the same
file builds the same five sections deterministically from the fields, with no
model call. The app produces a working agent either way — Claude only makes the
wording better.

## Storage

The generated URL must resolve to stored metadata, so agents go in a registry
([lib/store.ts](lib/store.ts)) with two interchangeable backends:

- **JSON file** at `data/agents.json` — the default, zero config, for local dev.
- **Supabase/Postgres** — activates automatically when `SUPABASE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY` are set.

**Use Supabase in production.** Serverless filesystems are ephemeral and not
shared between instances, so the file store will lose agents on Vercel. The
`create table` statement is in a comment in `lib/store.ts`.

## Layout

```
app/
  page.tsx                          builder shell
  builder.tsx                       the four-step form (client)
  a/[agentId]/page.tsx              "Engage with your AI agent" page (server)
  a/[agentId]/call-client.tsx       Web SDK call + live transcript (client)
  api/agents/route.ts               POST create, GET list
  api/agents/[id]/web-call/route.ts mints the web-call token
lib/
  retell.ts                         Retell REST wrapper (server-only)
  voices.ts                         the two offered voices
  compile-prompt.ts                 raw prompt → structured Retell prompt
  store.ts                          agent registry (file | Supabase)
  types.ts
```

## Not built yet

- Phone-number attachment (`POST /create-phone-number` + agent binding)
- Auth / per-user agent lists
- Editing or deleting an agent after creation
