# n8n-nodes-relvato

This is an n8n community node package for [Relvato](https://www.relvato.com), a website monitoring platform. Relvato runs monitors against your real site, including uptime, SSL, checkout and sign-in flows, security and vulnerabilities, visual changes and search traffic. It runs them again whenever the site changes.

With this package your n8n workflows can react the moment Relvato sees a change (a site goes down, a monitor starts failing, a new vulnerability appears). Workflows can also act in Relvato: add sites, start monitoring, run monitors, pause monitor groups and create heartbeats.

It contains two nodes:

- **Relvato Trigger** starts a workflow when Relvato sends an event.
- **Relvato** runs actions and lookups.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

[Installation](#installation) · [Credentials](#credentials) · [Trigger events](#relvato-trigger-events) · [Actions](#relvato-actions) · [Example workflows](#example-workflows) · [Plans](#plan-requirements) · [Compatibility](#compatibility) · [Resources](#resources)

## Installation

In n8n, open **Settings → Community Nodes → Install**, enter `n8n-nodes-relvato`, and confirm. See n8n's [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) for details and for self-hosted setups.

## Credentials

The nodes use one credential, **Relvato API**, which holds an API key.

1. Sign in to Relvato and open [app.relvato.com → API access](https://app.relvato.com/api-access).
2. Create a **full-access** key. The trigger subscribes to events, and the actions add sites and run monitors, so both need full access. A read-only key works for the lookups only (Get Many sites, Find by Domain, Get Latest run).
3. In n8n, create a **Relvato API** credential and paste the key. n8n checks it against `GET https://app.relvato.com/api/v1`.

The key is sent as `Authorization: Bearer <key>`. Revoking it in Relvato stops every subscription it created.

## Relvato Trigger events

| Event | Fires when | Filters |
|---|---|---|
| Monitor Found a Problem | A monitor starts failing on one of your sites | Site, monitor groups |
| Monitor Recovered | A monitor that was failing passes again | Site, monitor groups |
| Site Down | The Uptime monitor finds a site down | Site |
| Site Back Up | A site that was down answers again | Site |
| New Vulnerability Found | A vulnerability monitor finds a known vulnerability (WordPress plugins and themes, or Drupal, Joomla, PrestaShop and Magento core) | Site |
| Page Looks Different | The visual monitor finds a page that no longer matches its approved screenshot | Site |
| Search Traffic Dropped | Google or Bing search traffic to a site drops sharply | Site |
| SSL Certificate or Domain Expiring | An SSL certificate or the domain registration is close to expiring, or a certificate problem appears | Site |
| Quarantine Mode Change | Quarantine mode notices an unexpected change on a site that was just cleaned after a hack | Site |

**Events fire on state changes only.** Relvato sends an event when a monitor *changes* state, from passing to failing or from failing to passing. It doesn't send one for every repeated failure. Re-running a monitor that's already failing sends nothing, so a workflow like "Monitor Found a Problem → Run Monitors Now" can't trigger itself in a loop.

**Skip Runs That Couldn't Happen** (on by default for the "problem" events): sometimes a firewall blocks Relvato or the site doesn't answer at all. The monitor then couldn't run, which says nothing about your site's code. With this option on, those events don't start the workflow. Turn it off to receive them too. They carry `run.outcome: "not-run"` and a `run.not_run_reason`.

**What the workflow receives:** the event exactly as Relvato sends it (payload version 1). It includes `type`, `created_at` and the `site`, plus the `check` (key, name, group, severity) and the `run` (status, outcome, what it found, failed step, what triggered it, what changed, and a link to the run). Quarantine events carry a `quarantine` summary instead.

**Security:** when the workflow is activated, the trigger creates a Relvato event subscription (`POST /api/v1/hooks`) for this workflow's webhook URL and stores the signing secret Relvato returns. Every delivery is signed (`Relvato-Signature: t=<unix time>,v1=<HMAC-SHA256>`). The trigger checks the signature over the raw body in constant time and rejects timestamps more than five minutes old. A request that fails this check gets `401` and doesn't start the workflow. Deactivating the workflow deletes the subscription.

**Testing:** with **Listen for test event**, the trigger asks Relvato to send a signed sample event, so you get data in the editor without waiting for a real incident. The sample is marked `"test": true`. Your webhook URL must be reachable over public HTTPS, because Relvato only sends events to the public internet.

## Relvato actions

| Resource | Operation | What it does |
|---|---|---|
| Site | Get Many | Lists the sites on the Relvato account |
| Site | Find by Domain | Finds a site by its domain, with or without `https://` and `www.` |
| Site | Add | Adds a website (WordPress / WooCommerce, or any other site or AI-built app). If the account already has a site on that domain, it returns that site instead of adding a duplicate. Returns `id`, `name`, `url` and `next_step`, the way to prove ownership. |
| Site | Start Monitoring for Goals | Turns on the monitors for what matters: checkout and sign-in, security, search traffic, broken pages, speed, the domain, law compliance |
| Monitor Group | Run Monitors Now | Runs a site's monitors now, all of them or one group (for example after a deploy). Each run counts toward the plan's monthly runs. |
| Monitor Group | Pause | Pauses one group of monitors on a site for 1 hour, 24 hours or until resumed (maintenance, a redesign) |
| Monitor Group | Resume | Resumes a paused group |
| Run | Get Latest | Returns a site's most recent finished run with its result. Returns no item if there isn't one yet. |
| Heartbeat | Add | Creates a heartbeat for a job you run (a cron job, a backup) and returns its `ping_url` and `fail_url`. If no ping arrives in time, Relvato alerts you. |

Monitor groups: Uptime (uptime, heartbeats, ports), User flows (checkout, logins, forms), Security, Design, Performance, SEO / AEO, Domain lifecycle, Legal compliance.

If Relvato refuses a request, the node fails with Relvato's own explanation, for example *"This API key is read-only…"*, *"Verify the domain first…"* or *"Event subscriptions are on the Pro plan and up."* With **Continue On Fail** (Settings → On Error → Continue) the error becomes an output item and the workflow carries on.

The Relvato node can also be used as a tool by n8n's AI Agent.

## Example workflows

### 1. Site Down → Slack

1. **Relvato Trigger**, event **Site Down**. Optionally pick one site.
2. **Slack → Send Message** to `#ops`:
   `:red_circle: {{ $json.site.name }} is down: {{ $json.run.error }} — {{ $json.run.url }}`
3. Add a second workflow with **Site Back Up** to post the all-clear.

### 2. New Vulnerability Found → Jira or Linear issue

1. **Relvato Trigger**, event **New Vulnerability Found**.
2. **Jira Software → Create Issue** (or **Linear → Create Issue**):
   - Summary: `Vulnerability on {{ $json.site.name }}: {{ $json.check.name }}`
   - Description: `{{ $json.run.error }}` · severity `{{ $json.check.severity }}` · `{{ $json.run.url }}`
3. Optional: a second branch with **Relvato → Monitor Group → Run Monitors Now** (group *Security*) after your patch deploys. Fixing the issue sends a **Monitor Recovered** event, which you can use to close the issue automatically.

### 3. New Google Sheets row → Add Site + Start Monitoring for Goals

1. **Google Sheets Trigger**, *Row Added*, on a sheet with columns `url`, `platform`, `name`.
2. **Relvato → Site → Add**: Website URL `{{ $json.url }}`, Platform `{{ $json.platform }}` (`wordpress` or `other`), Name `{{ $json.name }}`.
3. **Relvato → Site → Start Monitoring for Goals**: Site *By ID* `{{ $json.id }}`, Goals *Keep Checkout and Sign-In Working* and *Catch Hacks and Vulnerabilities*.
4. Optional: **Google Sheets → Update Row** to write back `{{ $('Relvato').item.json.next_step }}`. That is how to prove ownership of the site. Until it's proven, monitors are added but don't run on their schedule.

## Plan requirements

- **Trigger (event subscriptions):** the Pro plan or higher, with a full-access API key. On a lower plan, activating the workflow fails with *"Event subscriptions are on the Pro plan and up."* Up to 25 subscriptions per account. Each active Relvato Trigger node uses one.
- **Actions:** any plan. What they can do follows the plan: which monitors Start Monitoring adds, how many heartbeats an account can have, and how many monitor runs a month it gets.
- **Scheduled runs and alerts** need the site's ownership to be proven: the WordPress plugin, or a domain verification record. **Site → Add** returns the next step as `next_step`.

## Compatibility

Built with n8n's official node CLI (`@n8n/node-cli`), n8n nodes API version 1. Tested with n8n 2.46. It has no runtime dependencies and works on n8n Cloud and self-hosted n8n.

## Resources

- [Relvato for developers](https://www.relvato.com/developers): REST API, event subscriptions and the MCP server
- [Relvato + n8n](https://www.relvato.com/integrations/n8n)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## Development

```bash
npm install
npm run lint    # n8n's community-node lint rules, zero warnings
npm test        # builds, then runs the tests in test/ (node:test, HTTP mocked)
npm run dev     # starts n8n with this package linked, at http://localhost:5678
```

Releases are published by GitHub Actions with npm provenance when a `v*` tag is pushed (`.github/workflows/publish.yml`).

## Version history

See [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE) © Relvato SRL
