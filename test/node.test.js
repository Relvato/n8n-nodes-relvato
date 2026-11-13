const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Relvato } = require('../dist/nodes/Relvato/Relvato.node');
const { executeContext } = require('./helpers');

const node = new Relvato();
const SITE = '3f8a2c1e-9b7d-4e6a-8c5f-1d2e3f4a5b6c';
const API = 'https://app.relvato.com/api/v1';
// REST GET /api/v1/sites, as Relvato answers it: the site picker's source, and Get Many / Find by Domain's.
const sites = {
	sites: [
		{ id: SITE, name: 'My Shop', url: 'https://www.myshop.example', connectionType: 'wordpress', platform: 'wordpress', ready: true, disabled: false },
		{ id: 'other', name: 'Blog', url: 'https://blog.example', connectionType: 'none', platform: 'other', ready: false, disabled: false },
	],
};
// What Get Many and Find by Domain return: the same sites without connectionType.
const summaries = {
	sites: sites.sites.map(({ connectionType, ...s }) => s),
};
const call = (c) => ({ method: c.method, url: c.url, body: c.body });
const run = (items, handler, continueOnFail) => {
	const { ctx, calls } = executeContext({ items, handler, continueOnFail });
	return node.execute.call(ctx).then((out) => ({ out: out[0], calls }));
};

test('Site → Find by Domain returns the matching site, without connectionType', async () => {
	const { out, calls } = await run([{ resource: 'site', operation: 'findByDomain', domain: 'https://myshop.example' }], () => ({ body: sites }));
	assert.equal(calls.length, 1);
	assert.deepEqual(call(calls[0]), { method: 'GET', url: `${API}/sites`, body: undefined });
	assert.deepEqual(out.map((o) => o.json), [summaries.sites[0]]);
	assert.deepEqual(out[0].pairedItem, { item: 0 });
	const none = await run([{ resource: 'site', operation: 'findByDomain', domain: 'nothere.example' }], () => ({ body: sites }));
	assert.equal(none.out.length, 0);
});

test('Site → Get Many returns one item per site (id, name, url, platform, ready, disabled)', async () => {
	const { out, calls } = await run([{ resource: 'site', operation: 'getAll', returnAll: true }], () => ({ body: sites }));
	assert.deepEqual(call(calls[0]), { method: 'GET', url: `${API}/sites`, body: undefined });
	assert.deepEqual(out.map((o) => o.json), summaries.sites);
	assert.deepEqual(out.map((o) => o.pairedItem), [{ item: 0 }, { item: 0 }]);
	assert.equal(out[1].json.platform, 'other');
	assert.equal(out[1].json.ready, false);
	assert.equal('connectionType' in out[1].json, false);
});

test('Site → Get Many honours the limit', async () => {
	const { out } = await run([{ resource: 'site', operation: 'getAll', returnAll: false, limit: 1 }], () => ({ body: sites }));
	assert.deepEqual(out.map((o) => o.json.id), [SITE]);
});

test('Site → Get Many with no sites returns no item', async () => {
	const { out } = await run([{ resource: 'site', operation: 'getAll', returnAll: true }], () => ({ body: { sites: [] } }));
	assert.equal(out.length, 0);
});

test("Site → Get Overview reads the site's overview and returns it as one item", async () => {
	const answer = {
		site: summaries.sites[0],
		dashboard: `https://app.relvato.com/sites/${SITE}`,
		setup: { ready: true, nextStep: null },
		verdict: { tone: 'warn', headline: 'Checkout needs attention', summary: 'The checkout monitor failed at payment.', passing: 7, withVerdict: 8 },
		findings: [{ key: 'checkout', runId: 'r9' }],
		checks: [{ checkId: 'c1', key: 'uptime', name: 'Uptime', enabled: true, schedule: { schedule: 'hourly' }, latestRun: { runId: 'r1', status: 'passed' } }],
		pausedGroups: [],
		recommendedNotAdded: ['visual'],
		account: { plan: 'pro', runs: { used: 120, quota: 3000 } },
	};
	const { out, calls } = await run([{ resource: 'site', operation: 'getOverview', siteId: SITE }], () => ({ body: answer }));
	assert.deepEqual(call(calls[0]), { method: 'GET', url: `${API}/sites/${SITE}/overview`, body: undefined });
	assert.equal(out.length, 1);
	assert.deepEqual(out[0].json, { ...answer, id: SITE });
	assert.deepEqual(out[0].pairedItem, { item: 0 });
});

test('Site → Get Overview without a site fails before calling Relvato', async () => {
	let called = false;
	await assert.rejects(
		run([{ resource: 'site', operation: 'getOverview', siteId: '' }], () => {
			called = true;
			return { body: {} };
		}),
		(e) => e.message === 'Choose a site.',
	);
	assert.equal(called, false);
});

