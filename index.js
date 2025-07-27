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
const orderJobMap = new Map();       // orderId -> {jobMapping, tokenPair, inputAmount, wallet, etc.}
const orderQuotes = new Map();       // orderId -> {quotes: [], bestQuote, expectedQuotes, receivedQuotes}
const pendingUpdatesMap = new Map(); // orderId -> Array of pending update timeouts
const quoteTimeouts = new Map();     // orderId -> timeout for quote collection

// ========== ENHANCED LOGGING UTILITIES ==========

const logger = {
  info: (message, data = {}) => {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`, 
      Object.keys(data).length > 0 ? JSON.stringify(data, null, 2) : '');
  },
  
  error: (message, error = null, data = {}) => {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`);
    if (error) {
      console.error(`[ERROR] Stack: ${error.stack}`);
    }
    if (Object.keys(data).length > 0) {
      console.error(`[ERROR] Data:`, JSON.stringify(data, null, 2));
    }
  },
  
  warn: (message, data = {}) => {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, 
      Object.keys(data).length > 0 ? JSON.stringify(data, null, 2) : '');
  },
  
  debug: (message, data = {}) => {
    console.log(`[DEBUG] ${new Date().toISOString()} - ${message}`, 
      Object.keys(data).length > 0 ? JSON.stringify(data, null, 2) : '');
  }
};

// ========== UTILITY FUNCTIONS ==========

/**
 * Safely send WebSocket messages with enhanced logging
 */
function sendUpdate(orderId, message) {
  const socket = activeConnections.get(orderId);
  if (socket && socket.readyState === socket.OPEN) {
    try {
      socket.send(JSON.stringify(message));
      logger.debug(`WebSocket message sent to ${orderId}`, { type: message.type, status: message.status });
    } catch (error) {
      logger.error(`Error sending WebSocket message to ${orderId}`, error, { messageType: message.type });
      // Clean up dead connection
      activeConnections.delete(orderId);
    }
  } else {
    logger.warn(`Cannot send message to ${orderId} - connection not available`, { 
      hasSocket: !!socket, 
      readyState: socket?.readyState,
      messageType: message.type 
    });
  }
}

/**
 * Find order ID by job ID using improved mapping
 */
function findOrderIdByJobId(jobId) {
  for (const [orderId, orderInfo] of orderJobMap.entries()) {
    if (orderInfo.jobMapping && orderInfo.jobMapping.has(jobId)) {
      return orderId;
    }
    if (orderInfo.swapJobId === jobId) {
      return orderId;
    }
  }
  return null;
}

/**
 * Check if quote collection has timed out
 */
function hasQuoteTimeout(orderId) {
  const orderInfo = orderJobMap.get(orderId);
  if (!orderInfo || !orderInfo.startTime) return false;
  
  const timeElapsed = Date.now() - orderInfo.startTime.getTime();
  return timeElapsed > 10000; // 10 second timeout
}

/**
 * Handle quote completion with improved logic
 */
function handleQuoteCompletion(orderId, dexName, result) {
  const quotesInfo = orderQuotes.get(orderId);
  if (!quotesInfo) {
    logger.error(`Quote completion handler: quotesInfo not found for ${orderId}`);
    return;
  }

  // Add provider to result if not present
  const quoteWithProvider = { ...result, provider: dexName };
  quotesInfo.quotes.push(quoteWithProvider);
  quotesInfo.receivedQuotes++;
  
  logger.info(`Quote received from ${dexName} for order ${orderId}`, {
    outputAmount: result.outputAmount,
    priceImpact: result.priceImpact,
    quotesReceived: quotesInfo.receivedQuotes,
    expectedQuotes: quotesInfo.expectedQuotes
  });
  
  sendUpdate(orderId, {
    type: 'quote_received',
    orderId,
    dex: dexName,
    quote: result,
    quotesReceived: quotesInfo.receivedQuotes,
    totalExpected: quotesInfo.expectedQuotes,
    timestamp: new Date().toISOString(),
  });

  // Check if we should process quotes
  const hasAllQuotes = quotesInfo.receivedQuotes >= quotesInfo.expectedQuotes;
  const hasMinimumQuotes = quotesInfo.receivedQuotes >= 2;
  const hasTimedOut = hasQuoteTimeout(orderId);
  
  const shouldProcess = hasAllQuotes || (hasMinimumQuotes && hasTimedOut);
                         
  if (shouldProcess) {
    logger.info(`Processing quotes for order ${orderId}`, {
      quotesReceived: quotesInfo.receivedQuotes,
      expectedQuotes: quotesInfo.expectedQuotes,
      timedOut: hasTimedOut
    });
    
    // Clear timeout if it exists
    const timeout = quoteTimeouts.get(orderId);
    if (timeout) {
      clearTimeout(timeout);
      quoteTimeouts.delete(orderId);
    }
    
    processQuotesAndRoute(orderId);
  }
}

