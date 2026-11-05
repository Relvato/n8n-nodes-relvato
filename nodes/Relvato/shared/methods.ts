import type { ILoadOptionsFunctions, INodeListSearchResult, INodeProperties } from 'n8n-workflow';
import { RELVATO_BASE_URL } from './constants';
import { relvatoApiRequest } from './transport';
import type { RelvatoSite } from './utils';

/** The account's sites for the Site pickers (GET /api/v1/sites), filtered by what the user typed. */
export async function searchSites(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const response = await relvatoApiRequest.call(this, 'GET', '/api/v1/sites');
	const sites = (Array.isArray(response.sites) ? response.sites : []) as RelvatoSite[];
	const q = (filter ?? '').trim().toLowerCase();
	return {
		results: sites
			.filter((s) => !q || `${s.name ?? ''} ${s.url}`.toLowerCase().includes(q))
			.map((s) => ({
				name: s.name ? `${s.name} (${s.url})` : s.url,
				value: s.id,
				url: `${RELVATO_BASE_URL}/sites/${s.id}`,
			})),
	};
}

/** A Site picker: from the list, or by ID. */
export function siteLocator(overrides: Partial<INodeProperties>): INodeProperties {
	return {
		displayName: 'Site',
		name: 'siteId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description: 'The site on the Relvato account',
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				placeholder: 'Select a site...',
				typeOptions: { searchListMethod: 'searchSites', searchable: true },
			},
			{
				displayName: 'ID',
				name: 'id',
				type: 'string',
				placeholder: '3f8a2c1e-9b7d-4e6a-8c5f-1d2e3f4a5b6c',
				validation: [
					{
						type: 'regex',
						properties: {
							regex: '^[0-9a-fA-F-]{36}$',
							errorMessage: 'A site ID looks like 3f8a2c1e-9b7d-4e6a-8c5f-1d2e3f4a5b6c',
						},
					},
				],
			},
		],
		...overrides,
	} as INodeProperties;
}