test('Site → Add posts the site and returns id, name, url, next_step', async () => {
	const answer = { created: true, site: { id: SITE, name: 'myshop.example', url: 'https://myshop.example' }, setup: { nextStep: 'Verify the domain.' } };
	const { out, calls } = await run(
		[{ resource: 'site', operation: 'add', url: 'https://myshop.example', platform: 'other', additionalFields: {} }],
		() => ({ statusCode: 201, body: answer }),
	);
	assert.deepEqual(call(calls[0]), { method: 'POST', url: `${API}/sites`, body: { url: 'https://myshop.example', platform: 'other' } });
	assert.equal(out[0].json.id, SITE);
	assert.equal(out[0].json.next_step, 'Verify the domain.');
	assert.equal(out[0].json.created, true);
});

test("Site → Start Monitoring for Goals posts the goals to the site's goals", async () => {
	const { out, calls } = await run(
		[{ resource: 'site', operation: 'startMonitoring', siteId: SITE, goals: ['security', 'flows'] }],
		() => ({ body: { siteId: SITE, monitorsAdded: ['uptime'] } }),
	);
	assert.deepEqual(call(calls[0]), { method: 'POST', url: `${API}/sites/${SITE}/goals`, body: { goals: ['security', 'flows'] } });
	assert.equal(out[0].json.id, SITE);
});

test('Monitor Group → Run Monitors Now posts the group (or nothing for all)', async () => {
	const answer = { ok: true, queued: 2, runs: [{ runId: 'r1' }, { runId: 'r2' }] };
	const one = await run([{ resource: 'monitorGroup', operation: 'run', siteId: SITE, group: 'security' }], () => ({ body: answer }));
	assert.equal(one.calls[0].url, `https://app.relvato.com/api/v1/sites/${SITE}/scan`);
	assert.deepEqual(one.calls[0].body, { group: 'security' });
	assert.deepEqual(one.out[0].json.run_ids, ['r1', 'r2']);
	assert.equal(one.out[0].json.queued, 2);
	const all = await run([{ resource: 'monitorGroup', operation: 'run', siteId: SITE, group: 'all' }], () => ({ body: answer }));
	assert.deepEqual(all.calls[0].body, {});
});

test("Monitor Group → Pause / Resume post to the group's pause and resume", async () => {
	const pause = await run([{ resource: 'monitorGroup', operation: 'pause', siteId: SITE, group: 'design', duration: '24h' }], () => ({ body: { monitorsOff: 3 } }));
	assert.deepEqual(call(pause.calls[0]), { method: 'POST', url: `${API}/sites/${SITE}/groups/design/pause`, body: { duration: '24h' } });
	assert.equal(pause.out[0].json.monitorsOff, 3);
	const resume = await run([{ resource: 'monitorGroup', operation: 'resume', siteId: SITE, group: 'design' }], () => ({ body: { wasPaused: true } }));
	assert.deepEqual(call(resume.calls[0]), { method: 'POST', url: `${API}/sites/${SITE}/groups/design/resume`, body: {} });
	assert.equal(resume.out[0].json.wasPaused, true);
});

test('Run → Get Latest returns the newest finished run, or no item', async () => {
	const runs = { runs: [{ id: 'r3', finished: false }, { id: 'r2', finished: true, outcome: 'issue' }] };
	const { out, calls } = await run([{ resource: 'run', operation: 'getLatest', siteId: SITE }], () => ({ body: runs }));
	assert.deepEqual(calls[0].qs, { siteId: SITE, limit: 25 });
	assert.equal(out[0].json.id, 'r2');
	const none = await run([{ resource: 'run', operation: 'getLatest', siteId: SITE }], () => ({ body: { runs: [] } }));
	assert.equal(none.out.length, 0);
});

test('Heartbeat → Add posts the heartbeat and returns id, ping_url, fail_url', async () => {
	const answer = { heartbeatId: 'hb1', pingUrl: 'https://app.relvato.com/api/hb/t', failUrl: 'https://app.relvato.com/api/hb/t/fail' };
	const { out, calls } = await run(
		[{ resource: 'heartbeat', operation: 'add', siteId: SITE, name: 'Nightly backup', additionalFields: { periodSec: 3600, graceSec: 600 } }],
		() => ({ body: answer }),
	);
	assert.deepEqual(call(calls[0]), { method: 'POST', url: `${API}/sites/${SITE}/heartbeats`, body: { name: 'Nightly backup', periodSec: 3600, graceSec: 600 } });
	assert.equal(out[0].json.id, 'hb1');
	assert.equal(out[0].json.ping_url, answer.pingUrl);
	assert.equal(out[0].json.fail_url, answer.failUrl);
});

