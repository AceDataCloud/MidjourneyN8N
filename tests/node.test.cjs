const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Midjourney, imagineBody, taskResult } = require('../dist/nodes/Midjourney/Midjourney.node.js');
const { AceDataMidjourneyApi } = require('../dist/credentials/AceDataMidjourneyApi.credentials.js');

const base = { resource: 'image', operation: 'imagine', version: '8.2', mode: 'fast', prompt: 'A teal ceramic cube --ar 1:1' };
function context(parameters, responses = [], continueOnFail = false, credentials = { apiToken: 'test-token' }) {
  const calls = [];
  let next = 0;
  return {
    calls,
    getInputData: () => parameters.map(() => ({ json: {} })),
    getNode: () => ({ name: 'Midjourney', type: '@acedatacloud/n8n-nodes-midjourney.midjourney', typeVersion: 1, position: [0, 0], parameters: {} }),
    getNodeParameter: (name, index, fallback) => parameters[index][name] ?? fallback,
    getCredentials: async () => credentials,
    continueOnFail: () => continueOnFail,
    helpers: { httpRequestWithAuthentication: async (credential, options) => {
      calls.push({ credential, ...options });
      const response = responses[next++];
      if (response instanceof Error) throw response;
      return response;
    } },
  };
}
const node = new Midjourney();

test('Imagine submits one asynchronous image task with no retry', async () => {
  const ctx = context([base], [{ task_id: 'image-1', trace_id: 'trace-1', success: true }]);
  const [items] = await node.execute.call(ctx);
  assert.equal(ctx.calls.length, 1);
  assert.equal(ctx.calls[0].credential, 'aceDataMidjourneyApi');
  assert.equal(ctx.calls[0].url, 'https://api.acedata.cloud/midjourney/imagine');
  assert.equal(ctx.calls[0].method, 'POST');
  assert.equal(ctx.calls[0].disableFollowRedirect, true);
  assert.deepEqual(ctx.calls[0].body, { version: '8.2', mode: 'fast', action: 'generate', prompt: base.prompt, async: true });
  assert.deepEqual(items[0], { json: { taskId: 'image-1', status: 'submitted', finished: false, successful: null, traceId: 'trace-1' }, pairedItem: { item: 0 } });
});

test('invalid version, mode and prompt stop before a paid request', async () => {
  for (const bad of [
    { ...base, version: '9' }, { ...base, mode: 'ultra' }, { ...base, version: '8.1', mode: 'turbo' },
    { ...base, prompt: '' }, { ...base, prompt: 'x'.repeat(4001) }, { ...base, operation: 'variation' },
  ]) {
    const ctx = context([bad]);
    await assert.rejects(node.execute.call(ctx));
    assert.equal(ctx.calls.length, 0);
  }
  assert.deepEqual(imagineBody(name => base[name] ?? ''), { version: '8.2', mode: 'fast', action: 'generate', prompt: base.prompt, async: true });
});

test('Get queries original task and exposes only completed images', async () => {
  const task = { id: 'image-1', finished_at: '2026-10-11T00:00:00Z', request: { prompt: 'private' }, credential_id: 'private',
    response: { success: true, trace_id: 'trace-1', data: { image_url: 'https://example.com/preview.png', raw_image_url: 'https://example.com/full.png', image_id: '123', supplier: 'private' } } };
  const ctx = context([{ resource: 'task', operation: 'get', taskId: 'image-1' }], [task]);
  const [items] = await node.execute.call(ctx);
  assert.deepEqual(ctx.calls[0].body, { action: 'retrieve', id: 'image-1' });
  assert.equal(items[0].json.status, 'succeeded');
  assert.deepEqual(items[0].json.imageUrls, ['https://example.com/preview.png', 'https://example.com/full.png']);
  assert.equal(items[0].json.data.supplier, undefined);
});

test('pending is not complete and failed media is hidden', () => {
  const pending = taskResult({ id: 'image-1', finished_at: null, response: { success: true, data: { progress: 60 } } });
  assert.equal(pending.status, 'processing');
  assert.equal(pending.finished, false);
  const failed = taskResult({ id: 'image-2', finished_at: 'now', response: { success: false, data: { image_url: 'https://example.com/bad.png' } } });
  assert.equal(failed.status, 'failed');
  assert.deepEqual(failed.imageUrls, []);
});

test('Get Many only queries existing IDs', async () => {
  const ctx = context([{ resource: 'task', operation: 'getMany', taskIds: 'image-1,image-2' }], [
    { items: [{ id: 'image-1', finished_at: null }, { id: 'image-2', finished_at: null }] },
  ]);
  const [items] = await node.execute.call(ctx);
  assert.equal(ctx.calls.length, 1);
  assert.equal(ctx.calls[0].url, 'https://api.acedata.cloud/midjourney/tasks');
  assert.deepEqual(ctx.calls[0].body, { action: 'retrieve_batch', ids: ['image-1', 'image-2'] });
  assert.equal(items.length, 2);
});

test('uncertain transport failure does not retry Imagine', async () => {
  const ctx = context([base, base], [new Error('connection lost'), { task_id: 'image-2' }], true);
  const [items] = await node.execute.call(ctx);
  assert.equal(ctx.calls.length, 2);
  assert.match(items[0].json.error, /request history/i);
  assert.equal(items[1].json.taskId, 'image-2');
});

test('credential is masked and tested on free metadata route', async () => {
  const credential = new AceDataMidjourneyApi();
  assert.equal(credential.properties[0].typeOptions.password, true);
  assert.match(credential.authenticate.properties.headers.Authorization, /Bearer/);
  assert.equal(credential.test.request.url, '/openai/models');
  const ctx = context([base], [], false, { apiToken: '' });
  await assert.rejects(node.execute.call(ctx), /credential is required/i);
  assert.equal(ctx.calls.length, 0);
});