/**
 * Handle quote failure with fallback logic
 */
function handleQuoteFailure(orderId, dexName, error) {
  logger.warn(`Quote failed for ${dexName} on order ${orderId}`, { error: error.message });
  
  sendUpdate(orderId, {
    type: 'quote_failed',
    orderId,
    dex: dexName,
    error: error.message,
    timestamp: new Date().toISOString(),
  });

  // Check if we should still try to process with available quotes
  const quotesInfo = orderQuotes.get(orderId);
  if (quotesInfo && quotesInfo.receivedQuotes >= 2) {
    // We have enough quotes to proceed even with this failure
    setTimeout(() => {
      if (quotesInfo.receivedQuotes >= 2 && !quotesInfo.bestQuote) {
        logger.info(`Processing available quotes despite ${dexName} failure`, {
          orderId,
          availableQuotes: quotesInfo.receivedQuotes
        });
        processQuotesAndRoute(orderId);
      }
    }, 2000); // Wait 2 seconds for any remaining quotes
  }
}

/**
 * Handle swap completion with validation
 */
function handleSwapCompletion(orderId, dexName, result) {
  logger.info(`Swap completed successfully on ${dexName} for order ${orderId}`, {
    transactionHash: result.transactionHash,
    success: result.success
  });
  
  // Validate swap result
  if (!result.success || !result.transactionHash) {
    logger.error(`Invalid swap result from ${dexName} for order ${orderId}`, { result });
    handleSwapFailure(orderId, dexName, new Error('Invalid swap result'));
    return;
  }
  
  sendUpdate(orderId, {
    type: 'swap_completed',
    orderId,
    dex: dexName,
    result,
    timestamp: new Date().toISOString(),
  });
  
  completeOrder(orderId, result);
}

/**
 * Handle swap failure with proper cleanup
 */
function handleSwapFailure(orderId, dexName, error) {
  logger.error(`Swap failed on ${dexName} for order ${orderId}`, error, {
    orderId,
    dex: dexName
  });
  
  sendUpdate(orderId, {
    type: 'order_update',
    orderId,
    status: 'failed',
    error: `Swap failed on ${dexName}: ${error.message}`,
    stage: 'swap_failed',
    timestamp: new Date().toISOString(),
  });

  cleanupOrder(orderId);
}

/**
 * Process quotes and route through hub with improved error handling
 */
