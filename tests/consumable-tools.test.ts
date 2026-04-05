import test from 'ava';
import sinon from 'sinon';
import { registerConsumableTools } from '../src/tools/consumable-tools.js';
import { ToolFactory } from '../src/tool-factory.js';
import { BotConnection } from '../src/bot-connection.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type mineflayer from 'mineflayer';

test('registerConsumableTools registers eat-item tool', (t) => {
  const mockServer = { tool: sinon.stub() } as unknown as McpServer;
  const mockConnection = { checkConnectionAndReconnect: sinon.stub().resolves({ connected: true }) } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);
  const mockBot = {} as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerConsumableTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const eatCall = toolCalls.find(call => call.args[0] === 'eat-item');

  t.truthy(eatCall);
  t.is(eatCall!.args[1], "Eat an edible item from the bot's inventory");
});

test('eat-item equips and activates edible item', async (t) => {
  const mockServer = { tool: sinon.stub() } as unknown as McpServer;
  const mockConnection = { checkConnectionAndReconnect: sinon.stub().resolves({ connected: true }) } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const equipStub = sinon.stub().resolves();
  const activateStub = sinon.stub().resolves();

  const mockBot = {
    inventory: { items: () => [ { name: 'bread', count: 1, slot: 5 } ] },
    equip: equipStub,
    activateItem: activateStub
  } as unknown as mineflayer.Bot;
  // add registry mock so isEdible can detect food via bot.registry.itemsByName
  (mockBot as unknown as any).registry = { itemsByName: { bread: { food: {} } } };
  const getBot = () => mockBot;

  registerConsumableTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const eatCall = toolCalls.find(call => call.args[0] === 'eat-item');
  const executor = eatCall!.args[3];

  const result = await executor({});

  t.true(equipStub.calledOnce);
  t.true(activateStub.calledOnce);
  t.true(result.content[0].text.includes('Consumed'));
  t.true(result.content[0].text.includes('bread'));
});

test('eat-item returns error when no edible item', async (t) => {
  const mockServer = { tool: sinon.stub() } as unknown as McpServer;
  const mockConnection = { checkConnectionAndReconnect: sinon.stub().resolves({ connected: true }) } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const mockBot = {
    inventory: { items: () => [] }
  } as unknown as mineflayer.Bot;
  const getBot = () => mockBot;

  registerConsumableTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const eatCall = toolCalls.find(call => call.args[0] === 'eat-item');
  const executor = eatCall!.args[3];

  const result = await executor({});

  t.true(result.isError);
  t.true(result.content[0].text.includes("Couldn't find edible item"));
});
