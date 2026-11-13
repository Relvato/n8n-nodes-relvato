import type { IDataObject } from 'n8n-workflow';

/** Pure helpers, shared by both nodes and covered by the tests. No n8n context, no I/O. */

/** A site as REST lists it (GET /api/v1/sites), for the Site pickers. */
export interface RelvatoSite extends IDataObject {
	id: string;
	name: string | null;
	url: string;
}

/** A site as Get Many and Find by Domain return it. */
export interface RelvatoSiteSummary extends RelvatoSite {
	platform: 'wordpress' | 'other';
	/** Ownership is proven: monitors run on their schedule and send alerts. */
	ready: boolean;
	disabled: boolean;
}

/**
 * The fields Get Many and Find by Domain return for a site. GET /api/v1/sites also sends the raw connectionType, left
 * out on purpose: an AI Agent read connectionType "none" as "not monitored", when it only means the WordPress plugin
 * isn't connected. `ready` is what says whether monitors run.
 */
export function siteSummary(s: RelvatoSiteSummary): RelvatoSiteSummary {
	return {
		id: s.id,
		name: s.name ?? null,
		url: s.url,
		platform: s.platform,
		ready: s.ready === true,
		disabled: s.disabled === true,
	};
}

export interface RelvatoRun extends IDataObject {
	id: string;
	finished?: boolean;
}

/**
 * The bare host of a domain or URL: lower case, without `https://` and without `www.`.
 * "https://www.MyShop.example/path" and "myshop.example" both give "myshop.example". "" when it isn't one.
 */
export function hostOf(value: string): string {
	const s = (value ?? '').trim();
	if (!s) return '';
	try {
		return new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`).hostname
			.toLowerCase()
			.replace(/^www\./, '');
	} catch {
		return '';
	}
}

/** The account's sites on this domain (Find by Domain): matched with or without https:// and www. */
export function sitesMatchingDomain<T extends { url: string }>(sites: T[], domain: string): T[] {
	const want = hostOf(domain);
	if (!want) return [];
	return sites.filter((s) => hostOf(s.url) === want);
}

/** The newest finished run of a list Relvato returns newest first (Get Latest Run). */
export function latestFinishedRun<T extends { finished?: boolean }>(runs: T[]): T | undefined {
	return runs.find((r) => r.finished === true);
}

/** Drop optional values the user left empty. */
export function compact<T extends IDataObject>(o: T): IDataObject {
	return Object.fromEntries(
		Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''),
	);
}

/** Error codes Relvato answers without a sentence of its own, in words. */
const CODE_MESSAGES: Record<string, string> = {
	not_found: "Relvato couldn't find that on this account.",
	site_disabled: 'This site is disabled in Relvato.',
	quota_exceeded: "This account has used its plan's monthly runs.",
	rate_limited: "Relvato's API rate limit was reached. Try again in a minute.",
	insufficient_scope:
		'This API key is read-only. Create a full-access key under API access to make changes or run monitors.',
};

/**
 * Relvato's own words for a refused request, so the n8n error says what to do:
 * `{ error: "plan_required", message: "Event subscriptions are on the Pro plan and up." }` → that message.
 */
export function relvatoErrorMessage(status: number, body: unknown): string {
	const b = body && typeof body === 'object' ? (body as IDataObject) : {};
	if (typeof b.message === 'string' && b.message) return b.message;
	const code = typeof b.error === 'string' ? b.error : '';
	if (code === 'rate_limited' && typeof b.retryAfterSeconds === 'number') {
		return `Relvato's API rate limit was reached. Try again in ${b.retryAfterSeconds} seconds.`;
	}
	if (code && CODE_MESSAGES[code]) return CODE_MESSAGES[code];
	if (typeof body === 'string' && body.trim() && body.length < 300) return body.trim();
	return `Relvato answered HTTP ${status}${code ? ` (${code})` : ''}.`;
}

