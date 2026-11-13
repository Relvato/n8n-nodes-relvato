# Changelog

## 0.1.3

Every operation now calls Relvato's REST API, and answers an AI Agent can read correctly. Changes asked for in n8n's verification review.

- **Change: REST API only.** Site → Add, Start Monitoring for Goals, Monitor Group → Pause and Resume, and Heartbeat → Add called Relvato's MCP server. They now call `POST /api/v1/sites`, `POST /api/v1/sites/:id/goals`, `POST /api/v1/sites/:id/groups/:group/pause` and `/resume`, and `POST /api/v1/sites/:id/heartbeats`. The answers are the same, and so are the outputs. A refusal is now an HTTP error carrying Relvato's message (for example 400 *"This plan allows 2 heartbeats."*), so the node fails with the same words as before.
- **Change: Heartbeat → Add.** How Often It Runs and Grace moved into **Additional Fields**. Left out, Relvato expects a ping once a day (86400 seconds), with an hour's grace (3600), as before. A saved workflow that set other values uses those defaults until you set them again under Additional Fields.
- **Change: Relvato Trigger.** The notice at the top of the node is gone. The plan and key requirement and the "events fire on state changes only" behaviour are now in the Event field's description and in the README.
- **Change: Site → Get Many and Find by Domain** now return `id`, `name`, `url`, `platform` (`wordpress` or `other`), `ready` (ownership is proven, so monitors run on their schedule and send alerts) and `disabled`, from `GET /api/v1/sites`. `connectionType` is gone: it is replaced by `platform`, and `ready` says whether the site is monitored. An agent read `connectionType: "none"` as "not monitored", when it only meant the WordPress plugin wasn't connected. Workflows that use `{{ $json.id }}`, `name` or `url` work as before; one that reads `connectionType` should read `platform` instead.
- **New: Site → Get Overview** (`GET /api/v1/sites/:id/overview`): a site's health in plain language. It covers what needs attention, each monitor's latest result and schedule, setup state, recommended monitors not yet added and the account's run usage. It returns one item, with `id` set to the site.
- The operations' actions, which n8n's AI Agent reads as the tool description, now say what each operation returns, and that Run Monitors Now uses the plan's monthly runs.

## 0.1.2

- Fix: "Listen for test event" now receives Relvato's sample event. The node asks for it while n8n is still setting up the trigger (n8n closes the node's helpers afterwards), and Relvato sends it a few seconds later, once n8n has stored the signing secret. Needs Relvato's `delayMs` on `POST /api/v1/hooks/test`.

## 0.1.1

- Released through npm trusted publishing (OIDC) only, with provenance; no npm token is used any more.
- `repository.url` in package.json uses npm's normalized form.

## 0.1.0

Initial release.

- **Relvato Trigger** (webhook): Monitor Found a Problem, Monitor Recovered, Site Down, Site Back Up, New Vulnerability Found, Page Looks Different, Search Traffic Dropped, SSL Certificate or Domain Expiring and Quarantine Mode Change. Filters by site and, for problems and recoveries, by monitor groups. Can skip runs that couldn't happen. Every delivery's `Relvato-Signature` is verified, and **Listen for test event** asks Relvato for a signed sample event.
- **Relvato** actions: Site (Get Many, Find by Domain, Add, Start Monitoring for Goals), Monitor Group (Run Monitors Now, Pause, Resume), Run (Get Latest), Heartbeat (Add). Usable as an AI Agent tool.
- **Relvato API** credential: an API key from app.relvato.com → API access.