test('Heartbeat → Add without Additional Fields leaves the schedule to Relvato', async () => {
	const { calls } = await run([{ resource: 'heartbeat', operation: 'add', siteId: SITE, name: 'Nightly backup' }], () => ({ body: { heartbeatId: 'hb1' } }));
	assert.deepEqual(calls[0].body, { name: 'Nightly backup' });
});

test("a refused write becomes a NodeApiError with Relvato's words", async () => {
	await assert.rejects(
		run([{ resource: 'heartbeat', operation: 'add', siteId: SITE, name: 'x' }], () => ({
			statusCode: 400,
			body: { error: 'bad_request', message: 'This plan allows 2 heartbeats.' },
		})),
		(e) => e.constructor.name === 'NodeApiError' && e.message === 'This plan allows 2 heartbeats.' && e.httpCode === '400',
	);
});

test('ids in the path are URL-encoded', async () => {
	const { calls } = await run([{ resource: 'monitorGroup', operation: 'pause', siteId: 'a/b', group: 'x y', duration: '1h' }], () => ({ body: {} }));
	assert.equal(calls[0].url, `${API}/sites/a%2Fb/groups/x%20y/pause`);
});

test('no operation calls the MCP server', async () => {
	const ops = [
		{ resource: 'site', operation: 'getAll', returnAll: true },
		{ resource: 'site', operation: 'findByDomain', domain: 'blog.example' },
		{ resource: 'site', operation: 'getOverview', siteId: SITE },
		{ resource: 'site', operation: 'add', url: 'https://x.example', platform: 'other', additionalFields: {} },
		{ resource: 'site', operation: 'startMonitoring', siteId: SITE, goals: ['security'] },
		{ resource: 'monitorGroup', operation: 'run', siteId: SITE, group: 'all' },
		{ resource: 'monitorGroup', operation: 'pause', siteId: SITE, group: 'design', duration: '1h' },
		{ resource: 'monitorGroup', operation: 'resume', siteId: SITE, group: 'design' },
		{ resource: 'run', operation: 'getLatest', siteId: SITE },
		{ resource: 'heartbeat', operation: 'add', siteId: SITE, name: 'x' },
	];
	for (const op of ops) {
		const { calls } = await run([op], () => ({ body: { sites: [], runs: [] } }));
		for (const c of calls) assert.ok(c.url.startsWith(`${API}/`), `${op.resource} ${op.operation}: ${c.url}`);
	}
});

test("an HTTP refusal becomes a NodeApiError with Relvato's message and code", async () => {
	await assert.rejects(
		run([{ resource: 'monitorGroup', operation: 'run', siteId: SITE, group: 'all' }], () => ({
			statusCode: 409,
			body: { error: 'domain_unverified', message: 'Verify the domain first.' },
		})),
		(e) => e.constructor.name === 'NodeApiError' && e.message === 'Verify the domain first.' && e.httpCode === '409',
	);
});

test('continueOnFail turns the error into an item and carries on', async () => {
	let n = 0;
	const { out } = await run(
		[
			{ resource: 'monitorGroup', operation: 'run', siteId: SITE, group: 'all' },
			{ resource: 'monitorGroup', operation: 'run', siteId: SITE, group: 'all' },
		],
		() => (++n === 1 ? { statusCode: 429, body: { error: 'quota_exceeded' } } : { body: { queued: 1, runs: [] } }),
		true,
	);
	assert.equal(out.length, 2);
	assert.equal(out[0].json.error, "This account has used its plan's monthly runs.");
	assert.deepEqual(out[0].pairedItem, { item: 0 });
	assert.equal(out[1].json.queued, 1);
});

test('the site picker lists the account sites', async () => {
	const { ctx } = executeContext({ items: [{}], handler: () => ({ body: sites }) });
	const r = await node.methods.listSearch.searchSites.call(ctx, 'blog');
	assert.deepEqual(r.results, [{ name: 'Blog (https://blog.example)', value: 'other', url: 'https://app.relvato.com/sites/other' }]);
});

test("the AI Agent's tool descriptions (n8n builds them from each operation's action)", () => {
	const { NodeHelpers } = require('n8n-workflow');
	const tool = (resource, operation) =>
		NodeHelpers.getToolDescriptionForNode({ parameters: { resource, operation, descriptionType: 'auto' } }, node);
	assert.equal(tool('site', 'getAll'), 'Get many sites with platform and whether monitors run on their schedule in Relvato');
	assert.equal(tool('site', 'getOverview'), 'Get a site health overview with what needs attention in Relvato');
	assert.equal(tool('monitorGroup', 'run'), 'Run monitors now using the monthly runs of the plan in Relvato');
	for (const p of node.description.properties.filter((p) => p.name === 'operation')) {
		for (const o of p.options) {
			assert.ok(!/\b(check|checks|journey|journeys)\b/i.test(`${o.action} ${o.description}`), `${o.value}: monitor, not check/journey`);
		}
	}
});
