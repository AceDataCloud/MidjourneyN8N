import type { IAuthenticateGeneric, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

export class AceDataMidjourneyApi implements ICredentialType {
  name = 'aceDataMidjourneyApi';
  displayName = 'Midjourney by Ace Data Cloud API';
  documentationUrl = 'https://github.com/AceDataCloud/MidjourneyN8N#credentials';
  icon = 'file:../nodes/Midjourney/icon.svg' as const;
  properties: INodeProperties[] = [{
    displayName: 'API Token', name: 'apiToken', type: 'string',
    typeOptions: { password: true }, default: '', required: true,
    description: 'An Ace Data Cloud application API token with Midjourney access',
  }];
  authenticate: IAuthenticateGeneric = {
    type: 'generic', properties: { headers: { Authorization: '=Bearer {{$credentials.apiToken}}' } },
  };
  test: ICredentialTestRequest = {
    request: { baseURL: 'https://api.acedata.cloud', url: '/openai/models', method: 'GET' },
  };
}