async function processQuotesAndRoute(orderId) {
  const orderInfo = orderJobMap.get(orderId);
  const quotesInfo = orderQuotes.get(orderId);
  
  if (!orderInfo || !quotesInfo) {
    logger.error(`processQuotesAndRoute: Missing data for order ${orderId}`, {
      hasOrderInfo: !!orderInfo,
      hasQuotesInfo: !!quotesInfo
    });
    return;
  }

  try {
    logger.info(`Processing ${quotesInfo.quotes.length} quotes for order ${orderId}`);
    
    // Filter out invalid quotes
    const validQuotes = quotesInfo.quotes.filter(quote => 
      quote.outputAmount > 0 && quote.provider && !quote.error
    );
    
    if (validQuotes.length === 0) {
      throw new Error('No valid quotes available for routing');
    }

    logger.debug(`Found ${validQuotes.length} valid quotes out of ${quotesInfo.quotes.length} total`);

    // Validate quotes through hub
    const validation = routingHub.validateQuotes(validQuotes);
    
    // Send warnings if any
    if (validation.warnings && validation.warnings.length > 0) {
      sendUpdate(orderId, {
        type: 'routing_warnings',
        orderId,
        warnings: validation.warnings,
        timestamp: new Date().toISOString(),
      });
    }

    // Get routing analysis
    const analysis = routingHub.getRoutingAnalysis(validQuotes);
    const bestRoute = routingHub.selectBestRoute(
      validQuotes, 
      orderInfo.routingStrategy,
      orderInfo.userPreferences || {}
    );
    
    quotesInfo.bestQuote = bestRoute;

    // Validate that selected DEX can actually perform the swap
    if (!bestRoute.provider || !bestRoute.outputAmount) {
      throw new Error('Selected route is invalid');
    }

    // Check balance if available
    if (orderInfo.wallet.balances && orderInfo.wallet.balances[orderInfo.tokenPair.base]) {
      const balance = orderInfo.wallet.balances[orderInfo.tokenPair.base];
      if (balance < orderInfo.inputAmount) {
        throw new Error(`Insufficient balance. Required: ${orderInfo.inputAmount}, Available: ${balance}`);
      }
    }

    logger.info(`Best route selected: ${bestRoute.provider}`, {
      orderId,
      outputAmount: bestRoute.outputAmount,
      priceImpact: bestRoute.priceImpact,
      strategy: orderInfo.routingStrategy
    });

    // Send routing update
    sendUpdate(orderId, {
      type: 'routing_analysis',
      orderId,
      analysis,
      selectedRoute: bestRoute,
      validQuotes: validQuotes.length,
      totalQuotes: quotesInfo.quotes.length,
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

    // Execute swap with better error handling
    logger.info(`Executing swap on ${bestRoute.provider} for order ${orderId}`);
    const swapJob = await addSwapJob(
      bestRoute.provider, 
      orderInfo.tokenPair, 
      orderInfo.inputAmount, 
      orderInfo.wallet,
      orderId
    );

    // Store swap job ID properly
    orderInfo.swapJobId = swapJob.id;
    orderInfo.jobMapping.set(swapJob.id, bestRoute.provider);

    logger.debug(`Swap job created for order ${orderId}`, {
      jobId: swapJob.id,
      provider: bestRoute.provider
    });

  } catch (error) {
    logger.error(`Error in routing for order ${orderId}`, error);
    sendUpdate(orderId, {
      type: 'order_update',
      orderId,
      status: 'failed',
      error: error.message,
      stage: 'routing_failed',
      timestamp: new Date().toISOString(),
    });
    
    cleanupOrder(orderId);
  }
}

/**
 * Complete order and cleanup with enhanced logging
 */
function completeOrder(orderId, result) {
  const orderInfo = orderJobMap.get(orderId);
  const executionTime = orderInfo ? Date.now() - orderInfo.startTime.getTime() : 0;

  logger.info(`Order ${orderId} completed successfully`, {
    executionTime,
    transactionHash: result.transactionHash,
    provider: result.provider || 'unknown'
  });

  sendUpdate(orderId, {
    type: 'order_complete',
    orderId,
    status: 'completed',
    result,
    executionTime,
    timestamp: new Date().toISOString(),
  });

  // Cleanup after delay
  cleanupOrder(orderId, 5000);
}

/**
 * Cleanup order with configurable delay
 */
function cleanupOrder(orderId, delay = 3000) {
  setTimeout(() => {
    const socket = activeConnections.get(orderId);
    if (socket && socket.readyState === socket.OPEN) {
      socket.close();
    }
    
    // Clear any pending timeouts
    const timeout = quoteTimeouts.get(orderId);
    if (timeout) {
      clearTimeout(timeout);
      quoteTimeouts.delete(orderId);
    }
    
    const pendingUpdates = pendingUpdatesMap.get(orderId);
    if (pendingUpdates) {
      pendingUpdates.forEach(clearTimeout);
      pendingUpdatesMap.delete(orderId);
    }
    
    activeConnections.delete(orderId);
    orderJobMap.delete(orderId);
    orderQuotes.delete(orderId);
    
    logger.info(`Cleanup completed for order ${orderId}`);
  }, delay);
}

// ========== ORDER STATUS UPDATE LISTENER ==========

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
  
  logger.debug(`Status update for order ${orderId}`, { status, message: data.message });
  
  // Handle specific status changes
  if (status === 'failed' || status === 'error') {
    const orderInfo = orderJobMap.get(orderId);
    if (orderInfo) {
      orderInfo.stage = 'failed';
      cleanupOrder(orderId, 5000);
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
    
    logger.info(`Quote comparison started for order ${orderId}`, {
      tokenPair,
      inputAmount,
      jobCount: jobs.length
    });
    
    reply.send({ 
      message: 'Quote comparison started',
      jobIds: jobs.map(j => j.id),
      tokenPair,
      inputAmount,
      orderId
    });
  } catch (error) {
    logger.error('Failed to start quote comparison', error);
    reply.status(500).send({ error: error.message });
  }
});

// Place order - improved version
fastify.post('/api/orders', async (req, reply) => {
  const { 
    tokenPair, 
    inputAmount, 
    wallet, 
    routingStrategy = 'BEST_PRICE',
    userPreferences = {}
  } = req.body || {};

  // Enhanced validation
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
  if (!routingHub || !routingHub.routingStrategies) {
    return reply.status(500).send({ 
      error: 'Routing hub initialization failed' 
    });
  }

  const availableStrategies = Object.keys(routingHub.routingStrategies);
  if (availableStrategies.length === 0) {
    return reply.status(500).send({ 
      error: 'No routing strategies available' 
    });
  }

  if (!availableStrategies.includes(routingStrategy)) {
    return reply.status(400).send({ 
      error: `Invalid routing strategy. Available: ${availableStrategies.join(', ')}` 
    });
  }

  const orderId = uuidv4();

  try {
    logger.info(`Starting order ${orderId}`, {
      tokenPair,
      inputAmount,
      routingStrategy,
      userPreferences
    });

    // Get quotes from all DEXs
    const jobs = await addCompareQuotesJob(tokenPair, inputAmount, orderId);
    
    // Create order info with improved job mapping
    const orderInfo = {
      tokenPair,
      inputAmount,
      wallet,
      routingStrategy,
      userPreferences,
      stage: 'getting_quotes',
      startTime: new Date(),
      jobMapping: new Map() // job.id -> dexName
    };
    
    // Create job mapping for efficient lookup
    jobs.forEach(job => {
      const dexName = job.data.provider || job.opts.jobId?.split('-')[0] || 'unknown';
      orderInfo.jobMapping.set(job.id, dexName);
    });
    
    orderJobMap.set(orderId, orderInfo);
    orderQuotes.set(orderId, { 
      quotes: [], 
      bestQuote: null,
      expectedQuotes: jobs.length,
      receivedQuotes: 0
    });

    // Set quote collection timeout
    const timeout = setTimeout(() => {
      const quotesInfo = orderQuotes.get(orderId);
      if (quotesInfo && quotesInfo.receivedQuotes >= 2 && !quotesInfo.bestQuote) {
        logger.warn(`Quote collection timeout for order ${orderId}, processing available quotes`);
        processQuotesAndRoute(orderId);
      }
    }, 12000); // 12 second timeout
    
    quoteTimeouts.set(orderId, timeout);

    reply.send({ 
      orderId, 
      status: 'pending',
      stage: 'getting_quotes',
      tokenPair, 
      inputAmount,
      routingStrategy,
      userPreferences,
      expectedQuotes: jobs.length
    });

  } catch (error) {
    logger.error(`Error starting order ${orderId}`, error);
    return reply.status(500).send({ error: 'Failed to start order process' });
  }
});

// WebSocket for order updates - improved version
fastify.get('/ws/:orderId', { websocket: true }, (connection, req) => {
  const { orderId } = req.params;
  
  // Enhanced validation
  if (!orderId) {
    logger.error('WebSocket connection attempted without orderId');
    connection.socket.close(1008, 'Invalid orderId');
    return;
  }

  if (!orderJobMap.has(orderId)) {
    logger.error(`WebSocket connection attempted for non-existent order ${orderId}`);
    connection.socket.close(1008, 'Order not found');
    return;
  }

  if (!connection || !connection.socket) {
    logger.error(`WebSocket connection failed for order ${orderId}`);
    return;
  }

  if (activeConnections.has(orderId)) {
    logger.warn(`WebSocket connection already exists for order ${orderId}`);
    connection.socket.close(1008, 'Connection already exists');
    return;
  }

  logger.info(`WebSocket client connected for order ${orderId}`);

  activeConnections.set(orderId, connection.socket);

  // Send connection confirmation
  connection.socket.send(JSON.stringify({
    type: 'connected',
    orderId,
    message: 'WebSocket connection established. Monitoring order progress.',
    timestamp: new Date().toISOString()
  }));

  // Send current order state if available
  const orderInfo = orderJobMap.get(orderId);
  const quotesInfo = orderQuotes.get(orderId);
  
  if (orderInfo) {
    sendUpdate(orderId, {
      type: 'order_state',
      orderId,
      stage: orderInfo.stage,
      quotesReceived: quotesInfo?.receivedQuotes || 0,
      expectedQuotes: quotesInfo?.expectedQuotes || 4,
      timestamp: new Date().toISOString(),
    });
  }

  connection.socket.on('close', () => {
    logger.info(`WebSocket connection closed for order ${orderId}`);
    activeConnections.delete(orderId);
    
    // Cleanup any pending updates
    const pendingUpdates = pendingUpdatesMap.get(orderId);
    if (pendingUpdates) {
      pendingUpdates.forEach(clearTimeout);
      pendingUpdatesMap.delete(orderId);
    }
  });

  connection.socket.on('error', (err) => {
    logger.error(`WebSocket error for order ${orderId}`, err);
    activeConnections.delete(orderId);
    
    // Cleanup any pending updates
    const pendingUpdates = pendingUpdatesMap.get(orderId);
    if (pendingUpdates) {
      pendingUpdates.forEach(clearTimeout);
      pendingUpdatesMap.delete(orderId);
    }
  });
});

// Health check endpoint - enhanced
fastify.get('/api/health', async (req, reply) => {
  const health = {
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    activeOrders: orderJobMap.size,
    activeConnections: activeConnections.size,
    pendingQuoteTimeouts: quoteTimeouts.size,
    routingHub: {
      strategies: Object.keys(routingHub.routingStrategies).length,
      defaultStrategy: 'BEST_PRICE'
    },
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
    }
  };
  
  reply.send(health);
});

