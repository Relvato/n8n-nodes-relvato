const { test } = require('node:test');
const assert = require('node:assert/strict');
const { RelvatoTrigger } = require('../dist/nodes/RelvatoTrigger/RelvatoTrigger.node');
const { signPayload } = require('../dist/nodes/RelvatoTrigger/signature');
const { hookContext, webhookContext } = require('./helpers');

const trigger = new RelvatoTrigger();
const hooks = trigger.webhookMethods.default;
const WEBHOOK = 'https://n8n.example/webhook/0f1e/webhook';
const SITE = '3f8a2c1e-9b7d-4e6a-8c5f-1d2e3f4a5b6c';
const params = { event: 'newVulnerability', siteId: SITE, groups: [], skipNotRun: true };

test('create subscribes to the event with its filter and keeps id + secret', async () => {
	const { ctx, calls, staticData } = hookContext({
		params,
		webhookUrl: WEBHOOK,
		handler: () => ({ statusCode: 201, body: { id: 'hook-1', secret: 'whsec_abc', status: 'active' } }),
	});
	assert.equal(await hooks.create.call(ctx), true);
	assert.equal(calls.length, 1);
	assert.equal(calls[0].credentialType, 'relvatoApi');
	assert.equal(calls[0].method, 'POST');
	assert.equal(calls[0].url, 'https://app.relvato.com/api/v1/hooks');
	assert.deepEqual(calls[0].body, {
		url: WEBHOOK,
		events: ['check.failed'],
		filter: { siteId: SITE, keys: ['vuln-scan', 'cms-vulns'] },
	});
	assert.deepEqual(staticData, { hookId: 'hook-1', secret: 'whsec_abc' });
});

test('create replaces an existing subscription whose secret it no longer has', async () => {
	let posts = 0;
	const { ctx, calls, staticData } = hookContext({
		params,
		webhookUrl: WEBHOOK,
		handler: (req) => {
			if (req.method === 'DELETE') return { statusCode: 204 };
			posts++;
			return posts === 1
				? { statusCode: 200, body: { id: 'old', status: 'active' } }
				: { statusCode: 201, body: { id: 'new', secret: 'whsec_new' } };
		},
	});
	await hooks.create.call(ctx);
	assert.deepEqual(calls.map((c) => `${c.method} ${c.url}`), [
		'POST https://app.relvato.com/api/v1/hooks',
		'DELETE https://app.relvato.com/api/v1/hooks/old',
		'POST https://app.relvato.com/api/v1/hooks',
	]);
	assert.deepEqual(staticData, { hookId: 'new', secret: 'whsec_new' });
});

test("create surfaces Relvato's plan_required message", async () => {
	const { ctx } = hookContext({
		params,
		webhookUrl: WEBHOOK,
		handler: () => ({ statusCode: 403, body: { error: 'plan_required', minPlan: 'pro', message: 'Event subscriptions are on the Pro plan and up.' } }),
	});
	await assert.rejects(hooks.create.call(ctx), (e) => {
		assert.equal(e.message, 'Event subscriptions are on the Pro plan and up.');
		assert.equal(e.httpCode, '403');
		return true;
	});
});

test('in test mode, create asks Relvato for a sample event after it returns', async () => {
	const { ctx, calls } = hookContext({
		params,
		mode: 'manual',
		webhookUrl: WEBHOOK,
		handler: (req) => (req.url.endsWith('/hooks/test') ? { statusCode: 404, body: { error: 'not_found' } } : { statusCode: 201, body: { id: 'hook-1', secret: 'whsec_abc' } }),
	});
	assert.equal(await hooks.create.call(ctx), true);
	assert.equal(calls.length, 1, 'the sample is requested after create() returns');
	await new Promise((r) => setTimeout(r, 2300));
	assert.equal(calls.length, 2);
	assert.equal(calls[1].url, 'https://app.relvato.com/api/v1/hooks/test');
	assert.deepEqual(calls[1].body, { id: 'hook-1' });
	// …and its 404 (endpoint not live yet) was ignored: nothing threw.
});

test('checkExists: true for our active subscription with the same settings', async () => {
	const list = { subscriptions: [{ id: 'hook-1', host: 'n8n.example', events: ['check.failed'], filter: { keys: ['cms-vulns', 'vuln-scan'], siteId: SITE }, status: 'active' }] };
	const { ctx } = hookContext({ params, webhookUrl: WEBHOOK, staticData: { hookId: 'hook-1', secret: 'whsec_abc' }, handler: () => ({ body: list }) });
	assert.equal(await hooks.checkExists.call(ctx), true);
});

