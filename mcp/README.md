# Chafed & Jacked — MCP

Log food, log training, and read live data from a Claude conversation.

There are two servers in this repo. **The hosted one is the current one.**

| | Hosted (`functions/src/mcp/`) | Local stdio (this directory) |
|---|---|---|
| Transport | Streamable HTTP | stdio |
| Reachable from | Any machine, phone, browser | The machine it is installed on |
| Auth | Bearer token | Filesystem — the process is trusted |
| Tools | 28, full CRUD | 10, mostly read-only |
| Credentials | The function's own service account | A service-account JSON you manage |
| Status | **Current** | Superseded — kept because it still works |

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

## Local stdio server (superseded)

Still works, and still the only option if you want zero public surface. Ten
tools, mostly reads. Needs its own service-account JSON and a `CJ_ESTIMATOR_URL`
round trip that the hosted server no longer makes.

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

This one *does* work in Claude Desktop — a local process needs no OAuth.

**Two implementations of the same tools is a known liability.** The app's two
logging surfaces have already needed the same fix three times this way. If the
hosted server covers what you need, delete this directory rather than carrying
both.
