import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { GROUP_OPTIONS } from '../Relvato/shared/constants';
import { searchSites, siteLocator } from '../Relvato/shared/methods';
import { relvatoApiRequest } from '../Relvato/shared/transport';
import {
	EVENT_OPTIONS,
	EVENTS_WITH_GROUPS,
	EVENTS_WITH_SKIP,
	shouldEmit,
	subscriptionBody,
	subscriptionFilter,
	subscriptionMatchesConfig,
	triggerEventFor,
	type TriggerEventDefinition,
} from './events';
import { SIGNATURE_HEADER, verifySignature } from './signature';

/** What this trigger keeps between activations (workflow static data, per node). */
interface HookData extends IDataObject {
	hookId?: string;
	secret?: string;
}

/** How long after create() to ask Relvato for a sample event in test mode (see sendTestEvent). */
/** How long Relvato waits before sending the test event (n8n stores the signing secret once create() returns). */
const TEST_EVENT_DELAY_MS = 3000;

function eventDefinition(ctx: IHookFunctions | IWebhookFunctions): TriggerEventDefinition {
	const value = ctx.getNodeParameter('event') as string;
	const def = triggerEventFor(value);
	if (!def) throw new NodeOperationError(ctx.getNode(), `Unknown event: ${value}`);
	return def;
}

function choiceOf(ctx: IHookFunctions): { siteId?: string; groups?: string[] } {
	const def = eventDefinition(ctx);
	const siteId = String(ctx.getNodeParameter('siteId', '', { extractValue: true }) ?? '');
	const groups = def.chooseGroups ? (ctx.getNodeParameter('groups', []) as string[]) : [];
	return { siteId, groups };
}

function webhookUrlOf(ctx: IHookFunctions): string {
	const url = ctx.getNodeWebhookUrl('default');
	if (!url) throw new NodeOperationError(ctx.getNode(), 'n8n has no webhook URL for this trigger.');
	return url;
}

const hostOfUrl = (url: string) => {
	try {
		return new URL(url).host;
	} catch {
		return '';
	}
};

async function deleteSubscription(ctx: IHookFunctions, id: string): Promise<void> {
	try {
		await relvatoApiRequest.call(ctx, 'DELETE', `/api/v1/hooks/${encodeURIComponent(id)}`);
	} catch (error) {
		// Already gone is what we wanted (Relvato answers 204 either way; a 404 means the same).
		if (error instanceof NodeApiError && error.httpCode === '404') {
			ctx.logger.debug(`Relvato subscription ${id} was already deleted`);
			return;
		}
		throw new NodeApiError(ctx.getNode(), error as JsonObject);
	}
}

/**
 * Test mode only ("Listen for test event"): ask Relvato to send this subscription a signed sample event, so the
 * editor gets data at once. n8n stores the test webhook's static data (which holds the signing secret webhook()
 * verifies with) only once create() has returned, and the node's helpers close then — so the request goes out now,
 * awaited inside create(), with `delayMs`: Relvato answers 202 at once and sends the event a few seconds later.
 * A convenience: any failure is logged and ignored.
 */
async function requestTestEvent(ctx: IHookFunctions, id: string): Promise<void> {
	try {
		await relvatoApiRequest.call(ctx, 'POST', '/api/v1/hooks/test', { body: { id, delayMs: TEST_EVENT_DELAY_MS } });
	} catch (error) {
		ctx.logger.warn(`Relvato didn't send a test event: ${(error as Error).message}`);
	}
}

/** The raw request body, exactly as Relvato signed it. */
async function rawBodyOf(ctx: IWebhookFunctions): Promise<Buffer> {
	const req = ctx.getRequestObject();
	if (!req.rawBody && typeof req.readRawBody === 'function') await req.readRawBody();
	if (req.rawBody)
		return Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(String(req.rawBody));
	// Relvato sends JSON.stringify(event); re-serialising the parsed body gives the same bytes.
	return Buffer.from(JSON.stringify(ctx.getBodyData()));
}

