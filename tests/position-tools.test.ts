import test from 'ava';
import sinon from 'sinon';
import { registerPositionTools } from '../src/tools/position-tools.js';
import { ToolFactory } from '../src/tool-factory.js';
import { BotConnection } from '../src/bot-connection.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type mineflayer from 'mineflayer';
import { Vec3 } from 'vec3';

test('registerPositionTools registers get-position tool', (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);
  const mockBot = {} as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerPositionTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const getPositionCall = toolCalls.find(call => call.args[0] === 'get-position');

  t.truthy(getPositionCall);
  t.is(getPositionCall!.args[1], 'Get the current position of the bot');
});

test('registerPositionTools registers move-to-position tool', (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);
  const mockBot = {} as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerPositionTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const moveToPositionCall = toolCalls.find(call => call.args[0] === 'move-to-position');

  t.truthy(moveToPositionCall);
  t.true((moveToPositionCall!.args[1] as string).includes('optional sprint'));
});

test('registerPositionTools registers get-ground-y tool', (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);
  const mockBot = {} as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerPositionTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const groundYCall = toolCalls.find(call => call.args[0] === 'get-ground-y');

  t.truthy(groundYCall);
  t.true((groundYCall!.args[1] as string).includes('ground level'));
});

test('get-ground-y returns walkable Y from starting position', async (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const blockAtStub = sinon.stub().callsFake((pos: Vec3) => {
    if (pos.x === 10 && pos.z === 20 && pos.y === 70) {
      return { name: 'stone', boundingBox: 'block', type: 1 };
    }
    return { name: 'air', boundingBox: 'empty', type: 0 };
  });

  const mockBot = {
    blockAt: blockAtStub,
    game: {
      minY: 0,
      height: 128
    }
  } as unknown as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerPositionTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const groundYCall = toolCalls.find(call => call.args[0] === 'get-ground-y');
  const executor = groundYCall!.args[3];

  const result = await executor({ x: 10, z: 20 });

  t.falsy(result.isError);
  t.true(result.content[0].text.includes('(10, 0, 20)'));
});

test('get-ground-y returns error when no walkable block found', async (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const mockBot = {
    blockAt: sinon.stub().returns({ name: 'air', boundingBox: 'empty' }),
    game: {
      minY: 0,
      height: 16
    }
  } as unknown as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerPositionTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const groundYCall = toolCalls.find(call => call.args[0] === 'get-ground-y');
  const executor = groundYCall!.args[3];

  const result = await executor({ x: 10, z: 20 });

  t.true(result.isError);
  t.true(result.content[0].text.includes('Could not find a walkable top block'));
});

test('registerPositionTools registers move-in-direction tool', (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);
  const mockBot = {} as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerPositionTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const moveInDirectionCall = toolCalls.find(call => call.args[0] === 'move-in-direction');

  t.truthy(moveInDirectionCall);
  t.is(moveInDirectionCall!.args[1], 'Move the bot in a specific direction for a duration (auto-jump supported)');
});

test.serial('move-in-direction enables auto-jump by default', async (t) => {
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
  const mockBot = {
    setControlState
  } as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerPositionTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const moveInDirectionCall = toolCalls.find(call => call.args[0] === 'move-in-direction');
  const executor = moveInDirectionCall!.args[3];

  const resultPromise = executor({ direction: 'forward', duration: 300 });

  await clock.tickAsync(300);
  const result = await resultPromise;

  t.true(setControlState.calledWith('forward', true));
  t.true(setControlState.calledWith('jump', true));
  t.true(setControlState.calledWith('forward', false));
  t.true(setControlState.calledWith('jump', false));
  t.true(result.content[0].text.includes('with auto-jump'));
});

