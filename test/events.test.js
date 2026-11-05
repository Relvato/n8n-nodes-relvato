const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
	TRIGGER_EVENTS,
	EVENT_OPTIONS,
	EVENTS_WITH_SKIP,
	EVENTS_WITH_GROUPS,
	triggerEventFor,
	subscriptionBody,
	subscriptionFilter,
	subscriptionMatchesConfig,
	shouldEmit,
} = require('../dist/nodes/RelvatoTrigger/events');

const URL = 'https://n8n.example/webhook/abc/webhook';

test('the nine events map to the event type and filter keys of the Zapier app', () => {
	const expected = {
		monitorFailed: ['check.failed', undefined],
		monitorRecovered: ['check.recovered', undefined],
		siteDown: ['check.failed', ['uptime']],
		siteUp: ['check.recovered', ['uptime']],
		newVulnerability: ['check.failed', ['vuln-scan', 'cms-vulns']],
		visualChange: ['check.failed', ['visual-regression']],
		searchDrop: ['check.failed', ['google-search', 'bing-search']],
		certificateOrDomain: ['check.failed', ['ssl', 'domain-registration', 'cert-watch']],
		quarantineChange: ['quarantine.change', undefined],
	};
	assert.equal(TRIGGER_EVENTS.length, 9);
	for (const [value, [type, keys]] of Object.entries(expected)) {
		const body = subscriptionBody(triggerEventFor(value), URL, {});
		assert.deepEqual(body.events, [type], value);
		assert.deepEqual(body.filter?.keys, keys, value);
	}
});

test('no filter at all for an unfiltered event', () => {
	assert.deepEqual(subscriptionBody(triggerEventFor('monitorFailed'), URL, { siteId: '', groups: [] }), {
		url: URL,
		events: ['check.failed'],
	});
});

test('site and groups go into the filter; groups only where the event offers them', () => {
	const site = '3f8a2c1e-9b7d-4e6a-8c5f-1d2e3f4a5b6c';
	assert.deepEqual(subscriptionFilter(triggerEventFor('monitorFailed'), { siteId: site, groups: ['security', 'seo', 'security'] }), {
		siteId: site,
		groups: ['security', 'seo'],
	});
	assert.deepEqual(subscriptionFilter(triggerEventFor('siteDown'), { siteId: site, groups: ['security'] }), {
		siteId: site,
		keys: ['uptime'],
	});
});

test('options are alphabetical; groups and the skip option show where Zapier offers them', () => {
	const names = EVENT_OPTIONS.map((o) => o.name);
	assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
	assert.deepEqual(EVENTS_WITH_GROUPS, ['monitorFailed', 'monitorRecovered']);
	assert.deepEqual(EVENTS_WITH_SKIP.sort(), ['certificateOrDomain', 'monitorFailed', 'newVulnerability', 'searchDrop', 'siteDown', 'visualChange']);
});

test('skip-not-run drops a check.failed that could not run, only when asked', () => {
	const failed = triggerEventFor('monitorFailed');
	const notRun = { type: 'check.failed', run: { outcome: 'not-run', not_run_reason: 'firewall' } };
	const issue = { type: 'check.failed', run: { outcome: 'issue', not_run_reason: null } };
	assert.equal(shouldEmit(failed, notRun, true), false);
	assert.equal(shouldEmit(failed, notRun, false), true);
	assert.equal(shouldEmit(failed, issue, true), true);
	assert.equal(shouldEmit(failed, { type: 'check.failed', run: null }, true), true);
	assert.equal(shouldEmit(triggerEventFor('monitorRecovered'), { run: { outcome: 'not-run' } }, true), true);
	assert.equal(shouldEmit(triggerEventFor('quarantineChange'), { run: null, quarantine: {} }, true), true);
});

test('an existing subscription matches only when active, same host, event and filter', () => {
	const wanted = { host: 'n8n.example', events: ['check.failed'], filter: { keys: ['vuln-scan', 'cms-vulns'] } };
	const sub = { id: 'h1', host: 'n8n.example', events: ['check.failed'], filter: { keys: ['cms-vulns', 'vuln-scan'] }, status: 'active' };
	assert.equal(subscriptionMatchesConfig(sub, wanted), true);
	assert.equal(subscriptionMatchesConfig({ ...sub, status: 'disabled' }, wanted), false);
	assert.equal(subscriptionMatchesConfig({ ...sub, host: 'other.example' }, wanted), false);
	assert.equal(subscriptionMatchesConfig({ ...sub, events: ['check.recovered'] }, wanted), false);
	assert.equal(subscriptionMatchesConfig({ ...sub, filter: { keys: ['vuln-scan'] } }, wanted), false);
	assert.equal(subscriptionMatchesConfig({ ...sub, filter: { keys: ['vuln-scan', 'cms-vulns'], siteId: 's1' } }, wanted), false);
	assert.equal(subscriptionMatchesConfig({ ...sub, filter: null }, { ...wanted, filter: {} }), true);
});
