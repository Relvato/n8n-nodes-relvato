import type { INodeProperties } from 'n8n-workflow';
import { GOAL_OPTIONS } from '../shared/constants';
import { siteLocator } from '../shared/methods';

const show = (operation: string[]) => ({ show: { resource: ['site'], operation } });

export const siteOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['site'] } },
		options: [
			{
				name: 'Add',
				value: 'add',
				description:
					'Add a website to Relvato and return it with next_step, how to prove ownership; a site already on that domain is returned instead of a duplicate',
				action: 'Add a site and get how to prove its ownership',
			},
			{
				name: 'Find by Domain',
				value: 'findByDomain',
				description:
					'Find a site in this Relvato account by its domain, with the same fields as Get Many',
				action: 'Find a site by domain',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description:
					'List the websites in this Relvato account. platform is wordpress or other; ready is true once ownership is proven, so monitors run on their schedule and send alerts.',
				action: 'Get many sites with platform and whether monitors run on their schedule',
			},
			{
				name: 'Get Overview',
				value: 'getOverview',
				description:
					"A site's health in plain language: what needs attention, each monitor's latest result and schedule, setup state and recommended monitors",
				action: 'Get a site health overview with what needs attention',
			},
			{
				name: 'Start Monitoring for Goals',
				value: 'startMonitoring',
				description:
					'Turn on the monitors for what matters on a site (checkout and sign-in, security, search traffic and more) and return what was added',
				action: 'Start monitoring a site for goals',
			},
		],
		default: 'getAll',
	},
];

export const siteFields: INodeProperties[] = [
	// ── Get Many ──
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: show(['getAll']),
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		displayOptions: { show: { resource: ['site'], operation: ['getAll'], returnAll: [false] } },
		description: 'Max number of results to return',
	},

	// ── Find by Domain ──
	{
		displayName: 'Domain or URL',
		name: 'domain',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'myshop.example',
		displayOptions: show(['findByDomain']),
		description:
			'The site’s domain. Matches with or without https:// and www., so https://www.myshop.example finds myshop.example.',
	},

	// ── Add ──
	{
		displayName: 'Website URL',
		name: 'url',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'https://myshop.example',
		displayOptions: show(['add']),
		description: 'The site address',
	},
	{
		displayName: 'Platform',
		name: 'platform',
		type: 'options',
		required: true,
		options: [
			{
				name: 'Any Other Site or AI-Built App',
				value: 'other',
				description: 'Public-page monitors; ownership is proven by verifying the domain',
			},
			{
				name: 'WordPress / WooCommerce',
				value: 'wordpress',
				description: 'The deepest monitors, through the Relvato WordPress plugin',
			},
		],
		default: 'other',
		displayOptions: show(['add']),
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show(['add']),
		options: [
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'Display name. Defaults to the domain.',
			},
		],
	},

	// ── Get Overview, Start Monitoring for Goals ──
	siteLocator({ displayOptions: show(['getOverview', 'startMonitoring']) }),
	{
		displayName: 'Goals',
		name: 'goals',
		type: 'multiOptions',
		required: true,
		options: GOAL_OPTIONS,
		default: [],
		displayOptions: show(['startMonitoring']),
		description:
			'What matters on this site. Relvato adds the monitors that cover it on the current plan, plus uptime, SSL, errors, maintenance mode and structure.',
	},
];