test.serial('move-in-direction can disable auto-jump', async (t) => {
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
  const mockBot = {
    setControlState
  } as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerPositionTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const moveInDirectionCall = toolCalls.find(call => call.args[0] === 'move-in-direction');
  const executor = moveInDirectionCall!.args[3];

  const resultPromise = executor({ direction: 'right', duration: 200, autoJump: false });

  await clock.tickAsync(200);
  const result = await resultPromise;

  t.true(setControlState.calledWith('right', true));
  t.true(setControlState.calledWith('right', false));
  t.false(setControlState.calledWith('jump', true));
  t.false(setControlState.calledWith('jump', false));
  t.true(result.content[0].text.includes('Moved right for 200ms'));
  t.false(result.content[0].text.includes('auto-jump'));
});

test('get-position returns current bot position', async (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const mockBot = {
    entity: {
      position: new Vec3(100, 64, 200)
    }
  } as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerPositionTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const getPositionCall = toolCalls.find(call => call.args[0] === 'get-position');
  const executor = getPositionCall!.args[3];

  const result = await executor({});

  t.true(result.content[0].text.includes('100'));
  t.true(result.content[0].text.includes('64'));
  t.true(result.content[0].text.includes('200'));
});

test('move-to-position returns error when pathfinding fails', async (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const mockBot = {
    pathfinder: {
      goto: sinon.stub().rejects(new Error('Cannot find path')),
      stop: sinon.stub()
    },
    entity: {
      position: new Vec3(10, 20, 30)
    }
  } as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerPositionTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const moveToPositionCall = toolCalls.find(call => call.args[0] === 'move-to-position');
  const executor = moveToPositionCall!.args[3];

  const result = await executor({ x: 100, y: 64, z: 200 });

  t.true(result.isError);
  t.truthy(result.content[0].text);
});

test.serial('move-to-position returns timeout error and stops pathfinder', async (t) => {
  const clock = sinon.useFakeTimers();
  t.teardown(() => clock.restore());

  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const mockBot = {
    pathfinder: {
      goto: sinon.stub().returns(new Promise(() => {})),
      stop: sinon.stub()
    },
    blockAt: sinon.stub().returns({ name: 'air', boundingBox: 'empty', type: 0 })
  } as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerPositionTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const moveToPositionCall = toolCalls.find(call => call.args[0] === 'move-to-position');
  const executor = moveToPositionCall!.args[3];

  const resultPromise = executor({ x: 100, y: 64, z: 200, timeoutMs: 1000 });
  await clock.tickAsync(1000);
  const result = await resultPromise;

  t.true(result.isError);
  t.true(result.content[0].text.includes('Move timed out after 1000ms'));
  t.true((mockBot.pathfinder!.stop as sinon.SinonStub).calledOnce);
});

test.serial('move-to-position fails when stuck for 5s without x/z movement', async (t) => {
  const clock = sinon.useFakeTimers();
  t.teardown(() => clock.restore());

  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const mockBot = {
    entity: {
      position: new Vec3(0, 64, 0)
    },
    pathfinder: {
      goto: sinon.stub().returns(new Promise(() => {})),
      stop: sinon.stub()
    },
    blockAt: sinon.stub().returns({ name: 'air', boundingBox: 'empty', type: 0 })
  } as unknown as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerPositionTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const moveToPositionCall = toolCalls.find(call => call.args[0] === 'move-to-position');
  const executor = moveToPositionCall!.args[3];

  const resultPromise = executor({ x: 10, y: 64, z: 20 });
  await clock.tickAsync(15000);
  const result = await resultPromise;

  t.true(result.isError);
  t.true(result.content[0].text.includes('タイムアウト、ブロックと接している可能性があります'));
  t.true((mockBot.pathfinder!.stop as sinon.SinonStub).calledOnce);
});

test('move-to-position succeeds without timeout and does not stop pathfinder', async (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const mockBot = {
    pathfinder: {
      goto: sinon.stub().resolves(),
      stop: sinon.stub()
    },
    blockAt: sinon.stub().returns({ name: 'air', boundingBox: 'empty', type: 0 })
  } as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerPositionTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const moveToPositionCall = toolCalls.find(call => call.args[0] === 'move-to-position');
  const executor = moveToPositionCall!.args[3];

  const result = await executor({ x: 100, y: 64, z: 200 });

  t.falsy(result.isError);
  t.true(result.content[0].text.includes('Successfully walked'));
  t.true((mockBot.pathfinder!.stop as sinon.SinonStub).notCalled);
});

