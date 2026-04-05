import test from 'ava';
import sinon from 'sinon';
import { EventEmitter } from 'events';
import { ToolFactory } from '../src/tool-factory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BotConnection } from '../src/bot-connection.js';

test('createResponse returns proper MCP response format', (t) => {
  const mockServer = {} as McpServer;
  const mockConnection = {} as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);
  
  const response = factory.createResponse('Test message');
  
  t.deepEqual(response, {
    content: [{ type: 'text', text: 'Test message' }]
  });
});

test('createResponse handles empty string', (t) => {
  const mockServer = {} as McpServer;
  const mockConnection = {} as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);
  
  const response = factory.createResponse('');
  
  t.deepEqual(response, {
    content: [{ type: 'text', text: '' }]
  });
});

test('createErrorResponse with Error object', (t) => {
  const mockServer = {} as McpServer;
  const mockConnection = {} as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);
  
  const error = new Error('Connection timeout');
  const response = factory.createErrorResponse(error);
  
  t.deepEqual(response, {
    content: [{ type: 'text', text: 'Failed: Connection timeout' }],
    isError: true
  });
});

test('createErrorResponse with string', (t) => {
  const mockServer = {} as McpServer;
  const mockConnection = {} as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);
  
  const response = factory.createErrorResponse('Invalid argument');
  
  t.deepEqual(response, {
    content: [{ type: 'text', text: 'Failed: Invalid argument' }],
    isError: true
  });
});

test('createErrorResponse includes isError flag', (t) => {
  const mockServer = {} as McpServer;
  const mockConnection = {} as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);
  
  const response = factory.createErrorResponse('Error occurred');
  
  t.true(response.isError === true);
});

test('registerTool calls server.tool with correct parameters', async (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  
  const factory = new ToolFactory(mockServer, mockConnection);
  const schema = { type: 'object', properties: {} };
  const executor = sinon.stub().resolves({ content: [{ type: 'text', text: 'Success' }] });
  
  factory.registerTool('test_tool', 'A test tool', schema, executor);
  
  t.true((mockServer.tool as sinon.SinonStub).calledOnce);
  t.is((mockServer.tool as sinon.SinonStub).firstCall.args[0], 'test_tool');
  t.is((mockServer.tool as sinon.SinonStub).firstCall.args[1], 'A test tool');
  t.is((mockServer.tool as sinon.SinonStub).firstCall.args[2], schema);
});

test('registerTool executor checks connection before executing', async (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  
  const factory = new ToolFactory(mockServer, mockConnection);
  const executor = sinon.stub().resolves({ content: [{ type: 'text', text: 'Success' }] });
  
  factory.registerTool('test_tool', 'A test tool', {}, executor);
  
  const registeredExecutor = (mockServer.tool as sinon.SinonStub).firstCall.args[3];
  await registeredExecutor({ arg: 'value' });
  
  t.true((mockConnection.checkConnectionAndReconnect as sinon.SinonStub).calledOnce);
});

test('registerTool executor returns error when not connected', async (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ 
      connected: false, 
      message: 'Bot is not connected' 
    })
  } as unknown as BotConnection;
  
  const factory = new ToolFactory(mockServer, mockConnection);
  const executor = sinon.stub().resolves({ content: [{ type: 'text', text: 'Success' }] });
  
  factory.registerTool('test_tool', 'A test tool', {}, executor);
  
  const registeredExecutor = (mockServer.tool as sinon.SinonStub).firstCall.args[3];
  const response = await registeredExecutor({ arg: 'value' });
  
  t.deepEqual(response, {
    content: [{ type: 'text', text: 'Bot is not connected' }],
    isError: true
  });
  t.true((executor as sinon.SinonStub).notCalled);
});

test('registerTool executor calls executor when connected', async (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  
  const factory = new ToolFactory(mockServer, mockConnection);
  const executor = sinon.stub().resolves({ content: [{ type: 'text', text: 'Success' }] });
  
  factory.registerTool('test_tool', 'A test tool', {}, executor);
  
  const registeredExecutor = (mockServer.tool as sinon.SinonStub).firstCall.args[3];
  const args = { arg: 'value' };
  await registeredExecutor(args);
  
  t.true((executor as sinon.SinonStub).calledOnceWith(args));
});

