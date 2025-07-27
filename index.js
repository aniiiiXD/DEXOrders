const Fastify = require('fastify');
const websocket = require('@fastify/websocket');
const { v4: uuidv4 } = require('uuid');

const { addAlchemyFetchJob, addJupiterFetchJob } = require('./queue');
const { alchemyWorker, jupiterWorker } = require('./worker');

const fastify = Fastify();
fastify.register(websocket);

const activeConnections = new Map(); // orderId -> WebSocket
const orderJobMap = new Map();       // orderId -> jobId

// Utility: safely send WS messages
function sendUpdate(orderId, message) {
  const socket = activeConnections.get(orderId);
  if (socket && socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

// Price request - enqueue price fetch job only
fastify.post('/api/prices', async (req, reply) => {
  const { symbol, chain } = req.body || {};
  if (!symbol) return reply.status(400).send({ error: 'Symbol is required!' });

  try {
    let job;
    if (chain === 'solana') {
      job = await addJupiterFetchJob(symbol);
    } else if (chain === 'ethereum') {
      job = await addAlchemyFetchJob(symbol);
    } else {
      return reply.status(400).send({ error: 'Unknown chain' });
    }
    reply.send({ jobId: job.id });
  } catch (e) {
    reply.status(500).send({ error: e.message });
  }
});

// Place order - create orderId, enqueue price fetch, return order info
fastify.post('/api/orders', async (req, reply) => {
  const { symbol } = req.body || {};
  const upperSymbol = symbol ? symbol.toUpperCase() : null;

  if (!upperSymbol || !['SOL', 'ETH'].includes(upperSymbol)) {
    return reply.status(400).send({ error: "Symbol must be 'SOL' or 'ETH'" });
  }

  const orderId = uuidv4();

  // Enqueue price fetch job based on symbol's chain
  try {
    let job;
    if (upperSymbol === 'SOL') {
      job = await addJupiterFetchJob(upperSymbol);
    } else {
      job = await addAlchemyFetchJob(upperSymbol);
    }
    orderJobMap.set(orderId, job.id);

    // Send initial response with orderId
    reply.send({ orderId, symbol: upperSymbol });

    // Optionally send initial WS update if client connected
    sendUpdate(orderId, {
      type: 'order_update',
      orderId,
      status: 'pending',
      symbol: upperSymbol,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`Error enqueuing job for order ${orderId}`, err);
    return reply.status(500).send({ error: 'Failed to enqueue price fetch job' });
  }
});

// WebSocket for order updates
fastify.get('/ws/:orderId', { websocket: true }, (connection, req) => {
  const { orderId } = req.params;
  console.log(`[WebSocket] Client connected for orderId: ${orderId}`);

  activeConnections.set(orderId, connection.socket);

  connection.socket.send(JSON.stringify({
    type: 'connected',
    orderId,
    message: 'WebSocket connection established. Waiting for updates.',
  }));

  connection.socket.on('close', () => {
    console.log(`[WebSocket] Connection closed for orderId: ${orderId}`);
    activeConnections.delete(orderId);
  });

  connection.socket.on('error', (err) => {
    console.log(`[WebSocket] Error on connection for orderId: ${orderId}`, err);
    activeConnections.delete(orderId);
  });
});

// --- Listen for job completions and forward via websocket ---

alchemyWorker.on('completed', (job, result) => {
  const orderId = [...orderJobMap.entries()].find(([_, jId]) => jId === job.id)?.[0];
  if (!orderId) return;

  sendUpdate(orderId, {
    type: 'order_update',
    orderId,
    status: 'confirmed',
    source: 'alchemy',
    result,
    timestamp: new Date().toISOString(),
  });

  orderJobMap.delete(orderId);
  // Optionally keep WS open or close socket here:
  // activeConnections.get(orderId)?.close();
});

alchemyWorker.on('failed', (job, err) => {
  const orderId = [...orderJobMap.entries()].find(([_, jId]) => jId === job.id)?.[0];
  if (!orderId) return;

  sendUpdate(orderId, {
    type: 'order_update',
    orderId,
    status: 'failed',
    source: 'alchemy',
    error: err.message,
    timestamp: new Date().toISOString(),
  });

  orderJobMap.delete(orderId);
});

jupiterWorker.on('completed', (job, result) => {
  const orderId = [...orderJobMap.entries()].find(([_, jId]) => jId === job.id)?.[0];
  if (!orderId) return;

  sendUpdate(orderId, {
    type: 'order_update',
    orderId,
    status: 'confirmed',
    source: 'jupiter',
    result,
    timestamp: new Date().toISOString(),
  });

  orderJobMap.delete(orderId);
  // activeConnections.get(orderId)?.close();
});

jupiterWorker.on('failed', (job, err) => {
  const orderId = [...orderJobMap.entries()].find(([_, jId]) => jId === job.id)?.[0];
  if (!orderId) return;

  sendUpdate(orderId, {
    type: 'order_update',
    orderId,
    status: 'failed',
    source: 'jupiter',
    error: err.message,
    timestamp: new Date().toISOString(),
  });

  orderJobMap.delete(orderId);
});

fastify.listen({ port: 3000 }, (err) => {
  if (err) {
    console.error('[Server] Failed to start:', err);
    process.exit(1);
  }
  console.log('[Server] Listening on port 3000');
});