test.serial('move-to-position succeeds before timeout and does not stop pathfinder', async (t) => {
  const clock = sinon.useFakeTimers();
  t.teardown(() => clock.restore());

  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const mockBot = {
    pathfinder: {
      goto: sinon.stub().resolves(),
      stop: sinon.stub()
    },
    blockAt: sinon.stub().returns({ name: 'air', boundingBox: 'empty', type: 0 })
  } as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerPositionTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const moveToPositionCall = toolCalls.find(call => call.args[0] === 'move-to-position');
  const executor = moveToPositionCall!.args[3];

  const result = await executor({ x: 100, y: 64, z: 200, timeoutMs: 1000 });
  await clock.tickAsync(1000);

  t.falsy(result.isError);
  t.true(result.content[0].text.includes('Successfully walked'));
  t.true((mockBot.pathfinder!.stop as sinon.SinonStub).notCalled);
});

test('move-to-position preserves pathfinder error when not timing out', async (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const mockBot = {
    pathfinder: {
      goto: sinon.stub().rejects(new Error('Path was stopped before it could be completed! Thus, the desired goal was not reached.')),
      stop: sinon.stub()
    },
    blockAt: sinon.stub().returns({ name: 'air', boundingBox: 'empty', type: 0 })
  } as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerPositionTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const moveToPositionCall = toolCalls.find(call => call.args[0] === 'move-to-position');
  const executor = moveToPositionCall!.args[3];

  const result = await executor({ x: 100, y: 64, z: 200, timeoutMs: 5000 });

  t.true(result.isError);
  t.true(result.content[0].text.includes('Path was stopped before it could be completed'));
  t.true((mockBot.pathfinder!.stop as sinon.SinonStub).notCalled);
});

test('move-to-position with sprint=true enables sprinting', async (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const setControlState = sinon.stub();
  const mockBot = {
    pathfinder: {
      goto: sinon.stub().resolves(),
      stop: sinon.stub()
    },
    setControlState,
    blockAt: sinon.stub().returns({ name: 'air', boundingBox: 'empty', type: 0 })
  } as unknown as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerPositionTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const moveToPositionCall = toolCalls.find(call => call.args[0] === 'move-to-position');
  const executor = moveToPositionCall!.args[3];

  const result = await executor({ x: 100, y: 64, z: 200, sprint: true });

  t.falsy(result.isError);
  t.true(result.content[0].text.includes('Successfully ran'));
  t.true(setControlState.calledWith('sprint', true));
  t.true(setControlState.calledWith('sprint', false));
});

test('move-to-position with y=start position finds walkable Y', async (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const gotoStub = sinon.stub().resolves();
  const blockAtStub = sinon.stub().callsFake((pos: Vec3) => {
    if (pos.x === 10 && pos.z === 20 && pos.y === 70) {
      return { name: 'stone', boundingBox: 'block', type: 1 };
    }
    return { name: 'air', boundingBox: 'empty', type: 0 };
  });

  const mockBot = {
    pathfinder: {
      goto: gotoStub,
      stop: sinon.stub()
    },
    setControlState: sinon.stub(),
    blockAt: blockAtStub,
    game: {
      minY: 0,
      height: 128
    }
  } as unknown as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerPositionTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const moveToPositionCall = toolCalls.find(call => call.args[0] === 'move-to-position');
  t.truthy(moveToPositionCall);
  if (!moveToPositionCall) return;
  const executor = moveToPositionCall.args[3];

  const result = await executor({ x: 10, y: 10, z: 20 });
  const goalArg = gotoStub.firstCall.args[0] as { y?: number };

  t.falsy(result.isError);
  t.is(goalArg.y, 10);
  t.true(result.content[0].text.includes('(10, 10, 20)'));
});