// Get routing strategies
fastify.get('/api/routing-strategies', async (req, reply) => {
  try {
    const strategies = routingHub.getAvailableStrategies();
    
    if (Array.isArray(strategies)) {
      reply.send(strategies);
    } else {
      const strategyArray = strategies.strategies.map(strategy => ({
        name: strategy,
        description: strategies.descriptions[strategy],
        isDefault: strategy === strategies.default
      }));
      
      reply.send(strategyArray);
    }
  } catch (error) {
    logger.error('Failed to get routing strategies', error);
    reply.status(500).send({ error: 'Failed to retrieve routing strategies' });
  }
});

// Get order status - enhanced
fastify.get('/api/orders/:orderId', async (req, reply) => {
  const { orderId } = req.params;
  const orderInfo = orderJobMap.get(orderId);
  const quotesInfo = orderQuotes.get(orderId);

  if (!orderInfo) {
    return reply.status(404).send({ error: 'Order not found' });
  }

  const response = {
    orderId,
    orderInfo: {
      ...orderInfo,
      jobMapping: Array.from(orderInfo.jobMapping.entries()) // Convert Map to array for JSON
    },
    quotesInfo,
    isActive: activeConnections.has(orderId),
    hasTimeout: quoteTimeouts.has(orderId)
  };

  reply.send(response);
});

