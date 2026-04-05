import test from 'ava';
import sinon from 'sinon';
import { registerBlockTools } from '../src/tools/block-tools.js';
import { ToolFactory } from '../src/tool-factory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BotConnection } from '../src/bot-connection.js';
import type mineflayer from 'mineflayer';
import { Vec3 } from 'vec3';

test('registerBlockTools registers place-block tool', (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);
  const mockBot = {} as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerBlockTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const placeBlockCall = toolCalls.find(call => call.args[0] === 'place-block');

  t.truthy(placeBlockCall);
  t.is(placeBlockCall!.args[1], 'Place a block at the specified position');
});

test('registerBlockTools registers dig-block tool', (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);
  const mockBot = {} as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerBlockTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const digBlockCall = toolCalls.find(call => call.args[0] === 'dig-block');

  t.truthy(digBlockCall);
  t.is(digBlockCall!.args[1], 'Dig a block at the specified position');
});

test('registerBlockTools registers get-block-info tool', (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);
  const mockBot = {} as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerBlockTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const getBlockInfoCall = toolCalls.find(call => call.args[0] === 'get-block-info');

  t.truthy(getBlockInfoCall);
  t.is(getBlockInfoCall!.args[1], 'Get information about a block at the specified position');
});

test('registerBlockTools registers find-blocks tool', (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);
  const mockBot = {} as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerBlockTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const findBlockCall = toolCalls.find(call => call.args[0] === 'find-blocks');

  t.truthy(findBlockCall);
  t.is(findBlockCall!.args[1], 'Find one or more nearby blocks of a specific type');
});

test.serial('place-block jumps when placing at bot current position', async (t) => {
  const clock = sinon.useFakeTimers();
  t.teardown(() => clock.restore());

  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const setControlState = sinon.stub();
  const referenceBlock = { name: 'stone', position: new Vec3(10, 63, 20) };
  const blockAt = sinon.stub().callsFake((pos: Vec3) => {
    if (pos.x === 10 && pos.y === 64 && pos.z === 20) return { name: 'air' };
    if (pos.x === 10 && pos.y === 63 && pos.z === 20) return referenceBlock;
    return { name: 'air' };
  });

  const mockBot = {
    entity: { position: new Vec3(10.2, 64.0, 20.8) },
    blockAt,
    canSeeBlock: sinon.stub().returns(true),
    pathfinder: { goto: sinon.stub().resolves() },
    lookAt: sinon.stub().resolves(),
    placeBlock: sinon.stub().resolves(),
    setControlState
  } as unknown as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerBlockTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const placeBlockCall = toolCalls.find(call => call.args[0] === 'place-block');
  const executor = placeBlockCall!.args[3];

  const resultPromise = executor({ x: 10, y: 64, z: 20 });
  await clock.tickAsync(150);
  const result = await resultPromise;

  t.falsy(result.isError);
  t.true(result.content[0].text.includes('Placed block at (10, 64, 20)'));
  t.true(setControlState.calledWith('jump', true));
  t.true(setControlState.calledWith('jump', false));
});

test('place-block does not jump when target is not bot current position', async (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const setControlState = sinon.stub();
  const referenceBlock = { name: 'stone', position: new Vec3(11, 63, 20) };
  const blockAt = sinon.stub().callsFake((pos: Vec3) => {
    if (pos.x === 11 && pos.y === 64 && pos.z === 20) return { name: 'air' };
    if (pos.x === 11 && pos.y === 63 && pos.z === 20) return referenceBlock;
    return { name: 'air' };
  });

  const mockBot = {
    entity: { position: new Vec3(10.2, 64.0, 20.8) },
    blockAt,
    canSeeBlock: sinon.stub().returns(true),
    pathfinder: { goto: sinon.stub().resolves() },
    lookAt: sinon.stub().resolves(),
    placeBlock: sinon.stub().resolves(),
    setControlState
  } as unknown as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerBlockTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const placeBlockCall = toolCalls.find(call => call.args[0] === 'place-block');
  const executor = placeBlockCall!.args[3];

  const result = await executor({ x: 11, y: 64, z: 20 });

  t.falsy(result.isError);
  t.true(result.content[0].text.includes('Placed block at (11, 64, 20)'));
  t.false(setControlState.calledWith('jump', true));
});

test('place-block places block when reference block exists', async (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const inventoryItems = [{ name: 'oak_planks', count: 10, slot: 1 }];
  const referenceBlock = { name: 'stone', position: new Vec3(12, 63, 20) };
  const blockAt = sinon.stub().callsFake((pos: Vec3) => {
    if (pos.x === 12 && pos.y === 64 && pos.z === 20) return { name: 'air' };
    if (pos.x === 12 && pos.y === 63 && pos.z === 20) return referenceBlock;
    return { name: 'air' };
  });

  const placeStub = sinon.stub().resolves();

  const mockBot = {
    inventory: { items: () => inventoryItems },
    blockAt,
    canSeeBlock: sinon.stub().returns(true),
    pathfinder: { goto: sinon.stub().resolves() },
    lookAt: sinon.stub().resolves(),
    placeBlock: placeStub,
    entity: { position: new Vec3(12.2, 64.0, 20.8) }
  } as unknown as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerBlockTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const placeBlockCall = toolCalls.find(call => call.args[0] === 'place-block');
  const executor = placeBlockCall!.args[3];

  const result = await executor({ x: 12, y: 64, z: 20 });

  t.falsy(result.isError);
  t.true(placeStub.called);
  t.true(result.content[0].text.includes('Placed block at (12, 64, 20)'));
});