test('move-to-position with y=auto returns error when no walkable block found', async (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const mockBot = {
    pathfinder: {
      goto: sinon.stub().resolves(),
      stop: sinon.stub()
    },
    setControlState: sinon.stub(),
    blockAt: sinon.stub().returns({ name: 'stone', boundingBox: 'block', type: 1 }),
    game: {
      minY: 0,
      height: 16
    }
  } as unknown as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerPositionTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const moveToPositionCall = toolCalls.find(call => call.args[0] === 'move-to-position');
  const executor = moveToPositionCall!.args[3];

  const result = await executor({ x: 10, y: 10, z: 20 });

  t.true(result.isError);
  t.true(result.content[0].text.includes('Could not find a walkable top block'));
});

test('swim-to-position tool is registered', (t) => {
  const mockServer = { tool: sinon.stub() } as unknown as McpServer;
  const mockConnection = { checkConnectionAndReconnect: sinon.stub().resolves({ connected: true }) } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);
  const mockBot = { entity: { position: new Vec3(0, 63, 0) }, pathfinder: { goto: sinon.stub().resolves(), stop: sinon.stub() }, blockAt: sinon.stub().returns({ name: 'water' }) } as unknown as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerPositionTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const swimCall = toolCalls.find(call => call.args[0] === 'swim-to-position');

  t.truthy(swimCall);
  t.is(swimCall!.args[1], 'Swim to a specified position via water-only path (fails if starting or path not fully water)');
});

test('swim-to-position fails when bot not in water', async (t) => {
  const mockServer = { tool: sinon.stub() } as unknown as McpServer;
  const mockConnection = { checkConnectionAndReconnect: sinon.stub().resolves({ connected: true }) } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const mockBot = {
    entity: { position: new Vec3(0, 63, 0) },
    pathfinder: { goto: sinon.stub().resolves(), stop: sinon.stub() },
    blockAt: sinon.stub().returns({ name: 'stone' })
  } as unknown as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerPositionTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const swimCall = toolCalls.find(call => call.args[0] === 'swim-to-position');
  const executor = swimCall!.args[3];

  const result = await executor({ x: 0, y: 63, z: 5 });
  t.true(result.isError);
  t.true(result.content[0].text.includes('Bot is not currently in water'));
});

test('swim-to-position succeeds when path is water', async (t) => {
  const mockServer = { tool: sinon.stub() } as unknown as McpServer;
  const mockConnection = { checkConnectionAndReconnect: sinon.stub().resolves({ connected: true }) } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const blockAtStub = sinon.stub();
  blockAtStub.returns({ name: 'water' });

  const mockBot = {
    entity: { position: new Vec3(0, 63, 0) },
    pathfinder: { goto: sinon.stub().resolves(), stop: sinon.stub() },
    blockAt: blockAtStub
  } as unknown as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerPositionTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const swimCall = toolCalls.find(call => call.args[0] === 'swim-to-position');
  const executor = swimCall!.args[3];

  const result = await executor({ x: 0, y: 63, z: 5 });

  t.falsy(result.isError);
  t.true(result.content[0].text.includes('Successfully swam to near'));
});

test('attack-nearest-entity-with-item tool is registered', (t) => {
  const mockServer = { tool: sinon.stub() } as unknown as McpServer;
  const mockConnection = { checkConnectionAndReconnect: sinon.stub().resolves({ connected: true }) } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);
  const mockBot = {
    entity: { position: new Vec3(0, 64, 0) },
    inventory: { items: sinon.stub().returns([]) },
    entities: {},
    pathfinder: { goto: sinon.stub().resolves(), stop: sinon.stub() },
    equip: sinon.stub().resolves(),
    attack: sinon.stub()
  } as unknown as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerPositionTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const attackCall = toolCalls.find(call => call.args[0] === 'attack-nearest-entity-with-item');

  t.truthy(attackCall);
  t.is(attackCall!.args[1], 'Attack nearest entity within range using a specific weapon (fail if weapon not in inventory)');
});

