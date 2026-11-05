const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Relvato } = require('../dist/nodes/Relvato/Relvato.node');
const { executeContext, mcpResult, mcpError } = require('./helpers');

const node = new Relvato();
const SITE = '3f8a2c1e-9b7d-4e6a-8c5f-1d2e3f4a5b6c';
const sites = {
	sites: [
		{ id: SITE, name: 'My Shop', url: 'https://www.myshop.example', connectionType: 'wordpress' },
		{ id: 'other', name: 'Blog', url: 'https://blog.example', connectionType: 'none' },
	],
};
const run = (items, handler, continueOnFail) => {
	const { ctx, calls } = executeContext({ items, handler, continueOnFail });
	return node.execute.call(ctx).then((out) => ({ out: out[0], calls }));
};

test('Site → Find by Domain returns the matching site', async () => {
	const { out, calls } = await run([{ resource: 'site', operation: 'findByDomain', domain: 'https://myshop.example' }], () => ({ body: sites }));
	assert.equal(calls[0].url, 'https://app.relvato.com/api/v1/sites');
	assert.deepEqual(out.map((o) => o.json.id), [SITE]);
	assert.deepEqual(out[0].pairedItem, { item: 0 });
});

test('Site → Get Many honours the limit', async () => {
	const { out } = await run([{ resource: 'site', operation: 'getAll', returnAll: false, limit: 1 }], () => ({ body: sites }));
	assert.equal(out.length, 1);
});

test('Site → Add calls the add_site MCP tool and returns id, name, url, next_step', async () => {
	const answer = { created: true, site: { id: SITE, name: 'myshop.example', url: 'https://myshop.example' }, setup: { nextStep: 'Verify the domain.' } };
	const { out, calls } = await run(
		[{ resource: 'site', operation: 'add', url: 'https://myshop.example', platform: 'other', additionalFields: {} }],
		() => ({ body: mcpResult(answer) }),
	);
	assert.equal(calls[0].url, 'https://app.relvato.com/api/mcp');
	assert.deepEqual(calls[0].body, {
		jsonrpc: '2.0',
		id: 1,
		method: 'tools/call',
		params: { name: 'add_site', arguments: { url: 'https://myshop.example', platform: 'other' } },
	});
	assert.equal(out[0].json.id, SITE);
	assert.equal(out[0].json.next_step, 'Verify the domain.');
	assert.equal(out[0].json.created, true);
});

test('Site → Start Monitoring for Goals sends siteId and goals', async () => {
	const { out, calls } = await run(
		[{ resource: 'site', operation: 'startMonitoring', siteId: SITE, goals: ['security', 'flows'] }],
		() => ({ body: mcpResult({ siteId: SITE, monitorsAdded: ['uptime'] }) }),
	);
	assert.deepEqual(calls[0].body.params, { name: 'start_monitoring_for_goals', arguments: { siteId: SITE, goals: ['security', 'flows'] } });
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

test('Monitor Group → Pause / Resume call their MCP tools', async () => {
	const pause = await run([{ resource: 'monitorGroup', operation: 'pause', siteId: SITE, group: 'design', duration: '24h' }], () => ({ body: mcpResult({ monitorsOff: 3 }) }));
	assert.deepEqual(pause.calls[0].body.params, { name: 'pause_monitor_group', arguments: { siteId: SITE, group: 'design', duration: '24h' } });
	const resume = await run([{ resource: 'monitorGroup', operation: 'resume', siteId: SITE, group: 'design' }], () => ({ body: mcpResult({ wasPaused: true }) }));
	assert.deepEqual(resume.calls[0].body.params, { name: 'resume_monitor_group', arguments: { siteId: SITE, group: 'design' } });
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

test('Heartbeat → Add returns id, ping_url, fail_url', async () => {
	const answer = { heartbeatId: 'hb1', pingUrl: 'https://app.relvato.com/api/hb/t', failUrl: 'https://app.relvato.com/api/hb/t/fail' };
	const { out, calls } = await run(
		[{ resource: 'heartbeat', operation: 'add', siteId: SITE, name: 'Nightly backup', periodSec: 86400, graceSec: 3600 }],
		() => ({ body: mcpResult(answer) }),
	);
	assert.deepEqual(calls[0].body.params.arguments, { siteId: SITE, name: 'Nightly backup', periodSec: 86400, graceSec: 3600 });
	assert.equal(out[0].json.id, 'hb1');
	assert.equal(out[0].json.ping_url, answer.pingUrl);
	assert.equal(out[0].json.fail_url, answer.failUrl);
});

test("an MCP refusal becomes an error with Relvato's words", async () => {
	await assert.rejects(
		run([{ resource: 'heartbeat', operation: 'add', siteId: SITE, name: 'x' }], () => ({ body: mcpError('This plan allows 2 heartbeats.') })),
		(e) => e.constructor.name === 'NodeApiError' && e.message === 'This plan allows 2 heartbeats.',
	);
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
