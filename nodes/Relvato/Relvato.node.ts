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
import { callRelvatoTool, relvatoApiRequest } from './shared/transport';
import type { RelvatoRun, RelvatoSite } from './shared/utils';
import { compact, latestFinishedRun, sitesMatchingDomain } from './shared/utils';

/**
 * Relvato actions. Programmatic rather than declarative: half the operations are MCP tool calls (one JSON-RPC
 * endpoint whose answer is JSON inside `result.content[0].text`, with refusals flagged by `result.isError`), and the
 * searches filter client-side (domain matching, the newest finished run) — neither maps onto declarative routing.
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
			'Add sites, start monitoring, run monitors, pause monitor groups and create heartbeats in Relvato website monitoring',
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

				if (resource === 'site') {
					if (operation === 'getAll' || operation === 'findByDomain') {
						const response = await relvatoApiRequest.call(this, 'GET', '/api/v1/sites', {
							itemIndex: i,
						});
						let sites = (Array.isArray(response.sites) ? response.sites : []) as RelvatoSite[];
						if (operation === 'findByDomain') {
							sites = sitesMatchingDomain(sites, this.getNodeParameter('domain', i) as string);
						} else if (!(this.getNodeParameter('returnAll', i) as boolean)) {
							sites = sites.slice(0, this.getNodeParameter('limit', i) as number);
						}
						sites.forEach((s) => out(s));
					} else if (operation === 'add') {
						const additional = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
						const r = await callRelvatoTool.call(
							this,
							'add_site',
							compact({
								url: this.getNodeParameter('url', i) as string,
								platform: this.getNodeParameter('platform', i) as string,
								name: additional.name as string | undefined,
							}),
							i,
						);
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
					} else if (operation === 'startMonitoring') {
						const id = siteId();
						const goals = this.getNodeParameter('goals', i, []) as string[];
						if (!goals.length) {
							throw new NodeOperationError(this.getNode(), 'Pick at least one goal.', {
								itemIndex: i,
							});
						}
						const r = await callRelvatoTool.call(
							this,
							'start_monitoring_for_goals',
							{ siteId: id, goals },
							i,
						);
						out({ ...r, id });
					} else {
						throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`, {
							itemIndex: i,
						});
					}
				} else if (resource === 'monitorGroup') {
					const id = siteId();
					const group = this.getNodeParameter('group', i) as string;
					if (operation === 'run') {
						const response = await relvatoApiRequest.call(
							this,
							'POST',
							`/api/v1/sites/${encodeURIComponent(id)}/scan`,
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
						const r = await callRelvatoTool.call(
							this,
							'pause_monitor_group',
							{ siteId: id, group, duration },
							i,
						);
						out({ ...r, id });
					} else if (operation === 'resume') {
						const r = await callRelvatoTool.call(
							this,
							'resume_monitor_group',
							{ siteId: id, group },
							i,
						);
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
					const r = await callRelvatoTool.call(
						this,
						'add_heartbeat',
						compact({
							siteId: siteId(),
							name,
							periodSec: this.getNodeParameter('periodSec', i, 86400) as number,
							graceSec: this.getNodeParameter('graceSec', i, 3600) as number,
						}),
						i,
					);
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