test('attack-nearest-entity-with-item fails when weapon not in inventory', async (t) => {
  const mockServer = { tool: sinon.stub() } as unknown as McpServer;
  const mockConnection = { checkConnectionAndReconnect: sinon.stub().resolves({ connected: true }) } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const mockBot = {
    entity: { position: new Vec3(0, 64, 0) },
    inventory: { items: sinon.stub().returns([]) },
    entities: {},
    pathfinder: { goto: sinon.stub().resolves(), stop: sinon.stub() },
    equip: sinon.stub().resolves(),
    attack: sinon.stub()
  } as unknown as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerPositionTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const attackCall = toolCalls.find(call => call.args[0] === 'attack-nearest-entity-with-item');
  const executor = attackCall!.args[3];

  const result = await executor({ weapon: 'iron_sword' });

  t.true(result.isError);
  t.true(result.content[0].text.includes('Weapon \'iron_sword\' not found in inventory'));
});

test('attack-nearest-entity-with-item fails when no target in range', async (t) => {
  const mockServer = { tool: sinon.stub() } as unknown as McpServer;
  const mockConnection = { checkConnectionAndReconnect: sinon.stub().resolves({ connected: true }) } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const mockBot = {
    entity: { position: new Vec3(0, 64, 0) },
    inventory: { items: sinon.stub().returns([{ name: 'iron_sword' }]) },
    entities: {},
    pathfinder: { goto: sinon.stub().resolves(), stop: sinon.stub() },
    equip: sinon.stub().resolves(),
    attack: sinon.stub()
  } as unknown as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerPositionTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const attackCall = toolCalls.find(call => call.args[0] === 'attack-nearest-entity-with-item');
  const executor = attackCall!.args[3];

  const result = await executor({ weapon: 'iron_sword', maxDistance: 12 });

  t.true(result.isError);
  t.true(result.content[0].text.includes('No target of type'));
});

test('attack-nearest-entity-with-item succeeds and attacks target', async (t) => {
  const mockServer = { tool: sinon.stub() } as unknown as McpServer;
  const mockConnection = { checkConnectionAndReconnect: sinon.stub().resolves({ connected: true }) } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const targetEntity = {
    position: new Vec3(5, 64, 0),
    type: 'mob',
    name: 'zombie'
  };

  const mockBot = {
    entity: { position: new Vec3(0, 64, 0) },
    inventory: { items: sinon.stub().returns([{ name: 'iron_sword' }]) },
    entities: { 1: targetEntity },
    pathfinder: { goto: sinon.stub().resolves(), stop: sinon.stub() },
    equip: sinon.stub().resolves(),
    attack: sinon.stub()
  } as unknown as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerPositionTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const attackCall = toolCalls.find(call => call.args[0] === 'attack-nearest-entity-with-item');
  const executor = attackCall!.args[3];

  const result = await executor({ weapon: 'iron_sword', maxDistance: 12, attackRange: 2 });

  t.falsy(result.isError);
  t.true(result.content[0].text.includes('Attacked'));
  t.true((mockBot.attack as sinon.SinonStub).called);
});

test('attack-nearest-entity-with-item filters targets by type (mob)', async (t) => {
  const mockServer = { tool: sinon.stub() } as unknown as McpServer;
  const mockConnection = { checkConnectionAndReconnect: sinon.stub().resolves({ connected: true }) } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const playerEntity = {
    position: new Vec3(5, 64, 0),
    type: 'player',
    username: 'player1'
  };

  const mockBot = {
    entity: { position: new Vec3(0, 64, 0) },
    inventory: { items: sinon.stub().returns([{ name: 'iron_sword' }]) },
    entities: { 1: playerEntity },
    pathfinder: { goto: sinon.stub().resolves(), stop: sinon.stub() },
    equip: sinon.stub().resolves(),
    attack: sinon.stub()
  } as unknown as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerPositionTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const attackCall = toolCalls.find(call => call.args[0] === 'attack-nearest-entity-with-item');
  const executor = attackCall!.args[3];

  const result = await executor({ weapon: 'iron_sword', targetType: 'mob' });

  t.true(result.isError);
  t.true(result.content[0].text.includes('No target of type'));
});

