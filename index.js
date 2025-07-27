const Fastify = require('fastify');
const websocket = require('@fastify/websocket');
const { v4: uuidv4 } = require('uuid');
const { emitStatusUpdate } = require('./worker');

// Import updated DEX queue functions
const { addQuoteJob, addSwapJob, addCompareQuotesJob } = require('./queue');
const { raydiumWorker, meteoraWorker, orcaWorker, jupiterWorker } = require('./worker');
const { DEXRoutingHub } = require('./hub');

const fastify = Fastify();
fastify.register(websocket);

// Initialize routing hub
const routingHub = new DEXRoutingHub();

// Global state management
const activeConnections = new Map(); // orderId -> WebSocket
const orderJobMap = new Map();       // orderId -> {jobIds: [], tokenPair, inputAmount, wallet}
const orderQuotes = new Map();       // orderId -> {quotes: [], bestQuote}

// ========== UTILITY FUNCTIONS ==========

/**
 * Safely send WebSocket messages
 * @param {string} orderId - Order ID
 * @param {Object} message - Message to send
 */
function sendUpdate(orderId, message) {
  const socket = activeConnections.get(orderId);
  if (socket && socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

/**
 * Process quotes and route through hub
 * @param {string} orderId - Order ID
 */
async function processQuotesAndRoute(orderId) {
  const orderInfo = orderJobMap.get(orderId);
  const quotesInfo = orderQuotes.get(orderId);
  
  if (!orderInfo || !quotesInfo || quotesInfo.quotes.length < 4) {
    return; // Wait for all quotes
  }

  try {
    console.log(`[Order ${orderId}] All quotes received, routing through hub...`);
    
    // Validate quotes
    const validation = routingHub.validateQuotes(quotesInfo.quotes);
    if (!validation.valid) {
      throw new Error(`Quote validation failed: ${validation.errors.join(', ')}`);
    }

    // Send warnings if any
    if (validation.warnings.length > 0) {
      sendUpdate(orderId, {
        type: 'routing_warnings',
        orderId,
        warnings: validation.warnings,
        timestamp: new Date().toISOString(),
      });
    }
    
    // Get routing analysis
    const analysis = routingHub.getRoutingAnalysis(quotesInfo.quotes);
    const bestRoute = routingHub.selectBestRoute(
      quotesInfo.quotes, 
      orderInfo.routingStrategy,
      orderInfo.userPreferences || {}
    );
    
    quotesInfo.bestQuote = bestRoute;

    // Send routing update
    sendUpdate(orderId, {
      type: 'routing_analysis',
      orderId,
      analysis,
      selectedRoute: bestRoute,
      timestamp: new Date().toISOString(),
    });

    // Update order stage
    orderInfo.stage = 'executing_swap';
    
    sendUpdate(orderId, {
      type: 'order_update',
      orderId,
      status: 'executing',
      stage: 'executing_swap',
      message: `Executing swap on ${bestRoute.provider}...`,
      selectedDEX: bestRoute.provider,
      estimatedOutput: bestRoute.outputAmount,
      timestamp: new Date().toISOString(),
    });

    // Execute swap on selected DEX
    console.log(`[Order ${orderId}] Executing swap on ${bestRoute.provider}...`);
    const swapJob = await addSwapJob(
      bestRoute.provider, 
      orderInfo.tokenPair, 
      orderInfo.inputAmount, 
      orderInfo.wallet,
      orderId
    );

    orderInfo.swapJobId = swapJob.id;

  } catch (error) {
    console.error(`[Order ${orderId}] Error in routing:`, error);
    sendUpdate(orderId, {
      type: 'order_update',
      orderId,
      status: 'failed',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
    
    // Cleanup
    orderJobMap.delete(orderId);
    orderQuotes.delete(orderId);
  }
}

/**
 * Complete order and cleanup
 * @param {string} orderId - Order ID
 * @param {Object} result - Swap result
 */
function completeOrder(orderId, result) {
  const orderInfo = orderJobMap.get(orderId);
  const executionTime = orderInfo ? Date.now() - orderInfo.startTime.getTime() : 0;

  sendUpdate(orderId, {
    type: 'order_complete',
    orderId,
    status: 'completed',
    result,
    executionTime,
    timestamp: new Date().toISOString(),
  });

  // Cleanup and close connection after a delay
  setTimeout(() => {
    const socket = activeConnections.get(orderId);
    if (socket) {
      socket.close();
    }
    activeConnections.delete(orderId);
    orderJobMap.delete(orderId);
    orderQuotes.delete(orderId);
    console.log(`[Order ${orderId}] Cleanup completed`);
  }, 5000); // 5 second delay before cleanup
}

// ========== ORDER STATUS UPDATE LISTENER ==========

// Add this event listener to handle status updates from workers
process.on('orderStatusUpdate', (statusUpdate) => {
  const { orderId, status, ...data } = statusUpdate;
  
  // Send update via WebSocket
  sendUpdate(orderId, {
    type: 'status_update',
    orderId,
    status,
    ...data,
    timestamp: new Date().toISOString()
  });
  
  // Log status change with better formatting
  console.log(`📡 [Order ${orderId}] ${status.toUpperCase()}: ${data.message || 'Status updated'}`);
  
  // Handle specific status changes
  if (status === 'failed' || status === 'error') {
    // Mark order as failed and trigger cleanup
    const orderInfo = orderJobMap.get(orderId);
    if (orderInfo) {
      orderInfo.stage = 'failed';
      
      // Schedule cleanup
      setTimeout(() => {
        const socket = activeConnections.get(orderId);
        if (socket && socket.readyState === socket.OPEN) {
          socket.close();
        }
        activeConnections.delete(orderId);
        orderJobMap.delete(orderId);
        orderQuotes.delete(orderId);
        console.log(`[Order ${orderId}] Cleanup completed after failure`);
      }, 5000);
    }
  }
});

// ========== API ENDPOINTS ==========

// Get quotes for comparison
fastify.post('/api/quotes', async (req, reply) => {
  const { tokenPair, inputAmount } = req.body || {};
  
  if (!tokenPair || !tokenPair.base || !tokenPair.quote) {
    return reply.status(400).send({ error: 'tokenPair with base and quote is required' });
  }
  
  if (!inputAmount || inputAmount <= 0) {
    return reply.status(400).send({ error: 'Valid inputAmount is required' });
  }

  try {
    const orderId = uuidv4();
    const jobs = await addCompareQuotesJob(tokenPair, inputAmount, orderId);
    reply.send({ 
      message: 'Quote comparison started',
      jobIds: jobs.map(j => j.id),
      tokenPair,
      inputAmount,
      orderId
    });
  } catch (error) {
    reply.status(500).send({ error: error.message });
  }
});

// Place order - create orderId, get quotes, route through hub, execute swap
fastify.post('/api/orders', async (req, reply) => {
  const { 
    tokenPair, 
    inputAmount, 
    wallet, 
    routingStrategy = 'BEST_PRICE',
    userPreferences = {}
  } = req.body || {};

  // Validation
  if (!tokenPair || !tokenPair.base || !tokenPair.quote) {
    return reply.status(400).send({ error: 'tokenPair with base and quote is required' });
  }
  
  if (!inputAmount || inputAmount <= 0) {
    return reply.status(400).send({ error: 'Valid inputAmount is required' });
  }
  
  if (!wallet || !wallet.balances) {
    return reply.status(400).send({ error: 'Valid wallet with balances is required' });
  }

  // Validate routing strategy
  const availableStrategies = Object.keys(routingHub.routingStrategies);
  if (!availableStrategies.includes(routingStrategy)) {
    return reply.status(400).send({ 
      error: `Invalid routing strategy. Available: ${availableStrategies.join(', ')}` 
    });
  }

  const orderId = uuidv4();

  try {
    // Step 1: Get quotes from all DEXs
    console.log(`[Order ${orderId}] Starting quote comparison...`);
    const jobs = await addCompareQuotesJob(tokenPair, inputAmount);
    
    // Store order info
    orderJobMap.set(orderId, {
      jobIds: jobs.map(j => j.id),
      tokenPair,
      inputAmount,
      wallet,
      routingStrategy,
      userPreferences,
      stage: 'quoting',
      startTime: new Date()
    });

    orderQuotes.set(orderId, { quotes: [], bestQuote: null });

    // Send initial response
    reply.send({ 
      orderId, 
      status: 'pending',
      stage: 'getting_quotes',
      tokenPair, 
      inputAmount,
      routingStrategy,
      userPreferences
    });

    // Send initial WS update
    sendUpdate(orderId, {
      type: 'order_update',
      orderId,
      status: 'pending',
      stage: 'getting_quotes',
      message: 'Fetching quotes from all DEXs...',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error(`[Order ${orderId}] Error starting order:`, error);
    return reply.status(500).send({ error: 'Failed to start order process' });
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
    message: 'WebSocket connection established. Monitoring order progress.',
    timestamp: new Date().toISOString()
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

// Health check endpoint
fastify.get('/api/health', async (req, reply) => {
  reply.send({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    activeOrders: orderJobMap.size,
    activeConnections: activeConnections.size,
    routingHub: {
      strategies: Object.keys(routingHub.routingStrategies).length,
      defaultStrategy: 'BEST_PRICE'
    }
  });
});

// Get routing strategies
fastify.get('/api/routing-strategies', async (req, reply) => {
  reply.send(routingHub.getAvailableStrategies());
});

// Get order status
fastify.get('/api/orders/:orderId', async (req, reply) => {
  const { orderId } = req.params;
  const orderInfo = orderJobMap.get(orderId);
  const quotesInfo = orderQuotes.get(orderId);

  if (!orderInfo) {
    return reply.status(404).send({ error: 'Order not found' });
  }

  reply.send({
    orderId,
    orderInfo,
    quotesInfo,
    isActive: activeConnections.has(orderId)
  });
});

// ========== WORKER EVENT LISTENERS ==========

function setupWorkerListeners(worker, dexName) {
  worker.on('completed', (job, result) => {
    const orderId = [...orderJobMap.entries()].find(([_, info]) => 
      info.jobIds?.includes(job.id) || info.swapJobId === job.id
    )?.[0];
    
    if (!orderId) return;

    const orderInfo = orderJobMap.get(orderId);
    
    if (job.data.operation === 'quote') {
      // Handle quote completion
      const quotesInfo = orderQuotes.get(orderId);
      if (quotesInfo) {
        quotesInfo.quotes.push(result);
        
        sendUpdate(orderId, {
          type: 'quote_received',
          orderId,
          dex: dexName,
          quote: result,
          quotesReceived: quotesInfo.quotes.length,
          totalExpected: 4,
          timestamp: new Date().toISOString(),
        });

        // Check if we have all quotes
        if (quotesInfo.quotes.length === 4) {
          processQuotesAndRoute(orderId);
        }
      }
    } else if (job.data.operation === 'swap') {
      // Handle swap completion
      console.log(`[Order ${orderId}] Swap completed successfully on ${dexName}`);
      completeOrder(orderId, result);
    }
  });

  worker.on('failed', (job, err) => {
    const orderId = [...orderJobMap.entries()].find(([_, info]) => 
      info.jobIds?.includes(job.id) || info.swapJobId === job.id
    )?.[0];
    
    if (!orderId) return;

    if (job.data.operation === 'swap') {
      // Swap failed - this is critical
      sendUpdate(orderId, {
        type: 'order_update',
        orderId,
        status: 'failed',
        error: `Swap failed on ${dexName}: ${err.message}`,
        timestamp: new Date().toISOString(),
      });

      // Cleanup
      setTimeout(() => {
        activeConnections.get(orderId)?.close();
        activeConnections.delete(orderId);
        orderJobMap.delete(orderId);
        orderQuotes.delete(orderId);
      }, 3000);
    } else {
      // Quote failed - not critical, we can continue with other DEXs
      console.warn(`[Order ${orderId}] Quote failed on ${dexName}: ${err.message}`);
      
      sendUpdate(orderId, {
        type: 'quote_failed',
        orderId,
        dex: dexName,
        error: err.message,
        timestamp: new Date().toISOString(),
      });
    }
  });
}

// Setup listeners for all workers
setupWorkerListeners(raydiumWorker, 'Raydium');
setupWorkerListeners(meteoraWorker, 'Meteora');
setupWorkerListeners(orcaWorker, 'Orca');
setupWorkerListeners(jupiterWorker, 'Jupiter');

// ========== SERVER STARTUP ==========

fastify.listen({ port: 3000 }, (err) => {
  if (err) {
    console.error('[Server] Failed to start:', err);
    process.exit(1);
  }
  console.log('[Server] 🚀 DEX Trading Server listening on port 3000');
  console.log('[Server] 📊 Routing hub initialized with 4 strategies');
  console.log('[Server] 🔌 WebSocket endpoints ready for order tracking');
  console.log('[Server] 🎯 Available strategies:', Object.keys(routingHub.routingStrategies).join(', '));
});
