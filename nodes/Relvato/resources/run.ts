import type { INodeProperties } from 'n8n-workflow';
import { siteLocator } from '../shared/methods';

export const runOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['run'] } },
		options: [
			{
				name: 'Get Latest',
				value: 'getLatest',
				description:
					"Get a site's most recent finished run with its result, or nothing when no run has finished yet",
				action: 'Get the latest finished run of a site',
			},
		],
		default: 'getLatest',
	},
];

export const runFields: INodeProperties[] = [
	siteLocator({ displayOptions: { show: { resource: ['run'], operation: ['getLatest'] } } }),
];
