import { NodeConnectionTypes, NodeOperationError, OperationalError, UserError } from 'n8n-workflow';
import type { IDataObject, IExecuteFunctions, INodeExecutionData, INodeProperties, INodeType, INodeTypeDescription } from 'n8n-workflow';

const versions = ['8.2', '8.1', '8', '7', '6.1', '6', '5.2'];
const modes = ['fast', 'relax', 'turbo'];
const privateFields = new Set([
  'request', 'request_body', 'user_id', 'actor_user_id', 'credential_id',
  'authorization_id', 'application_id', 'api_key', 'api_token', 'token',
  'credential', 'credentials', 'access_token', 'refresh_token', 'authorization',
  'headers', 'supplier', 'supplier_id', 'provider_route', 'upstream',
  'upstream_model', 'actual_model', 'secret',
]);

const properties: INodeProperties[] = [
  {
    displayName: 'Resource', name: 'resource', type: 'options', default: 'image', noDataExpression: true,
    options: [{ name: 'Image', value: 'image' }, { name: 'Task', value: 'task' }],
  },
  {
    displayName: 'Operation', name: 'operation', type: 'options', default: 'imagine', noDataExpression: true,
    displayOptions: { show: { resource: ['image'] } },
    options: [{ name: 'Imagine', value: 'imagine', action: 'Imagine an image', description: 'Submit one paid image generation task' }],
  },
  {
    displayName: 'Operation', name: 'operation', type: 'options', default: 'get', noDataExpression: true,
    displayOptions: { show: { resource: ['task'] } },
    options: [
      { name: 'Get', value: 'get', action: 'Get a task', description: 'Query one existing task' },
      { name: 'Get Many', value: 'getMany', action: 'Get many tasks', description: 'Query up to 50 existing task IDs' },
    ],
  },
  {
    displayName: 'Version', name: 'version', type: 'options', default: '8.2',
    displayOptions: { show: { resource: ['image'] } },
    options: [
      { name: '5.2', value: '5.2' }, { name: '6', value: '6' },
      { name: '6.1', value: '6.1' }, { name: '7', value: '7' },
      { name: '8', value: '8' }, { name: '8.1', value: '8.1' }, { name: '8.2', value: '8.2' },
    ],
    description: 'Midjourney version; pricing can vary by version',
  },
  {
    displayName: 'Mode', name: 'mode', type: 'options', default: 'fast',
    displayOptions: { show: { resource: ['image'] } },
    options: [{ name: 'Fast', value: 'fast' }, { name: 'Relax', value: 'relax' }, { name: 'Turbo', value: 'turbo' }],
    description: 'Generation speed and price; version 8.1 does not support Turbo',
  },
  {
    displayName: 'Prompt', name: 'prompt', type: 'string', default: '', required: true,
    typeOptions: { rows: 4 }, displayOptions: { show: { resource: ['image'] } },
    description: 'Describe the image; prompt flags such as --ar belong inside the text',
  },
  {
    displayName: 'Task ID', name: 'taskId', type: 'string', default: '', required: true,
    displayOptions: { show: { resource: ['task'], operation: ['get'] } },
    description: 'The task ID returned by Create',
  },
  {
    displayName: 'Task IDs', name: 'taskIds', type: 'string', default: '', required: true,
    displayOptions: { show: { resource: ['task'], operation: ['getMany'] } },
    description: 'One to 50 existing task IDs, separated by commas or new lines',
  },
];

function object(value: unknown): IDataObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as IDataObject : {};
}

function text(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string' || value.length > maximum)
    throw new UserError(`${label} must be at most ${maximum} characters`);
  return value.trim();
}

function requiredText(value: unknown, label: string, maximum: number): string {
  const result = text(value, label, maximum);
  if (!result) throw new UserError(`${label} is required`);
  return result;
}

function taskIds(value: unknown): string[] {
  const ids = requiredText(value, 'Task IDs', 4096).split(/[,\n]/).map(v => v.trim()).filter(Boolean);
  if (ids.length < 1 || ids.length > 50) throw new UserError('Provide one to 50 task IDs');
  return ids.map(id => requiredText(id, 'Task ID', 128));
}

export function imagineBody(get: (name: string) => unknown): IDataObject {
  const version = requiredText(get('version'), 'Version', 10);
  if (!versions.includes(version)) throw new UserError('Select a supported Midjourney version');
  const mode = requiredText(get('mode'), 'Mode', 10);
  if (!modes.includes(mode)) throw new UserError('Select a supported Midjourney mode');
  if (version === '8.1' && mode === 'turbo') throw new UserError('Version 8.1 does not support Turbo mode');
  const prompt = requiredText(get('prompt'), 'Prompt', 4000);
  return { version, mode, action: 'generate', prompt, async: true };
}

function publicData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(publicData);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !privateFields.has(key.toLowerCase())
      && !/(^internal(?:_|$)|supplier|upstream|(?:^|_)secret(?:_|$))/i.test(key))
    .map(([key, item]) => [key, publicData(item)]));
}

function imageUrls(value: unknown): string[] {
  const found: string[] = [];
  function walk(node: unknown): void {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== 'object') return;
    for (const [key, item] of Object.entries(node)) {
      if ((key === 'image_url' || key === 'raw_image_url' || key === 'url') && typeof item === 'string' && item.startsWith('https://'))
        found.push(item);
      else if (item && typeof item === 'object') walk(item);
    }
  }
  walk(value);
  return [...new Set(found)];
}

