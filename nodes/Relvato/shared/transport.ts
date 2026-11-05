import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IN8nHttpFullResponse,
	IWebhookFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
import { RELVATO_BASE_URL } from './constants';
import { parseToolResult, relvatoErrorMessage } from './utils';

type RelvatoContext =
	| IExecuteFunctions
	| IHookFunctions
	| ILoadOptionsFunctions
	| IWebhookFunctions;

interface RequestOptions {
	body?: IDataObject;
	qs?: IDataObject;
	headers?: IDataObject;
	itemIndex?: number;
}

/**
 * One authenticated call to Relvato's API. A refusal (4xx/5xx) becomes a NodeApiError carrying Relvato's own
 * message, e.g. 403 plan_required → "Event subscriptions are on the Pro plan and up.".
 */
export async function relvatoApiRequest(
	this: RelvatoContext,
	method: IHttpRequestMethods,
	path: string,
	options: RequestOptions = {},
): Promise<IDataObject> {
	const request: IHttpRequestOptions = {
		method,
		url: `${RELVATO_BASE_URL}${path}`,
		headers: { Accept: 'application/json', ...(options.headers ?? {}) },
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	};
	if (options.body !== undefined) request.body = options.body;
	if (options.qs !== undefined) request.qs = options.qs;

	let response: IN8nHttpFullResponse;
	try {
		response = (await this.helpers.httpRequestWithAuthentication.call(
			this,
			'relvatoApi',
			request,
		)) as IN8nHttpFullResponse;
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: options.itemIndex });
	}

	const body = response.body as unknown;
	if (response.statusCode >= 400) {
		const message = relvatoErrorMessage(response.statusCode, body);
		throw new NodeApiError(
			this.getNode(),
			(body && typeof body === 'object' ? body : { message }) as JsonObject,
			{
				message,
				description:
					response.statusCode === 401 ? 'Check the API key in the Relvato credential.' : undefined,
				httpCode: String(response.statusCode),
				itemIndex: options.itemIndex,
			},
		);
	}
	if (body && typeof body === 'object' && !Array.isArray(body)) return body as IDataObject;
	return {};
}

/**
 * Call one of Relvato's MCP tools (JSON-RPC tools/call on /api/mcp, same API key) and return its JSON result.
 * The actions that only the MCP server offers — add a site, pause a group… — go through here.
 * A tool's refusal (`result.isError`) becomes a NodeApiError with Relvato's words.
 */
export async function callRelvatoTool(
	this: RelvatoContext,
	name: string,
	args: IDataObject,
	itemIndex?: number,
): Promise<IDataObject> {
	const rpc = await relvatoApiRequest.call(this, 'POST', '/api/mcp', {
		body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
		headers: { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' },
		itemIndex,
	});
	const result = parseToolResult(rpc);
	if ('error' in result) {
		throw new NodeApiError(this.getNode(), { message: result.error } as JsonObject, {
			message: result.error,
			itemIndex,
		});
	}
	return result.data;
}