test('checkExists: false (and nothing called) without a stored id', async () => {
	const { ctx, calls } = hookContext({ params, webhookUrl: WEBHOOK, handler: () => ({ body: { subscriptions: [] } }) });
	assert.equal(await hooks.checkExists.call(ctx), false);
	assert.equal(calls.length, 0);
});

test('checkExists: a disabled subscription is deleted and recreated', async () => {
	const list = { subscriptions: [{ id: 'hook-1', host: 'n8n.example', events: ['check.failed'], filter: { keys: ['vuln-scan', 'cms-vulns'], siteId: SITE }, status: 'disabled' }] };
	const { ctx, calls, staticData } = hookContext({
		params,
		webhookUrl: WEBHOOK,
		staticData: { hookId: 'hook-1', secret: 'whsec_abc' },
		handler: (req) => (req.method === 'DELETE' ? { statusCode: 204 } : { body: list }),
	});
	assert.equal(await hooks.checkExists.call(ctx), false);
	assert.equal(calls[1].method, 'DELETE');
	assert.deepEqual(staticData, {});
});

test('checkExists: gone on Relvato → false and static data cleared', async () => {
	const { ctx, staticData } = hookContext({ params, webhookUrl: WEBHOOK, staticData: { hookId: 'hook-1', secret: 'whsec_abc' }, handler: () => ({ body: { subscriptions: [] } }) });
	assert.equal(await hooks.checkExists.call(ctx), false);
	assert.deepEqual(staticData, {});
});

test('delete unsubscribes; a 404 counts as already gone', async () => {
	for (const statusCode of [204, 404]) {
		const { ctx, calls, staticData } = hookContext({ params, webhookUrl: WEBHOOK, staticData: { hookId: 'hook-1', secret: 'whsec_abc' }, handler: () => ({ statusCode, body: statusCode === 404 ? { error: 'not_found' } : '' }) });
		assert.equal(await hooks.delete.call(ctx), true);
		assert.equal(calls[0].method, 'DELETE');
		assert.equal(calls[0].url, 'https://app.relvato.com/api/v1/hooks/hook-1');
		assert.deepEqual(staticData, {});
	}
});

test('delete still fails loudly on other errors', async () => {
	const { ctx } = hookContext({ params, webhookUrl: WEBHOOK, staticData: { hookId: 'hook-1', secret: 'whsec_abc' }, handler: () => ({ statusCode: 500, body: { error: 'internal' } }) });
	await assert.rejects(hooks.delete.call(ctx));
});

// ── webhook() ──

const secret = 'whsec_abc';
const event = (outcome) => ({
	version: 1,
	id: 'evt_1',
	type: 'check.failed',
	created_at: '2026-11-01T09:14:05.000Z',
	site: { id: SITE, name: 'My Shop', url: 'https://myshop.example' },
	check: { key: 'vuln-scan', name: 'Vulnerabilities', group: 'Security', severity: 'critical' },
	run: { id: 'r1', url: 'https://app.relvato.com/runs/r1', status: 'failed', error: 'x', failed_step: null, trigger: null, changes: null, outcome, not_run_reason: outcome === 'not-run' ? 'firewall' : null },
	quarantine: null,
});
const deliver = (body, header, p = params) =>
	webhookContext({ params: p, staticData: { hookId: 'hook-1', secret }, rawBody: body, headers: { 'relvato-signature': header } });

test('webhook: a correctly signed event starts the workflow with the event as data', async () => {
	const body = JSON.stringify(event('issue'));
	const { ctx } = deliver(body, signPayload(secret, body, Math.floor(Date.now() / 1000)));
	const r = await trigger.webhook.call(ctx);
	assert.deepEqual(r.workflowData, [[{ json: JSON.parse(body) }]]);
});

test('webhook: a bad signature gets 401 and starts nothing', async () => {
	const body = JSON.stringify(event('issue'));
	const now = Math.floor(Date.now() / 1000);
	for (const header of [undefined, signPayload('whsec_wrong', body, now), signPayload(secret, body.replace('issue', 'ok'), now)]) {
		const { ctx, response } = deliver(body, header);
		const r = await trigger.webhook.call(ctx);
		assert.equal(r.workflowData, undefined);
		assert.equal(r.noWebhookResponse, true);
		assert.equal(response.statusCode, 401);
	}
});

test('webhook: a run that could not happen is skipped by default, kept when asked', async () => {
	const body = JSON.stringify(event('not-run'));
	const header = signPayload(secret, body, Math.floor(Date.now() / 1000));
	const skipped = await trigger.webhook.call(deliver(body, header).ctx);
	assert.equal(skipped.workflowData, undefined);
	assert.ok(skipped.webhookResponse);
	const kept = await trigger.webhook.call(deliver(body, header, { ...params, skipNotRun: false }).ctx);
	assert.equal(kept.workflowData[0][0].json.run.outcome, 'not-run');
});