export function taskResult(record: IDataObject): IDataObject {
  const response = object(record.response);
  const data = publicData(response.data ?? record.data ?? null);
  const items = Array.isArray(data) ? data : [];
  const states = items.map(item => String(object(item).state ?? '').toLowerCase()).filter(Boolean);
  const state = String(record.state ?? record.status ?? response.status ?? '').toLowerCase();
  const unfinished = Object.prototype.hasOwnProperty.call(record, 'finished_at') && record.finished_at === null;
  const failed = !unfinished && (response.success === false || record.success === false || Boolean(response.error ?? record.error)
    || ['failed', 'error', 'cancelled', 'canceled', 'rejected'].includes(state)
    || states.some(item => ['failed', 'error', 'cancelled', 'canceled', 'rejected'].includes(item)));
  const urls = imageUrls(data);
  const finished = Boolean(record.finished_at);
  const complete = !failed && !unfinished && (
    ['succeeded', 'success', 'completed', 'complete'].includes(state)
    || (states.length > 0 && states.every(item => ['succeeded', 'success', 'completed', 'complete'].includes(item)))
    || (finished && response.success === true && urls.length > 0));
  return {
    taskId: record.id ?? record.task_id ?? '',
    status: failed ? 'failed' : complete ? 'succeeded' : 'processing',
    finished: failed || complete,
    successful: failed ? false : complete ? true : null,
    imageUrls: complete ? urls : [],
    data: complete ? data as IDataObject | IDataObject[] | null : null,
    error: failed ? { code: 'task_failed', message: 'The task failed; inspect its task or trace ID.' } : null,
    traceId: record.trace_id ?? response.trace_id ?? null,
    cost: publicData(response.cost ?? null) as IDataObject | null,
  };
}

function requestFailure(error: unknown): OperationalError {
  const value = error && typeof error === 'object' ? error as {
    httpCode?: unknown; statusCode?: unknown; response?: { statusCode?: unknown; status?: unknown };
  } : {};
  const code = String(value.httpCode ?? value.statusCode ?? value.response?.statusCode ?? value.response?.status ?? '');
  const status = /^\d{3}$/.test(code) ? code : '';
  return new OperationalError(status
    ? `Ace Data Cloud returned HTTP ${status}. Check the original task or request history before retrying.`
    : 'The Midjourney request did not complete. Check task or request history before retrying; generation may have been charged.');
}

async function request(context: IExecuteFunctions, endpoint: string, body: IDataObject): Promise<IDataObject> {
  let result: unknown;
  try {
    result = await context.helpers.httpRequestWithAuthentication.call(context, 'aceDataMidjourneyApi', {
      method: 'POST', url: `https://api.acedata.cloud${endpoint}`, body,
      json: true, disableFollowRedirect: true, timeout: 60000,
    });
  } catch (error) { throw requestFailure(error); }
  if (!result || typeof result !== 'object' || Array.isArray(result))
    throw new OperationalError('The service returned an unexpected response');
  const value = object(result);
  if (value.success === false || value.error)
    throw new OperationalError('The service rejected the request. Inspect its task or trace ID.');
  return value;
}

export class Midjourney implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Midjourney by Ace Data Cloud', name: 'midjourney',
    icon: { light: 'file:icon.svg', dark: 'file:icon.dark.svg' },
    group: ['transform'], version: 1,
    subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
    description: 'Imagine a Midjourney image and retrieve the same task until it finishes',
    defaults: { name: 'Midjourney by Ace Data Cloud' },
    inputs: [NodeConnectionTypes.Main], outputs: [NodeConnectionTypes.Main],
    usableAsTool: true, credentials: [{ name: 'aceDataMidjourneyApi', required: true }], properties,
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const output: INodeExecutionData[] = [];
    for (let index = 0; index < this.getInputData().length; index++) {
      try {
        let hasToken = false;
        try {
          const credentials = await this.getCredentials('aceDataMidjourneyApi');
          hasToken = typeof credentials.apiToken === 'string' && Boolean(credentials.apiToken.trim());
        } catch { /* n8n did not provide a credential. */ }
        if (!hasToken)
          throw new NodeOperationError(this.getNode(), 'A Midjourney by Ace Data Cloud credential is required.');

        const resource = this.getNodeParameter('resource', index) as string;
        const operation = this.getNodeParameter('operation', index) as string;
        if (resource === 'task') {
          const body: IDataObject = operation === 'get'
            ? { action: 'retrieve', id: requiredText(this.getNodeParameter('taskId', index), 'Task ID', 128) }
            : operation === 'getMany'
              ? { action: 'retrieve_batch', ids: taskIds(this.getNodeParameter('taskIds', index)) }
              : {};
          if (!body.action) throw new UserError('Select a supported task operation');
          const result = await request(this, '/midjourney/tasks', body);
          const records = operation === 'getMany' ? result.items : [result];
          if (!Array.isArray(records)) throw new OperationalError('The service returned an unexpected task list');
          for (const item of records) {
            const record = object(item);
            if (!record.id && !record.task_id) throw new OperationalError('The task was not found');
            output.push({ json: taskResult(record), pairedItem: { item: index } });
          }
          continue;
        }
        if (resource !== 'image' || operation !== 'imagine')
          throw new UserError('Select a supported Midjourney operation');
        const body = imagineBody(name => this.getNodeParameter(name, index, ''));
        const result = await request(this, '/midjourney/imagine', body);
        const taskId = result.task_id ?? object(result.task).id;
        if (typeof taskId !== 'string' || !taskId)
          throw new OperationalError('The service did not return a task ID; inspect request history before retrying');
        output.push({
          json: { taskId, status: 'submitted', finished: false, successful: null, traceId: result.trace_id ?? null },
          pairedItem: { item: index },
        });
      } catch (error) {
        if (!this.continueOnFail())
          throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: index });
        output.push({ json: { error: (error as Error).message }, pairedItem: { item: index } });
      }
    }
    return [output];
  }
}
