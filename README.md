# Newsletter Studio

A personalised news digest you set up by talking to an agent, Lia, instead of
filling in a settings form: delivered by email or Slack, on your schedule, in
the tone and language you choose.

Français : [README.fr.md](README.fr.md)

<!-- screenshot: docs/onboarding.png (to add) -->

## Why this exists

I needed to keep up with AI, fintech and startup news, and it was moving too
fast to follow by hand. I first automated my own newsletter with a basic n8n
workflow: 32 editions sent between March and July 2026. At some point it
occurred to me that this was probably not just my problem, so I built an app
that does the technical steps for you instead of you wiring them yourself. The
first version was built in one evening, on June 9, 2026.

The delivery engine still ran in n8n at first. In September 2026 I moved it
into this repo as plain TypeScript (more on why below). It is open source in
case someone else has the same need, or a different one this can still help
with.

## How it works

You tell Lia, in a chat, what you do and what you want to follow. She proposes
a setup with sensible defaults rather than interrogating you through a form: a
name, a channel, a schedule, a first batch of sources. Every source, yours or
one she suggests, is checked before it's added: is it a working RSS feed, can
one be discovered from the page, or does it fall back to reading the page
itself. You confirm or adjust, and the digest goes live. From there the engine
takes over: on your schedule, it fetches your sources, keeps only what is
fresh and not already sent, drafts the edition with a model, and delivers it
by email or Slack.

### Architecture

```
Next.js 14 (this repo)
  /onboarding          conversation with Lia
                        (source search, RSS validation, save)
  /dashboard           your digests, and connecting your API key
  /api/cron/tick       engine trigger, called by a system cron
  src/lib/engine/      the engine, in plain, testable TypeScript
    due.ts     works out which digests are due right now
    tick.ts    entry point: runs every digest that is due
    run.ts     orchestrates one digest end to end
    config.ts  loads a digest with its sources and send history, logs each delivery
    parse.ts   parses feeds, applies the freshness window, deduplicates
    prompt.ts  builds the model prompt, validates its JSON reply
    llm.ts     calls the model with the user's own key (BYOK)
    render.ts  renders the edition as email HTML or Slack blocks
    send.ts    sends the edition, through Brevo or Slack
  src/lib/agent/system-prompt.ts   Lia's system prompt
  src/lib/tools/                  Lia's tools during onboarding
    validate-source.ts   checks a URL, finds its RSS feed if it has one
    exa.ts               source search and "find similar" (Exa)
    safe-fetch.ts        anti-SSRF guard, every outbound fetch goes through it

Supabase   auth by a one-time email code (6 to 10 digits, set at the Supabase
           project level, not hardcoded here), Postgres, RLS
Brevo      transactional email
Slack      OAuth incoming webhook (optional)
```

## Bring your own key

From the dashboard, you connect your own provider key: Anthropic, or OpenAI.
Nothing runs until you add one, and you can remove it at any time. The key is
encrypted at rest and never sent back to the browser; only a four-character
hint is shown.

Under the hood, the OpenAI path is really any OpenAI-compatible endpoint
(OpenAI itself, Groq, OpenRouter, Mistral, a local model), through a
configurable base URL. Today that base URL, and which exact model runs, are
set by whoever hosts the instance (`ENGINE_OPENAI_BASE_URL`, `ENGINE_MODEL` in
`src/lib/engine/llm.ts`), not chosen per user in the UI yet. The defaults are
`claude-sonnet-4-6` for Anthropic and `gpt-5` for OpenAI.

Editions are billed to you directly by your provider: an estimate of about
$0.05 per edition on Claude Sonnet 4.6, based on typical token counts of
around 8k input and 1.5k output tokens per run (see `src/lib/pricing.ts`).
That works out to roughly $1 a month for a digest sent every weekday.

The host only pays for the onboarding conversation with Lia, so you can try
the product before connecting a key, and that spend is capped weekly:
`WEEKLY_CAP_USD_PER_USER` and `WEEKLY_CAP_USD_GLOBAL` in `src/lib/plan.ts`.
Once the global cap is hit, onboarding pauses until the following week;
digests that are already running keep running, since they cost the host
nothing.

