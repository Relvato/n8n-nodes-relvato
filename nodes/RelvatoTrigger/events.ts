import type { IDataObject, INodePropertyOptions } from 'n8n-workflow';

/**
 * The trigger's events — the same nine as the Zapier app (relvato-zapier/triggers/index.js). Each one is a Relvato
 * event subscription: one event type, plus fixed monitor keys for the specific ones (Site Down = the uptime monitor).
 * Pure: no n8n context, covered by the tests.
 */
export type RelvatoEventType = 'check.failed' | 'check.recovered' | 'quarantine.change';

export interface TriggerEventDefinition {
	value: string;
	name: string;
	description: string;
	event: RelvatoEventType;
	/** Fixed monitor keys (filter.keys). */
	keys?: string[];
	/** The user may narrow it to monitor groups. */
	chooseGroups?: boolean;
}

export const TRIGGER_EVENTS: TriggerEventDefinition[] = [
	{
		value: 'monitorFailed',
		name: 'Monitor Found a Problem',
		description:
			'A monitor starts failing on one of your sites. A monitor that’s already failing doesn’t trigger it again.',
		event: 'check.failed',
		chooseGroups: true,
	},
	{
		value: 'monitorRecovered',
		name: 'Monitor Recovered',
		description: 'A monitor that was failing passes again',
		event: 'check.recovered',
		chooseGroups: true,
	},
	{
		value: 'siteDown',
		name: 'Site Down',
		description: 'The Uptime monitor finds a site down',
		event: 'check.failed',
		keys: ['uptime'],
	},
	{
		value: 'siteUp',
		name: 'Site Back Up',
		description: 'A site that was down answers again',
		event: 'check.recovered',
		keys: ['uptime'],
	},
	{
		value: 'newVulnerability',
		name: 'New Vulnerability Found',
		description:
			'A vulnerability monitor finds a known vulnerability (WordPress plugins and themes, or Drupal, Joomla, PrestaShop and Magento core)',
		event: 'check.failed',
		keys: ['vuln-scan', 'cms-vulns'],
	},
	{
		value: 'visualChange',
		name: 'Page Looks Different',
		description: 'The visual monitor finds a page that no longer matches its approved screenshot',
		event: 'check.failed',
		keys: ['visual-regression'],
	},
	{
		value: 'searchDrop',
		name: 'Search Traffic Dropped',
		description: 'Google or Bing search traffic to a site drops sharply',
		event: 'check.failed',
		keys: ['google-search', 'bing-search'],
	},
	{
		value: 'certificateOrDomain',
		name: 'SSL Certificate or Domain Expiring',
		description:
			'An SSL certificate or the domain registration is close to expiring, or a certificate problem appears',
		event: 'check.failed',
		keys: ['ssl', 'domain-registration', 'cert-watch'],
	},
	{
		value: 'quarantineChange',
		name: 'Quarantine Mode Change',
		description:
			'Quarantine mode notices an unexpected change on a site that was just cleaned after a hack',
		event: 'quarantine.change',
	},
];

/** The Event parameter's choices, in alphabetical order as n8n lists options. */
export const EVENT_OPTIONS: INodePropertyOptions[] = [...TRIGGER_EVENTS]
	.sort((a, b) => a.name.localeCompare(b.name))
	.map(({ name, value, description }) => ({ name, value, description }));

/** The trigger events whose groups the user may choose / whose not-run runs may be skipped (for displayOptions). */
export const EVENTS_WITH_GROUPS = TRIGGER_EVENTS.filter((e) => e.chooseGroups).map((e) => e.value);
export const EVENTS_WITH_SKIP = TRIGGER_EVENTS.filter((e) => e.event === 'check.failed').map(
	(e) => e.value,
);

export function triggerEventFor(value: string): TriggerEventDefinition | undefined {
	return TRIGGER_EVENTS.find((e) => e.value === value);
}

export interface SubscriptionFilter extends IDataObject {
	siteId?: string;
	groups?: string[];
	keys?: string[];
}

/** filter for POST /api/v1/hooks: the site, the groups (only where the event lets you choose), the fixed keys. */
export function subscriptionFilter(
	def: TriggerEventDefinition,
	choice: { siteId?: string; groups?: string[] },
): SubscriptionFilter {
	const filter: SubscriptionFilter = {};
	const siteId = (choice.siteId ?? '').trim();
	if (siteId) filter.siteId = siteId;
	const groups = def.chooseGroups ? (choice.groups ?? []).filter(Boolean) : [];
	if (groups.length) filter.groups = [...new Set(groups)];
	if (def.keys?.length) filter.keys = [...def.keys];
	return filter;
}

/** The POST /api/v1/hooks body: `{ url, events, filter? }`. */
export function subscriptionBody(
	def: TriggerEventDefinition,
	url: string,
	choice: { siteId?: string; groups?: string[] },
): IDataObject {
	const filter = subscriptionFilter(def, choice);
	return { url, events: [def.event], ...(Object.keys(filter).length ? { filter } : {}) };
}

const sameSet = (a: unknown, b: string[] | undefined) => {
	const x = Array.isArray(a) ? (a as string[]) : [];
	const y = b ?? [];
	return x.length === y.length && x.every((v) => y.includes(v));
};

/**
 * Is this subscription (from GET /api/v1/hooks, which shows the host, never the URL) the one this trigger wants:
 * active, sending to this webhook's host, for the same event and the same filter?
 */
export function subscriptionMatchesConfig(
	sub: IDataObject,
	wanted: { host: string; events: string[]; filter: SubscriptionFilter },
): boolean {
	if (sub.status !== 'active') return false;
	if (
		typeof sub.host === 'string' &&
		wanted.host &&
		sub.host.toLowerCase() !== wanted.host.toLowerCase()
	)
		return false;
	if (!sameSet(sub.events, wanted.events)) return false;
	const f = (sub.filter && typeof sub.filter === 'object' ? sub.filter : {}) as SubscriptionFilter;
	return (
		(f.siteId ?? '') === (wanted.filter.siteId ?? '') &&
		sameSet(f.groups, wanted.filter.groups) &&
		sameSet(f.keys, wanted.filter.keys)
	);
}

/**
 * Should this delivered event start the workflow? A check.failed whose run couldn't happen (a firewall blocked
 * Relvato, the site didn't answer: run.outcome "not-run") is dropped when the user asked to skip those.
 */
export function shouldEmit(
	def: TriggerEventDefinition,
	event: IDataObject,
	skipNotRun: boolean,
): boolean {
	if (def.event !== 'check.failed' || !skipNotRun) return true;
	const run = event.run && typeof event.run === 'object' ? (event.run as IDataObject) : null;
	return !(run && run.outcome === 'not-run');
}