test('registerTool executor returns executor result when successful', async (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  
  const factory = new ToolFactory(mockServer, mockConnection);
  const expectedResponse = { content: [{ type: 'text', text: 'Tool executed' }] };
  const executor = sinon.stub().resolves(expectedResponse);
  
  factory.registerTool('test_tool', 'A test tool', {}, executor);
  
  const registeredExecutor = (mockServer.tool as sinon.SinonStub).firstCall.args[3];
  const response = await registeredExecutor({ arg: 'value' });
  
  t.deepEqual(response, expectedResponse);
});

test('registerTool executor catches and returns error response on exception', async (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  
  const factory = new ToolFactory(mockServer, mockConnection);
  const error = new Error('Execution failed');
  const executor = sinon.stub().rejects(error);
  
  factory.registerTool('test_tool', 'A test tool', {}, executor);
  
  const registeredExecutor = (mockServer.tool as sinon.SinonStub).firstCall.args[3];
  const response = await registeredExecutor({ arg: 'value' });
  
  t.deepEqual(response, {
    content: [{ type: 'text', text: 'Failed: Execution failed' }],
    isError: true
  });
});

test('registerTool adds header.damages when bot health decreases during execution', async (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;

  const botEmitter = new EventEmitter() as EventEmitter & { health: number };
  botEmitter.health = 20;

  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true }),
    getBot: sinon.stub().returns(botEmitter)
  } as unknown as BotConnection;

  const factory = new ToolFactory(mockServer, mockConnection);
  const executor = sinon.stub().callsFake(async () => {
    botEmitter.health = 17;
    botEmitter.emit('health');
    return { content: [{ type: 'text', text: 'ok' }] };
  });

  factory.registerTool('test_tool', 'A test tool', {}, executor);

  const registeredExecutor = (mockServer.tool as sinon.SinonStub).firstCall.args[3];
  const response = await registeredExecutor({});

  t.truthy(response.header);
  t.true(Array.isArray((response.header as { damages?: unknown[] }).damages));
  t.is(((response.header as { damages: Array<{ amount: number }> }).damages[0]).amount, 3);
  t.true(Array.isArray((response.header as { warnings?: unknown[] }).warnings));
});

test('registerTool does not add damages header when no damage is taken', async (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;

  const botEmitter = new EventEmitter() as EventEmitter & { health: number };
  botEmitter.health = 20;

  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true }),
    getBot: sinon.stub().returns(botEmitter)
  } as unknown as BotConnection;

  const factory = new ToolFactory(mockServer, mockConnection);
  const executor = sinon.stub().callsFake(async () => {
    botEmitter.health = 20;
    botEmitter.emit('health');
    return { content: [{ type: 'text', text: 'ok' }] };
  });

  factory.registerTool('test_tool', 'A test tool', {}, executor);

  const registeredExecutor = (mockServer.tool as sinon.SinonStub).firstCall.args[3];
  const response = await registeredExecutor({});

  t.is(response.header, undefined);
});

test('getDamageWarn returns warning string when damages present', (t) => {
  const mockServer = {} as McpServer;
  const mockConnection = {} as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const damages = [{
    tool: 'test_tool',
    amount: 4,
    beforeHealth: 20,
    afterHealth: 16,
    at: new Date().toISOString(),
    warning: 'Damage received during test_tool: -4 HP'
  }];

  const result = factory.getDamageWarn({ toolName: 'test_tool', damages });

  t.true(typeof result === 'string');
  t.true(result.includes('注意！ダメージを受けています！'));
  t.true(result.includes('HP:16'));
  t.true(result.includes('Damage received during test_tool'));
});

test('getDamageWarn returns empty string when no damages', (t) => {
  const mockServer = {} as McpServer;
  const mockConnection = {} as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const result = factory.getDamageWarn({ toolName: 'test_tool', damages: [] });
  t.is(result, '');
});

