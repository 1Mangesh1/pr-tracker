# Dispatch

A quiet pull-request tracker. One HTML page, one stylesheet, one JS file. Talks to GitHub's REST API straight from the browser. No build step, no backend, no AI, no telemetry.

## What it does

- Paste a GitHub personal access token.
- Pick which of your organisations to watch.
- Pick a time window (24 h → 90 d).
- Pick a state (open · merged · closed · all).
- Get an editorial dispatch of every PR matching the filter, grouped by org or repo.
- Token stays in `localStorage`. It is never sent anywhere except `api.github.com`.

## Running it

Anything that serves static files works:

```bash
python3 -m http.server 8080
# or
npx serve .
```

Open `http://localhost:8080`.

## Token

Create one at https://github.com/settings/tokens with scopes:

- `repo` — read repository and PR data
- `read:org` — list your organisations

Fine-grained tokens work too; grant **Pull requests: read** and **Metadata: read** on the repos you want to track, plus org membership read.

## Files

- `index.html` — markup, font loading, masthead
- `style.css`  — palette, typography, layout
- `app.js`     — GitHub API calls, filters, rendering

## License

MIT.
