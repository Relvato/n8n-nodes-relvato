import type { INodeProperties } from 'n8n-workflow';
import { GROUP_OPTIONS } from '../shared/constants';
import { siteLocator } from '../shared/methods';

const show = (operation: string[]) => ({ show: { resource: ['monitorGroup'], operation } });

export const monitorGroupOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['monitorGroup'] } },
		options: [
			{
				name: 'Pause',
				value: 'pause',
				description:
					'Pause one group of monitors on a site for 1 hour, 24 hours or until resumed, for maintenance or a redesign',
				action: 'Pause a monitor group',
			},
			{
				name: 'Resume',
				value: 'resume',
				description: 'Resume a paused group of monitors on a site',
				action: 'Resume a monitor group',
			},
			{
				name: 'Run Monitors Now',
				value: 'run',
				description:
					"Run a site's monitors now, or one group of them, for example after a deploy. Each run counts toward the plan's monthly runs.",
				action: 'Run monitors now',
			},
		],
		default: 'run',
	},
];

export const monitorGroupFields: INodeProperties[] = [
	siteLocator({ displayOptions: show(['run', 'pause', 'resume']) }),

	// ── Run Monitors Now: the group is optional ──
	{
		displayName: 'Monitor Group',
		name: 'group',
		type: 'options',
		options: [{ name: 'All Enabled Monitors', value: 'all' }, ...GROUP_OPTIONS],
		default: 'all',
		displayOptions: show(['run']),
		description:
			"Only this group, or every enabled monitor. Each run counts toward the plan's monthly runs.",
	},

	// ── Pause / Resume: one group ──
	{
		displayName: 'Monitor Group',
		name: 'group',
		type: 'options',
		required: true,
		options: GROUP_OPTIONS,
		default: 'uptime',
		displayOptions: show(['pause', 'resume']),
	},
	{
		displayName: 'For How Long',
		name: 'duration',
		type: 'options',
		required: true,
		options: [
			{ name: '1 Hour', value: '1h' },
			{ name: '24 Hours', value: '24h' },
			{ name: 'Until Resumed', value: 'until' },
		],
		default: '1h',
		displayOptions: show(['pause']),
		description: 'When the time is up the group resumes on its own',
	},
];
