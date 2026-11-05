import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

/**
 * A Relvato API key (app.relvato.com → API access), sent as `Authorization: Bearer rlv_…`.
 * The same key works for the REST API and for Relvato's MCP server, which some actions use.
 */
export class RelvatoApi implements ICredentialType {
	name = 'relvatoApi';

	displayName = 'Relvato API';

	icon: Icon = { light: 'file:../icons/relvato.svg', dark: 'file:../icons/relvato.dark.svg' };

	documentationUrl = 'https://www.relvato.com/developers';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'Create a key at <a href="https://app.relvato.com/api-access" target="_blank">app.relvato.com → API access</a>. Use a full-access key: the trigger subscribes to events, and actions add sites and run monitors. The trigger needs the Pro plan or higher.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://app.relvato.com',
			url: '/api/v1',
			method: 'GET',
		},
	};
}