`ENGINE_FALLBACK_API_KEY` and `ENGINE_FALLBACK_USER_IDS` let the host run
digests on its own key, but only for the specific accounts listed in
`ENGINE_FALLBACK_USER_IDS`. With that list empty, the fallback key applies to
no one: there is no general free tier hidden behind it. It exists for
migrating pre-BYOK digests and for local development.

## Install

### 1. Database

Create a Supabase project, then run `supabase/migrations/0000_schema.sql` in
the SQL editor. It has the schema, RLS policies, column-level privileges and
automatic profile creation on signup. Also run
`supabase/migrations/0006_flagged_conversations.sql`: it adds the table behind
the abuse-flagging console (`/admin/flags`), and is not folded into `0000`.
Files `0001` to `0005` are the history of the original database and are not
needed on a new install.

On the Auth side, configure an SMTP provider (Brevo works) so the login codes
actually get sent, and put `{{ .Token }}` in the "Magic Link" and "Confirm
signup" email templates.

### 2. Environment variables

```bash
cp .env.example .env.local   # or .env for Docker
```

The minimum to get started: the three Supabase keys, `ANTHROPIC_API_KEY` for
onboarding, `BREVO_API_KEY` with a validated sender (`BREVO_SENDER_EMAIL`),
and `CRON_SECRET` plus `SOURCE_KEY_ENCRYPTION_SECRET` (`openssl rand -hex 32`
for each).

### 3. Run

```bash
npm install
npm run dev
# or, in production:
docker compose up -d --build
```

### 4. Schedule the engine

The engine does not run on its own: something has to call its trigger
regularly. Every 5 minutes is enough, the internal logic works out which
digest is actually due.

```cron
*/5 * * * * curl -fsS --max-time 280 -H "Authorization: Bearer YOUR_CRON_SECRET" https://your-app/api/cron/tick
```

The trigger is designed to be called often without risk: it never sends the
same edition twice, and it catches up on a missed schedule if the machine was
down, within a three-hour window.

## Why the engine left n8n

The engine used to run as a 22-node n8n workflow. It's now plain TypeScript in
this repo: a Code node is not typed, not testable, and not reviewable in a
diff, and its sandbox has surprises. A concrete one: the n8n Code node sandbox
does not expose the standard `new URL()` constructor. A silent catch around it
turned every parsed URL into null, and the engine kept reporting success while
sending nothing, for about a week in July 2026.

## Implementation notes

**Freshness depends on cadence.** A daily digest looks back 30 hours, 78 on
Mondays to cover the weekend for a weekday-only schedule, and a weekly digest
looks back 8 days. An item with no usable date is rejected in short windows,
since that is almost always pinned or evergreen content that would otherwise
loop forever.

**Deduplication runs on two keys.** The normalized URL (https forced, `www.`
and tracking parameters stripped, remaining params sorted) and a title
fingerprint. Changing `normalizeUrl` invalidates all history already stored,
and readers get duplicates.

**A failed send does not consume items.** Articles are only marked as sent
after a successful delivery; otherwise a channel outage would burn them for
good.

**User-supplied URLs are filtered before any outbound request**
(`src/lib/tools/safe-fetch.ts`): DNS resolution up front, private ranges
refused, and every redirect hop revalidated. Without this, the app would be a
probe into its host's internal network.

**RLS filters rows, not columns.** Columns that drive server-side behaviour
are removed from what the `authenticated` role can write, and the legitimate
writes go through the service key with an explicit ownership filter. See the
header of `0000_schema.sql`.

## Optional: digest-profile skill

`skills/digest-profile/SKILL.md` is a Claude skill that interviews you about
your job, your current projects and what you want to follow, then writes a
ready-to-paste brief for Lia so your digest is tailored from the first
message.

## Operating

Day-to-day operation (checking the engine is running, editing a digest
without touching code, known pitfalls) is in [OPERATING.md](OPERATING.md),
currently in French.

## License

MIT. See [LICENSE](LICENSE).

Built by [Théo David](https://theodavid.com). The live app is at
[lia.theodavid.com](https://lia.theodavid.com).
