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
					'Add a website to Relvato. If the account already has a site on that domain, it is returned instead of a duplicate.',
				action: 'Add a site',
			},
			{
				name: 'Find by Domain',
				value: 'findByDomain',
				description: 'Find a site on the Relvato account by its domain',
				action: 'Find a site by domain',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List the sites on the Relvato account',
				action: 'Get many sites',
			},
			{
				name: 'Start Monitoring for Goals',
				value: 'startMonitoring',
				description:
					'Turn on the monitors for what you care about on a site: checkout and sign-in, security, search traffic and more',
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

	// ── Start Monitoring for Goals ──
	siteLocator({ displayOptions: show(['startMonitoring']) }),
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
