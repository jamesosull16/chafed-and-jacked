# Chafed & Jacked — MCP

Log food, log training, and read live data from a Claude conversation.

**One implementation, two transports.** Every CRUD tool lives in
`functions/src/mcp/` and both servers serve it. Neither is a copy of the other,
so a fix lands in both or in neither.

| | Hosted (Cloud Function) | Local (this directory) |
|---|---|---|
| Transport | Streamable HTTP | stdio |
| Reachable from | Any machine, phone, browser | The machine it runs on |
| Auth | Bearer token | Filesystem — the process is trusted |
| Public surface | An endpoint on the internet | None |
| Credentials | The function's own service account | A service-account JSON, or your ADC |
| CRUD tools | 28 (shared) | 28 (shared) |
| Live analysis | — | 5 (`src/analysis.js`) |
| Claude Desktop | No — OAuth only | Yes |

The five extra tools are the one real asymmetry. A local process can import
`src/lib`, so it computes the app's macro targets, chain balance and volume
landmarks against current data; the Functions bundle cannot, because only
`functions/` is uploaded on deploy, so it reads the figures the app stored.

---

## Hosted server (use this)

Deployed as the `mcp` Cloud Function. It runs with the function's own service
account, so there is no key to distribute, and calls the meal estimator
in-process rather than over HTTP.

### Add it to Claude Code

```bash
claude mcp add chafed-and-jacked \
  --transport http \
  --header "Authorization: Bearer $MCP_SHARED_SECRET" \
  https://us-central1-chafed-and-jacked.cloudfunctions.net/mcp
```

The token is the `MCP_SHARED_SECRET` value in Secret Manager — the same one
`estimateMealHttp` uses. Rotate with:

```bash
firebase functions:secrets:set MCP_SHARED_SECRET
firebase deploy --only functions
```

### Add it to the Messages API

```json
{
  "mcp_servers": [{
    "type": "url",
    "name": "chafed-and-jacked",
    "url": "https://us-central1-chafed-and-jacked.cloudfunctions.net/mcp",
    "authorization_token": "<MCP_SHARED_SECRET>"
  }],
  "tools": [{ "type": "mcp_toolset", "mcp_server_name": "chafed-and-jacked" }]
}
```

with beta header `mcp-client-2025-11-20`.

### It will not appear in Claude Desktop's connector list

Claude Desktop's "add custom connector" dialog only offers OAuth — there is no
field for a bearer token ([anthropics/claude-ai-mcp#112](https://github.com/anthropics/claude-ai-mcp/issues/112)).
The MCP spec agrees: for HTTP transports it mandates OAuth 2.1 with Protected
Resource Metadata, PKCE and resource indicators.

Supporting that means running an authorization server. For one athlete's
training log that is the wrong trade, so this server takes a static bearer and
is reached from Claude Code or the API instead. If Desktop support matters more
than the simplicity, the missing piece is an OAuth AS in front of this
endpoint — nothing about the tools would change.

### Timezone

The container runs in UTC, which rolls "today" over mid-evening in Ireland.
Clients that know better should send:

```
X-CJ-Timezone-Offset: -60
```

the value of `new Date().getTimezoneOffset()`. Without it, dates resolve in UTC.

### What it can do

Full create/read/update/delete on everything the athlete records:

| Area | Tools |
|---|---|
| Meals | `log_meal`, `add_meal_manually`, `list_meals`, `update_meal`, `delete_meal` |
| Runs | `log_run`, `list_runs`, `update_run`, `delete_run` |
| Sessions | `log_workout`, `list_workouts`, `get_workout`, `update_workout`, `delete_workout` |
| Weigh-ins | `log_weigh_in`, `list_weigh_ins`, `update_weigh_in`, `delete_weigh_in` |
| Check-ins | `log_check_in`, `list_check_ins`, `delete_check_in` |
| Progress | `get_exercise_progress`, `update_exercise_progress`, `delete_exercise_progress` |
| Profile | `get_profile`, `update_profile` |
| Coach thread | `list_coach_messages`, `delete_coach_message` |

### What it deliberately does not do

**Recompute the app's analysis.** Macro targets, chain balance and the volume
landmarks live in `src/lib`, which the functions bundle cannot import — only
`functions/` is uploaded on deploy. The coach solves that with server-side
copies and parity tests, which is right for logic it needs every turn and wrong
here: a second macro engine, drifting against the first, to answer a question
the app has already answered and written down. So `list_meals` returns the
targets the app *stored* on the day, and says so when a day has none.

**Compute `totalVolume` on a logged session.** The app derives it through
`sessionTonnage`, which knows about bodyweight fractions, per-hand multipliers
and timed holds. A figure invented here would disagree with every other session
on the dashboard, so the field is left for the app to fill.

**Write outside a whitelist on the profile.** That document carries
auth-adjacent fields beside the training settings; `update_profile` enumerates
what may change rather than merging whatever it is given.

### Security

The bearer token is the only thing between the public internet and every row of
this athlete's health data, with full write access. It is checked with a
constant-time compare before any body is parsed, and the uid is deploy-time
configuration (`functions/.env`) rather than input, so nothing a tool call says
can redirect a read or a write.

---

## Local stdio server

Same 28 CRUD tools as the hosted one, plus five that compute the app's analysis
live: `get_targets`, `get_block_status`, `get_chain_balance`,
`get_training_summary`, `get_body_metrics`. 33 in total.

It works in Claude Desktop — a local process needs no OAuth — and exposes
nothing to the internet.

```bash
cd mcp && npm install
```

```json
{
  "mcpServers": {
    "chafed-and-jacked": {
      "command": "node",
      "args": ["/absolute/path/to/chafed-and-jacked/mcp/index.js"],
      "env": {
        "CJ_USER_ID": "<firebase uid>",
        "CJ_SERVICE_ACCOUNT": "/absolute/path/to/service-account.json",
        "CJ_PROJECT_ID": "chafed-and-jacked",
        "CJ_ESTIMATOR_URL": "https://us-central1-chafed-and-jacked.cloudfunctions.net/estimateMealHttp",
        "CJ_SHARED_SECRET": "<MCP_SHARED_SECRET>"
      }
    }
  }
}
```

Drop `CJ_SERVICE_ACCOUNT` to use application-default credentials instead
(`gcloud auth application-default login`).

The estimator variables are only needed by `log_meal`. Without them the server
starts, warns, and everything else works — including `add_meal_manually`, which
takes macros you already have and never calls the estimator at all. No API key
ever reaches this process either way: estimation is delegated to the deployed
function, which holds the keys.

### One firebase-admin, deliberately

`mcp/` no longer depends on `firebase-admin`. It initialises through
`functions/src/store.js`, because the package keeps its app registry per module
instance: initialising via a second copy registers an app `createStore` cannot
see, and the symptom is a baffling "the default Firebase app does not exist"
from a process that plainly just created one.