// ========== WORKER EVENT LISTENERS ==========

function setupWorkerListeners(worker, dexName) {
  worker.on('completed', (job, result) => {
    const orderId = findOrderIdByJobId(job.id);
    
    if (!orderId) {
      logger.error(`Worker ${dexName} completed job ${job.id} but couldn't find orderId`);
      return;
    }

    const orderInfo = orderJobMap.get(orderId);
    if (!orderInfo) {
      logger.error(`Order info not found for completed job ${job.id} from ${dexName}`);
      return;
    }
    
    if (job.data.operation === 'quote') {
      handleQuoteCompletion(orderId, dexName, result);
    } else if (job.data.operation === 'swap') {
      handleSwapCompletion(orderId, dexName, result);
    }
  });

  worker.on('failed', (job, err) => {
    const orderId = findOrderIdByJobId(job.id);
    
    if (!orderId) {
      logger.error(`Worker ${dexName} failed job ${job.id} but couldn't find orderId`);
      return;
    }

    if (job.data.operation === 'swap') {
      handleSwapFailure(orderId, dexName, err);
    } else {
      handleQuoteFailure(orderId, dexName, err);
    }
  });

  worker.on('error', (err) => {
    logger.error(`Worker ${dexName} error`, err);
  });
}

// Setup listeners for all workers
setupWorkerListeners(raydiumWorker, 'Raydium');
setupWorkerListeners(meteoraWorker, 'Meteora');
setupWorkerListeners(orcaWorker, 'Orca');
setupWorkerListeners(jupiterWorker, 'Jupiter');

// ========== GRACEFUL SHUTDOWN ==========

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  // Close all active connections
  for (const [orderId, socket] of activeConnections.entries()) {
    if (socket && socket.readyState === socket.OPEN) {
      socket.close(1001, 'Server shutting down');
    }
  }
  
  // Clear all timeouts
  for (const timeout of quoteTimeouts.values()) {
    clearTimeout(timeout);
  }
  
  for (const timeouts of pendingUpdatesMap.values()) {
    timeouts.forEach(clearTimeout);
  }
  
  fastify.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

// ========== SERVER STARTUP ==========

fastify.listen({ port: 3000, host: '0.0.0.0' }, (err) => {
  if (err) {
    logger.error('Failed to start server', err);
    process.exit(1);
  }
  
  logger.info('🚀 DEX Trading Server listening on port 3000');
  logger.info('📊 Routing hub initialized with strategies:', {
    strategies: Object.keys(routingHub.routingStrategies)
  });
  logger.info('🔌 WebSocket endpoints ready for order tracking');
  logger.info('✅ Server startup completed successfully');
});

module.exports = fastify;