test('attack-nearest-entity tool is registered', (t) => {
  const mockServer = { tool: sinon.stub() } as unknown as McpServer;
  const mockConnection = { checkConnectionAndReconnect: sinon.stub().resolves({ connected: true }) } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);
  const mockBot = {
    entity: { position: new Vec3(0, 64, 0) },
    entities: {},
    pathfinder: { goto: sinon.stub().resolves(), stop: sinon.stub() },
    attack: sinon.stub()
  } as unknown as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerPositionTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const attackCall = toolCalls.find(call => call.args[0] === 'attack-nearest-entity');

  t.truthy(attackCall);
  t.is(attackCall!.args[1], 'Attack nearest entity within range with bare hands (no weapon required)');
});

test('attack-nearest-entity fails when no target in range', async (t) => {
  const mockServer = { tool: sinon.stub() } as unknown as McpServer;
  const mockConnection = { checkConnectionAndReconnect: sinon.stub().resolves({ connected: true }) } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const mockBot = {
    entity: { position: new Vec3(0, 64, 0) },
    entities: {},
    pathfinder: { goto: sinon.stub().resolves(), stop: sinon.stub() },
    attack: sinon.stub()
  } as unknown as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerPositionTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const attackCall = toolCalls.find(call => call.args[0] === 'attack-nearest-entity');
  const executor = attackCall!.args[3];

  const result = await executor({ maxDistance: 12 });

  t.true(result.isError);
  t.true(result.content[0].text.includes('No target of type'));
});

test('attack-nearest-entity succeeds and punches target', async (t) => {
  const mockServer = { tool: sinon.stub() } as unknown as McpServer;
  const mockConnection = { checkConnectionAndReconnect: sinon.stub().resolves({ connected: true }) } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const targetEntity = {
    position: new Vec3(5, 64, 0),
    type: 'mob',
    name: 'zombie'
  };

  const mockBot = {
    entity: { position: new Vec3(0, 64, 0) },
    entities: { 1: targetEntity },
    pathfinder: { goto: sinon.stub().resolves(), stop: sinon.stub() },
    attack: sinon.stub()
  } as unknown as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerPositionTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const attackCall = toolCalls.find(call => call.args[0] === 'attack-nearest-entity');
  const executor = attackCall!.args[3];

  const result = await executor({ maxDistance: 12, attackRange: 2 });

  t.falsy(result.isError);
  t.true(result.content[0].text.includes('Punched'));
  t.true(result.content[0].text.includes('bare hands'));
  t.true((mockBot.attack as sinon.SinonStub).called);
});

test('attack-nearest-entity filters targets by type (player)', async (t) => {
  const mockServer = { tool: sinon.stub() } as unknown as McpServer;
  const mockConnection = { checkConnectionAndReconnect: sinon.stub().resolves({ connected: true }) } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const mobEntity = {
    position: new Vec3(5, 64, 0),
    type: 'mob',
    name: 'zombie'
  };

  const mockBot = {
    entity: { position: new Vec3(0, 64, 0) },
    entities: { 1: mobEntity },
    pathfinder: { goto: sinon.stub().resolves(), stop: sinon.stub() },
    attack: sinon.stub()
  } as unknown as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerPositionTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const attackCall = toolCalls.find(call => call.args[0] === 'attack-nearest-entity');
  const executor = attackCall!.args[3];

  const result = await executor({ targetType: 'player' });

  t.true(result.isError);
  t.true(result.content[0].text.includes('No target of type'));
});