test('dig-block-with-item returns error when specified item not in inventory', async (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const inventoryItems: any[] = [];
  const mockBlock = { name: 'stone', position: new Vec3(0, 0, 0) };
  const blockAt = sinon.stub().callsFake((pos: Vec3) => {
    if (pos.x === 0 && pos.y === 0 && pos.z === 0) return mockBlock;
    return { name: 'air' };
  });

  const mockBot = {
    inventory: { items: () => inventoryItems },
    blockAt,
    entity: { position: new Vec3(0, 0, 0) }
  } as unknown as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerBlockTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const digWithItemCall = toolCalls.find(call => call.args[0] === 'dig-block-with-item');
  const executor = digWithItemCall!.args[3];

  const result = await executor({ x: 0, y: 0, z: 0, item: 'nonexistent_item' });

  t.true(result.isError);
  t.true(result.content[0].text.includes("Fail: Item 'nonexistent_item' not found in inventory"));
});

test('get-block-info returns block information', async (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);
  
  const mockBlock = {
    name: 'stone',
    type: 1,
    position: new Vec3(10, 64, 20)
  };
  const mockBot = {
    blockAt: sinon.stub().returns(mockBlock)
  } as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerBlockTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const getBlockInfoCall = toolCalls.find(call => call.args[0] === 'get-block-info');
  const executor = getBlockInfoCall!.args[3];

  const result = await executor({ x: 10, y: 64, z: 20 });

  t.true(result.content[0].text.includes('stone'));
  t.true(result.content[0].text.includes('10'));
  t.true(result.content[0].text.includes('64'));
  t.true(result.content[0].text.includes('20'));
});

test('get-block-info handles missing block', async (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);
  
  const mockBot = {
    blockAt: sinon.stub().returns(null)
  } as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerBlockTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const getBlockInfoCall = toolCalls.find(call => call.args[0] === 'get-block-info');
  const executor = getBlockInfoCall!.args[3];

  const result = await executor({ x: 10, y: 64, z: 20 });

  t.true(result.content[0].text.includes('No block information found'));
});

test('dig-block handles air blocks', async (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);
  
  const mockBlock = {
    name: 'air'
  };
  const mockBot = {
    blockAt: sinon.stub().returns(mockBlock)
  } as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerBlockTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const digBlockCall = toolCalls.find(call => call.args[0] === 'dig-block');
  const executor = digBlockCall!.args[3];

  const result = await executor({ x: 10, y: 64, z: 20 });

  t.true(result.content[0].text.includes('No block found'));
});

test('place-block blocks placing at bot position and one block above', async (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const mockBot = {
    entity: { position: new Vec3(10.4, 64, 20.7) },
    blockAt: sinon.stub().returns({ name: 'air' })
  } as unknown as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerBlockTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const placeBlockCall = toolCalls.find(call => call.args[0] === 'place-block');
  const executor = placeBlockCall!.args[3];

  const resultAtFeet = await executor({ x: 10, y: 64, z: 20 });
  const resultAtHead = await executor({ x: 10, y: 65, z: 20 });

  t.true(resultAtFeet.content[0].text.includes("can't place a block"));
  t.true(resultAtHead.content[0].text.includes("can't place a block"));
});

test('place-block floors input coordinates before self-placement guard', async (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const mockBot = {
    entity: { position: new Vec3(10.4, 64, 20.7) },
    blockAt: sinon.stub().returns({ name: 'air' })
  } as unknown as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerBlockTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const placeBlockCall = toolCalls.find(call => call.args[0] === 'place-block');
  const executor = placeBlockCall!.args[3];

  const result = await executor({ x: 10.4, y: 64, z: 20.7 });

  t.true(result.content[0].text.includes("can't place a block"));
});

test('find-blocks returns not found when block not found', async (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);
  
  const mockBot = {
    version: '1.21',
    findBlock: sinon.stub().returns(null)
  } as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerBlockTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const findBlockCall = toolCalls.find(call => call.args[0] === 'find-blocks');
  const executor = findBlockCall!.args[3];

  const result = await executor({ blockType: 'diamond_ore', maxDistance: 16 });

  t.true(result.content[0].text.includes('No diamond_ore found'));
});

test('find-blocks returns multiple results when count is greater than one', async (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const mockBot = {
    version: '1.21',
    entity: { position: new Vec3(0, 64, 0) },
    findBlocks: sinon.stub().returns([new Vec3(1, 64, 0), new Vec3(2, 64, 0)])
  } as unknown as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerBlockTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const findBlockCall = toolCalls.find(call => call.args[0] === 'find-blocks');
  const executor = findBlockCall!.args[3];

  const result = await executor({ blockType: 'stone', maxDistance: 16, count: 2 });

  t.true(result.content[0].text.includes('Found 2 stone block(s)'));
  t.true(result.content[0].text.includes('(1, 64, 0)'));
  t.true(result.content[0].text.includes('(2, 64, 0)'));
});

test('find-blocks clamps oversized count before calling bot.findBlocks', async (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const findBlocksStub = sinon.stub().returns([new Vec3(1, 64, 0)]);
  const mockBot = {
    version: '1.21',
    entity: { position: new Vec3(0, 64, 0) },
    findBlocks: findBlocksStub
  } as unknown as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerBlockTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const findBlockCall = toolCalls.find(call => call.args[0] === 'find-blocks');
  const executor = findBlockCall!.args[3];

  await executor({ blockType: 'stone', maxDistance: 16, count: 10_000 });

  const findBlocksArgs = findBlocksStub.firstCall.args[0];
  t.is(findBlocksArgs.count, 256);
});