export class RelvatoTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Relvato Trigger',
		name: 'relvatoTrigger',
		icon: { light: 'file:../../icons/relvato.svg', dark: 'file:../../icons/relvato.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["event"]}}',
		description:
			'Starts the workflow when Relvato website monitoring sees a change: a site down, a monitor failing or recovering, a new vulnerability and more',
		defaults: {
			name: 'Relvato Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'relvatoApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName:
					'Needs a full-access API key on the Pro plan or higher. Relvato sends an event when a monitor changes state (passing to failing, or failing to passing), not on every repeated failure.',
				name: 'notice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				required: true,
				noDataExpression: true,
				options: EVENT_OPTIONS,
				default: 'monitorFailed',
			},
			siteLocator({
				required: false,
				description: 'Only this site. Leave empty for every site on the account.',
			}),
			{
				displayName: 'Monitor Groups',
				name: 'groups',
				type: 'multiOptions',
				options: GROUP_OPTIONS,
				default: [],
				displayOptions: { show: { event: EVENTS_WITH_GROUPS } },
				description: 'Only monitors in these groups. Leave empty for all.',
			},
			{
				displayName: "Skip Runs That Couldn't Happen",
				name: 'skipNotRun',
				type: 'boolean',
				default: true,
				displayOptions: { show: { event: EVENTS_WITH_SKIP } },
				description:
					"Whether to skip monitors that couldn't run. When a firewall blocks Relvato or the site doesn't answer, the monitor couldn't run, which says nothing about your site's code.",
			},
		],
	};

	methods = {
		listSearch: {
			searchSites,
		},
	};

	webhookMethods = {
		default: {
			/** Ours if Relvato still has the subscription we stored, active, sending here, for the same event and filter. */
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node') as HookData;
				if (!data.hookId || !data.secret) return false;
				const response = await relvatoApiRequest.call(this, 'GET', '/api/v1/hooks');
				const subscriptions = (
					Array.isArray(response.subscriptions) ? response.subscriptions : []
				) as IDataObject[];
				const sub = subscriptions.find((s) => s.id === data.hookId);
				const def = eventDefinition(this);
				const wanted = {
					host: hostOfUrl(webhookUrlOf(this)),
					events: [def.event],
					filter: subscriptionFilter(def, choiceOf(this)),
				};
				if (sub && subscriptionMatchesConfig(sub, wanted)) return true;
				// Disabled (20 failed deliveries), or set up for other settings: replace it.
				if (sub) await deleteSubscription(this, data.hookId);
				delete data.hookId;
				delete data.secret;
				return false;
			},

			/** POST /api/v1/hooks, keeping the subscription id and its signing secret (shown once) in static data. */
			async create(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node') as HookData;
				const body = subscriptionBody(eventDefinition(this), webhookUrlOf(this), choiceOf(this));
				let created = await relvatoApiRequest.call(this, 'POST', '/api/v1/hooks', { body });
				// Relvato returns the existing subscription — without its secret — when this URL already subscribes to the
				// same events. Its secret is lost to us, so replace it with a new one.
				if (!created.secret && typeof created.id === 'string') {
					await deleteSubscription(this, created.id);
					created = await relvatoApiRequest.call(this, 'POST', '/api/v1/hooks', { body });
				}
				if (typeof created.id !== 'string' || typeof created.secret !== 'string') {
					throw new NodeOperationError(
						this.getNode(),
						"Relvato didn't return a signing secret for the event subscription.",
					);
				}
				data.hookId = created.id;
				data.secret = created.secret;
				if (this.getMode() === 'manual' || this.getActivationMode() === 'manual') {
					await requestTestEvent(this, created.id);
				}
				return true;
			},

			/** DELETE /api/v1/hooks/:id; one that's already gone counts as deleted. */
			async delete(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node') as HookData;
				if (data.hookId) await deleteSubscription(this, data.hookId);
				delete data.hookId;
				delete data.secret;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const data = this.getWorkflowStaticData('node') as HookData;
		const header = this.getHeaderData()[SIGNATURE_HEADER];
		const raw = await rawBodyOf(this);
		if (!data.secret || !verifySignature(data.secret, raw, header)) {
			// Not from Relvato (or replayed): refuse it, and start nothing.
			const res = this.getResponseObject();
			res.status(401).json({
				error: 'invalid_signature',
				message: 'The Relvato-Signature header is missing or invalid.',
			});
			return { noWebhookResponse: true };
		}

		const event = this.getBodyData();
		const def = eventDefinition(this);
		const skipNotRun =
			def.event === 'check.failed' ? (this.getNodeParameter('skipNotRun', true) as boolean) : false;
		if (!shouldEmit(def, event, skipNotRun)) {
			return { webhookResponse: { received: true, skipped: 'not-run' } };
		}
		return { workflowData: [this.helpers.returnJsonArray(event)] };
	}
}
