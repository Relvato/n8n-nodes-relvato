import type { INodeProperties } from 'n8n-workflow';
import { siteLocator } from '../shared/methods';

const show = { show: { resource: ['heartbeat'], operation: ['add'] } };

export const heartbeatOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['heartbeat'] } },
		options: [
			{
				name: 'Add',
				value: 'add',
				description:
					'Create a heartbeat for a job you run (a cron job, a backup, a scheduled task) and return its ping URL; Relvato alerts you when no ping arrives in time',
				action: 'Add a heartbeat and get its ping URL',
			},
		],
		default: 'add',
	},
];

export const heartbeatFields: INodeProperties[] = [
	siteLocator({ displayOptions: show }),
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'Nightly backup',
		displayOptions: show,
		description: 'What the job is',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show,
		options: [
			{
				displayName: 'Grace (Seconds)',
				name: 'graceSec',
				type: 'number',
				typeOptions: { minValue: 60, maxValue: 604800 },
				default: 3600,
				description: 'How late a ping may be before it counts as missed. Left out, Relvato allows 3600 (an hour).',
			},
			{
				displayName: 'How Often It Runs (Seconds)',
				name: 'periodSec',
				type: 'number',
				typeOptions: { minValue: 60, maxValue: 2678400 },
				default: 86400,
				description: 'Left out, Relvato expects a ping once a day (86400)',
			},
		],
	},
];
