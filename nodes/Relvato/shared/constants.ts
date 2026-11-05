import type { INodePropertyOptions } from 'n8n-workflow';

/** Relvato's app and API. Fixed: the package talks to one service only. */
export const RELVATO_BASE_URL = 'https://app.relvato.com';

/** Monitor groups (core plugin-groups.ts CHECK_GROUPS ids), with the labels the Zapier app uses. */
export const GROUP_OPTIONS: INodePropertyOptions[] = [
	{ name: 'Design', value: 'design' },
	{ name: 'Domain Lifecycle', value: 'domain' },
	{ name: 'Legal Compliance', value: 'compliance' },
	{ name: 'Performance', value: 'performance' },
	{ name: 'Security', value: 'security' },
	{ name: 'SEO / AEO', value: 'seo' },
	{ name: 'Uptime (Uptime, Heartbeats, Ports)', value: 'uptime' },
	{ name: 'User Flows (Checkout, Logins, Forms)', value: 'flow' },
];

/** Goals for start_monitoring_for_goals, labelled as in the Zapier app. */
export const GOAL_OPTIONS: INodePropertyOptions[] = [
	{ name: 'Catch Broken Pages', value: 'design' },
	{ name: 'Catch Hacks and Vulnerabilities', value: 'security' },
	{ name: 'Guard the Domain', value: 'domain' },
	{ name: 'Keep Checkout and Sign-In Working', value: 'flows' },
	{ name: 'Keep It Fast', value: 'speed' },
	{ name: 'Law Compliance', value: 'compliance' },
	{ name: 'Protect Search Traffic', value: 'search' },
];
