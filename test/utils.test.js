const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
	hostOf,
	sitesMatchingDomain,
	latestFinishedRun,
	relvatoErrorMessage,
	parseToolResult,
} = require('../dist/nodes/Relvato/shared/utils');

const sites = [
	{ id: 'a', name: 'My Shop', url: 'https://www.myshop.example' },
	{ id: 'b', name: 'Blog', url: 'https://blog.myshop.example/' },
	{ id: 'c', name: 'Other', url: 'http://other.example' },
];

test('hostOf strips the scheme, www. and the path, and lower-cases', () => {
	assert.equal(hostOf('https://www.MyShop.example/path?q=1'), 'myshop.example');
	assert.equal(hostOf('myshop.example'), 'myshop.example');
	assert.equal(hostOf('  WWW.myshop.example  '), 'myshop.example');
	assert.equal(hostOf('http://myshop.example:8080'), 'myshop.example');
	assert.equal(hostOf(''), '');
	assert.equal(hostOf('not a url'), '');
});

test('find by domain matches with or without https:// and www.', () => {
	for (const q of ['myshop.example', 'www.myshop.example', 'https://myshop.example', 'https://www.myshop.example/shop']) {
		assert.deepEqual(sitesMatchingDomain(sites, q).map((s) => s.id), ['a'], q);
	}
	assert.deepEqual(sitesMatchingDomain(sites, 'blog.myshop.example').map((s) => s.id), ['b']);
	assert.deepEqual(sitesMatchingDomain(sites, 'other.example').map((s) => s.id), ['c']);
	assert.deepEqual(sitesMatchingDomain(sites, 'nowhere.example'), []);
	assert.deepEqual(sitesMatchingDomain(sites, ''), []);
});

test('latest run = the newest finished one', () => {
	const runs = [
		{ id: 'r3', finished: false, status: 'running' },
		{ id: 'r2', finished: true, status: 'failed' },
		{ id: 'r1', finished: true, status: 'passed' },
	];
	assert.equal(latestFinishedRun(runs).id, 'r2');
	assert.equal(latestFinishedRun([{ id: 'x', finished: false }]), undefined);
	assert.equal(latestFinishedRun([]), undefined);
});

test("errors carry Relvato's own message", () => {
	assert.equal(
		relvatoErrorMessage(403, { error: 'plan_required', minPlan: 'pro', message: 'Event subscriptions are on the Pro plan and up.' }),
		'Event subscriptions are on the Pro plan and up.',
	);
	assert.match(relvatoErrorMessage(401, { error: 'unauthorized', message: "This Relvato API key isn't valid: it may be mistyped or revoked." }), /isn't valid/);
	assert.equal(relvatoErrorMessage(429, { error: 'rate_limited', retryAfterSeconds: 12 }), "Relvato's API rate limit was reached. Try again in 12 seconds.");
	assert.equal(relvatoErrorMessage(409, { error: 'site_disabled' }), 'This site is disabled in Relvato.');
	assert.equal(relvatoErrorMessage(502, ''), 'Relvato answered HTTP 502.');
	assert.equal(relvatoErrorMessage(418, { error: 'teapot' }), 'Relvato answered HTTP 418 (teapot).');
});

test('MCP answers: JSON result, tool refusal, JSON-RPC error', () => {
	const ok = { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: '{"heartbeatId":"h1"}' }] } };
	assert.deepEqual(parseToolResult(ok), { data: { heartbeatId: 'h1' } });
	const refused = { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'Heartbeat limit reached.' }], isError: true } };
	assert.deepEqual(parseToolResult(refused), { error: 'Heartbeat limit reached.' });
	assert.deepEqual(parseToolResult({ jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'Unknown tool: x' } }), { error: 'Unknown tool: x' });
	assert.deepEqual(parseToolResult({ result: { content: [{ type: 'text', text: 'plain words' }] } }), { data: { message: 'plain words' } });
});
