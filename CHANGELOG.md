# Changelog

## 0.1.1

- Released through npm trusted publishing (OIDC) only, with provenance; no npm token is used any more.
- `repository.url` in package.json uses npm's normalized form.

## 0.1.0

Initial release.

- **Relvato Trigger** (webhook): Monitor Found a Problem, Monitor Recovered, Site Down, Site Back Up, New Vulnerability Found, Page Looks Different, Search Traffic Dropped, SSL Certificate or Domain Expiring and Quarantine Mode Change. Filters by site and, for problems and recoveries, by monitor groups. Can skip runs that couldn't happen. Every delivery's `Relvato-Signature` is verified, and **Listen for test event** asks Relvato for a signed sample event.
- **Relvato** actions: Site (Get Many, Find by Domain, Add, Start Monitoring for Goals), Monitor Group (Run Monitors Now, Pause, Resume), Run (Get Latest), Heartbeat (Add). Usable as an AI Agent tool.
- **Relvato API** credential: an API key from app.relvato.com → API access.