test('getDamageWarn uses bot.oxygenLevel and warns when low', (t) => {
  const mockServer = {} as McpServer;
  // 現行実装では bot.oxygenLevel を参照するのでそちらを設定する
  const bot = { oxygenLevel: 5 } as any;
  const mockConnection = { getBot: sinon.stub().returns(bot) } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const result = factory.getDamageWarn({ toolName: 'test_tool', damages: [] });
  t.true(typeof result === 'string');
  t.true(result.includes('水中ゲージが半分以下'));
});

test('getDamageWarn uses bot.food.food and warns when low', (t) => {
  const mockServer = {} as McpServer;
  // hunger value below or equal to half (20/2=10)
  const bot = { food: { food: 8 } } as any;
  const mockConnection = { getBot: sinon.stub().returns(bot) } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const result = factory.getDamageWarn({ toolName: 'test_tool', damages: [] });
  t.true(typeof result === 'string');
  t.true(result.includes('空腹ゲージが半分以下'));
});

test('registerTool includes water warning in content when bot underwater and no damage', async (t) => {
  const mockServer = { tool: sinon.stub() } as unknown as McpServer;
  // 現行実装では bot.oxygenLevel を参照するためテストも合わせる
  const botObj = { oxygenLevel: 5 } as any;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true }),
    getBot: sinon.stub().returns(botObj)
  } as unknown as BotConnection;

  const factory = new ToolFactory(mockServer, mockConnection);
  const executor = sinon.stub().resolves({ content: [{ type: 'text', text: 'ok' }] });

  factory.registerTool('test_tool', 'A test tool', {}, executor);

  const registeredExecutor = (mockServer.tool as sinon.SinonStub).firstCall.args[3];
  const response = await registeredExecutor({});

  t.true(Array.isArray(response.content));
  t.true(response.content.some((c: any) => typeof c.text === 'string' && c.text.includes('水中ゲージが半分以下')));
  t.truthy(response.header);
  t.true(Array.isArray((response.header as any).warnings));
  t.true((response.header as any).warnings.some((w: string) => w.includes('水中ゲージが半分以下')));
});

test('registerTool includes hunger warning in content when bot hungry and no damage', async (t) => {
  const mockServer = { tool: sinon.stub() } as unknown as McpServer;
  const botObj = { food: { food: 8 } } as any;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true }),
    getBot: sinon.stub().returns(botObj)
  } as unknown as BotConnection;

  const factory = new ToolFactory(mockServer, mockConnection);
  const executor = sinon.stub().resolves({ content: [{ type: 'text', text: 'ok' }] });

  factory.registerTool('test_tool', 'A test tool', {}, executor);

  const registeredExecutor = (mockServer.tool as sinon.SinonStub).firstCall.args[3];
  const response = await registeredExecutor({});

  t.true(Array.isArray(response.content));
  t.true(response.content.some((c: any) => typeof c.text === 'string' && c.text.includes('空腹ゲージが半分以下')));
  t.truthy(response.header);
  t.true(Array.isArray((response.header as any).warnings));
  t.true((response.header as any).warnings.some((w: string) => w.includes('空腹ゲージが半分以下')));
});

test('registerTool records attacker info when entity event precedes health drop', async (t) => {
  const mockServer = { tool: sinon.stub() } as unknown as McpServer;

  const botEmitter = new EventEmitter() as EventEmitter & { health: number };
  botEmitter.health = 20;

  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true }),
    getBot: sinon.stub().returns(botEmitter)
  } as unknown as BotConnection;

  const factory = new ToolFactory(mockServer, mockConnection);
  const entity = { id: 123, username: 'EvilZombie', mobType: 'zombie' };

  const executor = sinon.stub().callsFake(async () => {
    botEmitter.emit('entityHurt', entity);
    botEmitter.health = 17;
    botEmitter.emit('health');
    return { content: [{ type: 'text', text: 'ok' }] };
  });

  factory.registerTool('test_tool', 'A test tool', {}, executor);

  const registeredExecutor = (mockServer.tool as sinon.SinonStub).firstCall.args[3];
  const response = await registeredExecutor({});

  t.truthy(response.header);
  t.true(Array.isArray((response.header as any).damages));
  t.is(((response.header as any).damages[0] as any).attacker?.name, 'EvilZombie');
  t.true(((response.header as any).warnings as string[]).some(w => w.includes('EvilZombie')));
});
