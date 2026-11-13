import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { heartbeatFields, heartbeatOperations } from './resources/heartbeat';
import { monitorGroupFields, monitorGroupOperations } from './resources/monitorGroup';
import { runFields, runOperations } from './resources/run';
import { siteFields, siteOperations } from './resources/site';
import { searchSites } from './shared/methods';
import { relvatoApiRequest } from './shared/transport';
import type { RelvatoRun, RelvatoSiteSummary } from './shared/utils';
import { compact, latestFinishedRun, siteSummary, sitesMatchingDomain } from './shared/utils';

/**
 * Relvato actions, each one a call to Relvato's REST API (/api/v1). Programmatic rather than declarative: the
 * searches filter client-side (domain matching, the newest finished run) and some answers are reshaped (a scan's run
 * ids, a heartbeat's ping URL), which declarative routing can't express.
 */
export class Relvato implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Relvato',
		name: 'relvato',
		icon: { light: 'file:../../icons/relvato.svg', dark: 'file:../../icons/relvato.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			"Add sites, read a site's health, start monitoring, run monitors, pause monitor groups and create heartbeats on the Relvato website monitoring platform",
		defaults: {
			name: 'Relvato',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'relvatoApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Heartbeat', value: 'heartbeat' },
					{ name: 'Monitor Group', value: 'monitorGroup' },
					{ name: 'Run', value: 'run' },
					{ name: 'Site', value: 'site' },
				],
				default: 'site',
			},
			...siteOperations,
			...siteFields,
			...monitorGroupOperations,
			...monitorGroupFields,
			...runOperations,
			...runFields,
			...heartbeatOperations,
			...heartbeatFields,
		],
	};

	methods = {
		listSearch: {
			searchSites,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				const out = (json: IDataObject) => returnData.push({ json, pairedItem: { item: i } });
				const siteId = () => {
					const id = String(
						this.getNodeParameter('siteId', i, '', { extractValue: true }) ?? '',
					).trim();
					if (!id) throw new NodeOperationError(this.getNode(), 'Choose a site.', { itemIndex: i });
					return id;
				};

				const sitePath = (id: string) => `/api/v1/sites/${encodeURIComponent(id)}`;

				if (resource === 'site') {
					if (operation === 'getAll' || operation === 'findByDomain') {
						// platform, and ready (ownership proven, so monitors run on their schedule and alert), without the raw
						// connectionType, which reads as "not monitored" when it only means the WordPress plugin isn't connected.
						const r = await relvatoApiRequest.call(this, 'GET', '/api/v1/sites', { itemIndex: i });
						let sites = ((Array.isArray(r.sites) ? r.sites : []) as RelvatoSiteSummary[]).map(
							siteSummary,
						);
						if (operation === 'findByDomain') {
							sites = sitesMatchingDomain(sites, this.getNodeParameter('domain', i) as string);
						} else if (!(this.getNodeParameter('returnAll', i) as boolean)) {
							sites = sites.slice(0, this.getNodeParameter('limit', i) as number);
						}
						sites.forEach((s) => out(s));
					} else if (operation === 'add') {
						const additional = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
						const r = await relvatoApiRequest.call(this, 'POST', '/api/v1/sites', {
							body: compact({
								url: this.getNodeParameter('url', i) as string,
								platform: this.getNodeParameter('platform', i) as string,
								name: additional.name as string | undefined,
							}),
							itemIndex: i,
						});
						// Relvato answers { created, site, setup }; setup.nextStep says how to prove ownership (null once proven).
						const site = (r.site ?? r) as IDataObject;
						const setup = (r.setup ?? {}) as IDataObject;
						out({
							...r,
							id: site.id,
							name: site.name,
							url: site.url,
							next_step: setup.nextStep ?? null,
						});
					} else if (operation === 'getOverview') {
						const id = siteId();
						const r = await relvatoApiRequest.call(this, 'GET', `${sitePath(id)}/overview`, {
							itemIndex: i,
						});
						out({ ...r, id });
					} else if (operation === 'startMonitoring') {
						const id = siteId();
						const goals = this.getNodeParameter('goals', i, []) as string[];
						if (!goals.length) {
							throw new NodeOperationError(this.getNode(), 'Pick at least one goal.', {
								itemIndex: i,
							});
						}
						const r = await relvatoApiRequest.call(this, 'POST', `${sitePath(id)}/goals`, {
							body: { goals },
							itemIndex: i,
						});
						out({ ...r, id });
					} else {
						throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`, {
							itemIndex: i,
						});
					}
				} else if (resource === 'monitorGroup') {
					const id = siteId();
					const group = this.getNodeParameter('group', i) as string;
					const groupPath = `${sitePath(id)}/groups/${encodeURIComponent(group)}`;
					if (operation === 'run') {
						const response = await relvatoApiRequest.call(
							this,
							'POST',
							`${sitePath(id)}/scan`,
							{ body: group && group !== 'all' ? { group } : {}, itemIndex: i },
						);
						const runs = (Array.isArray(response.runs) ? response.runs : []) as IDataObject[];
						out({
							...response,
							id,
							queued: response.queued ?? 0,
							run_ids: runs.map((r) => r.runId),
						});
					} else if (operation === 'pause') {
						const duration = this.getNodeParameter('duration', i) as string;
						const r = await relvatoApiRequest.call(this, 'POST', `${groupPath}/pause`, {
							body: { duration },
							itemIndex: i,
						});
						out({ ...r, id });
					} else if (operation === 'resume') {
						const r = await relvatoApiRequest.call(this, 'POST', `${groupPath}/resume`, {
							body: {},
							itemIndex: i,
						});
						out({ ...r, id });
					} else {
						throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`, {
							itemIndex: i,
						});
					}
				} else if (resource === 'run' && operation === 'getLatest') {
					const response = await relvatoApiRequest.call(this, 'GET', '/api/v1/runs', {
						qs: { siteId: siteId(), limit: 25 },
						itemIndex: i,
					});
					const latest = latestFinishedRun(
						(Array.isArray(response.runs) ? response.runs : []) as RelvatoRun[],
					);
					if (latest) out(latest);
				} else if (resource === 'heartbeat' && operation === 'add') {
					const name = this.getNodeParameter('name', i) as string;
					// Left out, Relvato uses once a day (86400) with an hour's grace (3600).
					const additional = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
					const r = await relvatoApiRequest.call(this, 'POST', `${sitePath(siteId())}/heartbeats`, {
						body: compact({
							name,
							periodSec: additional.periodSec as number | undefined,
							graceSec: additional.graceSec as number | undefined,
						}),
						itemIndex: i,
					});
					// Relvato answers { heartbeatId, pingUrl, failUrl, cronExample, … }.
					out({
						...r,
						id: r.heartbeatId,
						name,
						ping_url: r.pingUrl ?? null,
						fail_url: r.failUrl ?? null,
					});
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`Unknown operation: ${resource} ${operation}`,
						{
							itemIndex: i,
						},
					);
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				// Relvato's refusals are already NodeApiError / NodeOperationError: both constructors hand those back as they are.
				if (error instanceof NodeApiError) {
					throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex: i });
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
