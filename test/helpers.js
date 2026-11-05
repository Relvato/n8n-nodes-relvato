// Fake n8n contexts for the tests: no n8n server, and every Relvato API call answered by a handler.
const node = {
	id: 'node-1',
	name: 'Relvato',
	type: 'n8n-nodes-relvato.relvato',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

const logger = { debug() {}, info() {}, warn() {}, error() {} };

/** `handler(request)` → `{ statusCode, body }`; every request is recorded in `calls`. */
function fakeHttp(handler) {
	const calls = [];
	async function httpRequestWithAuthentication(credentialType, request) {
		calls.push({ credentialType, ...request });
		const answer = await handler(request);
		return { statusCode: answer.statusCode ?? 200, body: answer.body ?? '', headers: {} };
	}
	return { calls, httpRequestWithAuthentication };
}

function hookContext({ params, staticData = {}, handler, mode = 'trigger', webhookUrl }) {
	const http = fakeHttp(handler);
	const ctx = {
		getNode: () => ({ ...node, name: 'Relvato Trigger', type: 'n8n-nodes-relvato.relvatoTrigger' }),
		getNodeParameter: (name, fallback) => (name in params ? params[name] : fallback),
		getNodeWebhookUrl: () => webhookUrl,
		getWorkflowStaticData: () => staticData,
		getMode: () => mode,
		getActivationMode: () => (mode === 'manual' ? 'manual' : 'activate'),
		logger,
		helpers: { httpRequestWithAuthentication: http.httpRequestWithAuthentication },
	};
	return { ctx, calls: http.calls, staticData };
}

function webhookContext({ params, staticData, rawBody, headers }) {
	const response = { statusCode: null, body: null };
	const res = {
		status(code) {
			response.statusCode = code;
			return res;
		},
		json(body) {
			response.body = body;
			return res;
		},
	};
	const ctx = {
		getNode: () => ({ ...node, name: 'Relvato Trigger', type: 'n8n-nodes-relvato.relvatoTrigger' }),
		getNodeParameter: (name, fallback) => (name in params ? params[name] : fallback),
		getWorkflowStaticData: () => staticData,
		getRequestObject: () => ({ rawBody: Buffer.from(rawBody) }),
		getHeaderData: () => headers,
		getBodyData: () => JSON.parse(rawBody),
		getResponseObject: () => res,
		getMode: () => 'webhook',
		logger,
		helpers: { returnJsonArray: (o) => (Array.isArray(o) ? o : [o]).map((json) => ({ json })) },
	};
	return { ctx, response };
}

/** IExecuteFunctions with one input item per entry of `items` (each entry = that item's parameters). */
function executeContext({ items, handler, continueOnFail = false }) {
	const http = fakeHttp(handler);
	const ctx = {
		getNode: () => node,
		getInputData: () => items.map(() => ({ json: {} })),
		getNodeParameter: (name, i, fallback) => (name in items[i] ? items[i][name] : fallback),
		continueOnFail: () => continueOnFail,
		logger,
		helpers: { httpRequestWithAuthentication: http.httpRequestWithAuthentication },
	};
	return { ctx, calls: http.calls };
}

/** An MCP tools/call answer as Relvato's /api/mcp sends it. */
const mcpResult = (data) => ({
	jsonrpc: '2.0',
	id: 1,
	result: { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] },
});
const mcpError = (text) => ({
	jsonrpc: '2.0',
	id: 1,
	result: { content: [{ type: 'text', text }], isError: true },
});

module.exports = { hookContext, webhookContext, executeContext, mcpResult, mcpError };
