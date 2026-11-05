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
					'Create a heartbeat for a job you run (a cron job, a backup, a scheduled task) and get its ping URL. If no ping arrives in time, Relvato alerts you.',
				action: 'Add a heartbeat',
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
		displayName: 'How Often It Runs (Seconds)',
		name: 'periodSec',
		type: 'number',
		typeOptions: { minValue: 60, maxValue: 2678400 },
		default: 86400,
		displayOptions: show,
		description: '86400 = once a day',
	},
	{
		displayName: 'Grace (Seconds)',
		name: 'graceSec',
		type: 'number',
		typeOptions: { minValue: 60, maxValue: 604800 },
		default: 3600,
		displayOptions: show,
		description: 'How late a ping may be before it counts as missed',
	},
];
