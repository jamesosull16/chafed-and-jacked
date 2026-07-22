# Chafed & Jacked — MCP Server

Log meals and read live training data from a Claude conversation.

This is the second front door onto the same estimation service the app uses: say
what you ate (or drop in a photo) and it estimates the macros, grounds them
against USDA FoodData Central, and writes the entry to the same Firestore
collection the PWA reads. A meal logged here shows up in the app's macro rings
immediately, and vice versa.

It also exposes the training side — block status, chain balance, volume
landmarks, body-composition trend — which is what makes the
`strength-conditioning-coach` and `sports-nutritionist` skills able to give
specific advice instead of generic advice.

## Architecture

```
Claude conversation
        │
        ▼
   MCP server  ──── firebase-admin (service account) ────▶  Firestore
        │                                                   users/{uid}/…
        └──── HTTPS + shared secret ────▶  estimateMealHttp Cloud Function
                                                   │
                                    Anthropic vision ──┴── USDA FoodData Central
```

**No API keys live in this process.** Estimation is delegated to the Cloud
Function, which holds the Anthropic and USDA keys as Firebase secrets. This
server holds only a Firestore service account and a shared secret for calling
the function.

## Prerequisites

1. **Cloud Functions deployed** with their secrets set:

   ```bash
   cd functions
   npm install
   firebase functions:secrets:set ANTHROPIC_API_KEY
   firebase functions:secrets:set USDA_API_KEY      # https://fdc.nal.usda.gov/api-key-signup
   firebase functions:secrets:set MCP_SHARED_SECRET # any long random string
   firebase deploy --only functions
   ```

   Note the deployed URL of `estimateMealHttp`.

2. **A Firebase service account** with Firestore access — Firebase console →
   Project settings → Service accounts → Generate new private key. Save the JSON
   somewhere outside the repo.

3. **Your Firebase uid** — visible in the Firebase console under Authentication,
   or by logging `user.uid` in the app.

## Install

```bash
cd mcp
npm install
```

## Configure as a connector

Add to your Claude Desktop / Claude Code MCP configuration:

```json
{
  "mcpServers": {
    "chafed-and-jacked": {
      "command": "node",
      "args": ["/absolute/path/to/chafed-and-jacked/mcp/index.js"],
      "env": {
        "CJ_USER_ID": "your-firebase-uid",
        "CJ_SERVICE_ACCOUNT": "/absolute/path/to/service-account.json",
        "CJ_PROJECT_ID": "chafed-and-jacked",
        "CJ_ESTIMATOR_URL": "https://us-central1-chafed-and-jacked.cloudfunctions.net/estimateMealHttp",
        "CJ_SHARED_SECRET": "the-same-value-you-set-as-MCP_SHARED_SECRET"
      }
    }
  }
}
```

In Claude Code: `claude mcp add chafed-and-jacked -- node /absolute/path/to/mcp/index.js`
then set the environment variables in your shell profile or the MCP config.

| Variable | Required | Purpose |
|---|---|---|
| `CJ_USER_ID` | yes | Firebase uid whose data to read and write |
| `CJ_SERVICE_ACCOUNT` | yes¹ | Path to the service-account JSON |
| `CJ_PROJECT_ID` | no | Firebase project id, if not inferable from credentials |
| `CJ_ESTIMATOR_URL` | for `log_meal` | Deployed `estimateMealHttp` URL |
| `CJ_SHARED_SECRET` | for `log_meal` | Must match the `MCP_SHARED_SECRET` function secret |

¹ Or set `GOOGLE_APPLICATION_CREDENTIALS` and omit it — application default
credentials are used when `CJ_SERVICE_ACCOUNT` is unset.

Read-only tools work without the estimator variables; only `log_meal` needs them.

## Tools

### Nutrition

| Tool | What it does |
|---|---|
| `log_meal` | Estimate macros from a description and/or photo, write the entry, return the day's remaining macros |
| `get_today_macros` | Targets, consumed, remaining, and every logged entry for a day |
| `get_targets` | The day's targets plus how they were derived (BMR, TDEE, surplus, rationale) |
| `list_recent_meals` | Logged meals and daily totals over a window |
| `update_meal` | Correct a logged entry |
| `delete_meal` | Remove a logged entry |

### Training

| Tool | What it does |
|---|---|
| `get_block_status` | Block week, mesocycle, accumulation/deload, RIR target, active injury guardrails, hamstring rehab stage |
| `get_training_summary` | Recent sessions with per-exercise sets (weight, reps, RIR, side) and mobility adherence |
| `get_chain_balance` | Posterior:anterior ratio, sets per muscle vs landmarks, left/right symmetry, push:pull |
| `get_body_metrics` | Weight / body fat / lean mass trend and a rate-of-gain assessment with a suggested surplus adjustment |

## Usage

Once connected, this works conversationally:

> **You:** I just had two eggs, 100g of oats with a scoop of whey, and a banana.
>
> **Claude:** *(calls `log_meal`)* Logged — 712 kcal, 52g protein, 88g carbs, 18g fat.
> You've got 2,180 kcal and 108g of protein left today.

Photos work the same way — paste one in and ask it to log the meal.

With the `sports-nutritionist` and `strength-conditioning-coach` skills
installed (see [`../skills/`](../skills/)), the same data drives actual coaching:
"what should I eat tonight to hit my protein" reads your remaining macros, and
"what's today's session" reads your block week and chain balance.

## Security notes

- The uid is fixed at startup from `CJ_USER_ID`. No tool takes a uid argument,
  so a prompt-injected instruction cannot redirect reads or writes to another
  user's data.
- The service account bypasses Firestore security rules by design. Keep the JSON
  file out of the repo and off shared machines.
- `estimateMealHttp` is guarded by a shared secret so it is not an open proxy to
  a paid API. Rotate it with
  `firebase functions:secrets:set MCP_SHARED_SECRET` followed by a redeploy.

## Troubleshooting

**`CJ_USER_ID is not set`** — the server exits immediately; set it in the MCP
config `env` block, not just your shell.

**`Meal estimation is not configured`** — `CJ_ESTIMATOR_URL` or
`CJ_SHARED_SECRET` is missing. Read-only tools still work.

**`Estimator returned 401`** — the shared secret does not match what the
function has. Re-set the secret and redeploy the function.

**`No bodyweight on record`** — targets need a weigh-in. Log one in the app's
Body screen, or complete onboarding.
