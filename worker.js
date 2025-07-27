const { Worker } = require('bullmq');
const IORedis = require('ioredis');
const { inspect } = require('util');

// Import your DEX functions
const {
  raydiumQuote,
  raydiumSwap,
  meteoraQuote, 
  meteoraSwap,
  orcaQuote,
  orcaSwap,
  jupiterQuote,
  jupiterSwap,
  DEX_PROVIDERS
} = require('./mockQuote.js');

const connection = new IORedis("redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

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

// ========== STATUS TRACKING UTILITIES ==========

/**
 * Send status update via WebSocket (this will be called by the server)
 * We'll emit events that the server can listen to
 */
function emitStatusUpdate(orderId, status, data = {}) {
  // If orderId is null, try to find it from job data
  if (!orderId && data.job) {
    orderId = data.job.data.orderId;
  }
  
  // If still no orderId, use 'unknown'
  if (!orderId) {
    orderId = 'unknown';
  }
  
  const statusUpdate = {
    orderId,
    status,
    timestamp: new Date().toISOString(),
    ...data
  };
  
  // Emit custom event that server can listen to
  process.emit('orderStatusUpdate', statusUpdate);
  
  // Enhanced logging
  logger.debug(`Status update emitted for order ${orderId}`, {
    status: status.toUpperCase(),
    message: data.message || '',
    operation: data.operation || 'unknown'
  });
}

// ========== ENHANCED WORKERS ==========

// Raydium worker
const raydiumWorker = new Worker('raydium-dex', async job => {
  const { operation, tokenPair, inputAmount, wallet, orderId } = job.data;
  
  logger.info(`Raydium worker processing ${operation}`, {
    orderId,
    tokenPair: `${tokenPair.base}/${tokenPair.quote}`,
    inputAmount
  });
  
  try {
    if (operation === 'quote') {
      await job.updateProgress(25);
      
      emitStatusUpdate(orderId, 'routing', {
        message: 'Fetching Raydium liquidity data...',
        dex: 'Raydium',
        stage: 'fetching_data'
      });
      
      // Generate a single random delay between 2-5 seconds for this operation
      const delay = Math.random() * 3000 + 2000;
      logger.debug(`Raydium ${operation} processing delay: ${delay}ms`, { orderId });
      
      await job.updateProgress(50);
      await new Promise(resolve => setTimeout(resolve, delay / 2)); // First half
      
      const result = await raydiumQuote(tokenPair, inputAmount);
      await job.updateProgress(75);
      
      await new Promise(resolve => setTimeout(resolve, delay / 2)); // Second half
      await job.updateProgress(100);
      
      logger.info(`Raydium quote completed`, {
        orderId,
        outputAmount: result.outputAmount,
        priceImpact: result.priceImpact
      });
      
      return result;
    } else if (operation === 'swap') {
      await job.updateProgress(25);
      
      emitStatusUpdate(orderId, 'building', {
        message: 'Creating Raydium AMM transaction...',
        dex: 'Raydium',
        stage: 'creating_transaction'
      });
      
      // Generate a single random delay between 2-5 seconds for this operation
      const delay = Math.random() * 3000 + 2000;
      logger.debug(`Raydium ${operation} processing delay: ${delay}ms`, { orderId });
      
      await job.updateProgress(50);
      await new Promise(resolve => setTimeout(resolve, delay / 2)); // First half
      
      const result = await raydiumSwap(tokenPair, inputAmount, wallet);
      await job.updateProgress(75);
      
      await new Promise(resolve => setTimeout(resolve, delay / 2)); // Second half
      await job.updateProgress(100);
      
      logger.info(`Raydium swap completed`, {
        orderId,
        success: result.success,
        transactionHash: result.transactionHash
      });
      
      return result;
    } else {
      throw new Error(`Unknown operation: ${operation}`);
    }
  } catch (error) {
    logger.error(`Raydium worker error for ${operation}`, error, { orderId });
    throw error;
  }
}, { connection });

// Meteora worker
const meteoraWorker = new Worker('meteora-dex', async job => {
  const { operation, tokenPair, inputAmount, wallet, orderId } = job.data;
  
  logger.info(`Meteora worker processing ${operation}`, {
    orderId,
    tokenPair: `${tokenPair.base}/${tokenPair.quote}`,
    inputAmount
  });
  
  try {
    if (operation === 'quote') {
      await job.updateProgress(25);
      
      emitStatusUpdate(orderId, 'routing', {
        message: 'Analyzing Meteora DLMM bins...',
        dex: 'Meteora',
        stage: 'analyzing_dlmm'
      });
      
      // Generate a single random delay between 2-5 seconds for this operation
      const delay = Math.random() * 3000 + 2000;
      logger.debug(`Meteora ${operation} processing delay: ${delay}ms`, { orderId });
      
      await job.updateProgress(50);
      await new Promise(resolve => setTimeout(resolve, delay / 2)); // First half
      
      const result = await meteoraQuote(tokenPair, inputAmount);
      await job.updateProgress(75);
      
      await new Promise(resolve => setTimeout(resolve, delay / 2)); // Second half
      await job.updateProgress(100);
      
      logger.info(`Meteora quote completed`, {
        orderId,
        outputAmount: result.outputAmount,
        priceImpact: result.priceImpact
      });
      
      return result;
    } else if (operation === 'swap') {
      await job.updateProgress(25);
      
      emitStatusUpdate(orderId, 'building', {
        message: 'Optimizing DLMM bin allocation...',
        dex: 'Meteora',
        stage: 'optimizing_bins'
      });
      
      // Generate a single random delay between 2-5 seconds for this operation
      const delay = Math.random() * 3000 + 2000;
      logger.debug(`Meteora ${operation} processing delay: ${delay}ms`, { orderId });
      
      await job.updateProgress(50);
      await new Promise(resolve => setTimeout(resolve, delay / 2)); // First half
      
      const result = await meteoraSwap(tokenPair, inputAmount, wallet);
      await job.updateProgress(75);
      
      await new Promise(resolve => setTimeout(resolve, delay / 2)); // Second half
      await job.updateProgress(100);
      
      logger.info(`Meteora swap completed`, {
        orderId,
        success: result.success,
        transactionHash: result.transactionHash
      });
      
      return result;
    } else {
      throw new Error(`Unknown operation: ${operation}`);
    }
  } catch (error) {
    logger.error(`Meteora worker error for ${operation}`, error, { orderId });
    throw error;
  }
}, { connection });

// Orca worker
const orcaWorker = new Worker('orca-dex', async job => {
  const { operation, tokenPair, inputAmount, wallet, orderId } = job.data;
  
  logger.info(`Orca worker processing ${operation}`, {
    orderId,
    tokenPair: `${tokenPair.base}/${tokenPair.quote}`,
    inputAmount
  });
  
  try {
    if (operation === 'quote') {
      await job.updateProgress(25);
      
      emitStatusUpdate(orderId, 'routing', {
        message: 'Querying Orca Whirlpools...',
        dex: 'Orca',
        stage: 'querying_whirlpools'
      });
      
      // Generate a single random delay between 2-5 seconds for this operation
      const delay = Math.random() * 3000 + 2000;
      logger.debug(`Orca ${operation} processing delay: ${delay}ms`, { orderId });
      
      await job.updateProgress(50);
      await new Promise(resolve => setTimeout(resolve, delay / 2)); // First half
      
      const result = await orcaQuote(tokenPair, inputAmount);
      await job.updateProgress(75);
      
      await new Promise(resolve => setTimeout(resolve, delay / 2)); // Second half
      await job.updateProgress(100);
      
      logger.info(`Orca quote completed`, {
        orderId,
        outputAmount: result.outputAmount,
        priceImpact: result.priceImpact
      });
      
      return result;
    } else if (operation === 'swap') {
      await job.updateProgress(25);
      
      emitStatusUpdate(orderId, 'building', {
        message: 'Creating Orca whirlpool transaction...',
        dex: 'Orca',
        stage: 'creating_whirlpool'
      });
      
      // Generate a single random delay between 2-5 seconds for this operation
      const delay = Math.random() * 3000 + 2000;
      logger.debug(`Orca ${operation} processing delay: ${delay}ms`, { orderId });
      
      await job.updateProgress(50);
      await new Promise(resolve => setTimeout(resolve, delay / 2)); // First half
      
      const result = await orcaSwap(tokenPair, inputAmount, wallet);
      await job.updateProgress(75);
      
      await new Promise(resolve => setTimeout(resolve, delay / 2)); // Second half
      await job.updateProgress(100);
      
      logger.info(`Orca swap completed`, {
        orderId,
        success: result.success,
        transactionHash: result.transactionHash
      });
      
      return result;
    } else {
      throw new Error(`Unknown operation: ${operation}`);
    }
  } catch (error) {
    logger.error(`Orca worker error for ${operation}`, error, { orderId });
    throw error;
  }
}, { connection });

// Jupiter worker
const jupiterWorker = new Worker('jupiter-dex', async job => {
  const { operation, tokenPair, inputAmount, wallet, orderId } = job.data;
  
  logger.info(`Jupiter worker processing ${operation}`, {
    orderId,
    tokenPair: `${tokenPair.base}/${tokenPair.quote}`,
    inputAmount
  });
  
  try {
    if (operation === 'quote') {
      await job.updateProgress(25);
      
      emitStatusUpdate(orderId, 'routing', {
        message: 'Scanning all DEX routes...',
        dex: 'Jupiter',
        stage: 'route_scanning'
      });
      
      // Generate a single random delay between 2-5 seconds for this operation
      const delay = Math.random() * 3000 + 2000;
      logger.debug(`Jupiter ${operation} processing delay: ${delay}ms`, { orderId });
      
      await job.updateProgress(50);
      await new Promise(resolve => setTimeout(resolve, delay / 2)); // First half
      
      const result = await jupiterQuote(tokenPair, inputAmount);
      await job.updateProgress(75);
      
      await new Promise(resolve => setTimeout(resolve, delay / 2)); // Second half
      await job.updateProgress(100);
      
      logger.info(`Jupiter quote completed`, {
        orderId,
        outputAmount: result.outputAmount,
        priceImpact: result.priceImpact
      });
      
      return result;
    } else if (operation === 'swap') {
      await job.updateProgress(25);
      
      emitStatusUpdate(orderId, 'building', {
        message: 'Finding optimal Jupiter route...',
        dex: 'Jupiter',
        stage: 'route_optimization'
      });
      
      // Generate a single random delay between 2-5 seconds for this operation
      const delay = Math.random() * 3000 + 2000;
      logger.debug(`Jupiter ${operation} processing delay: ${delay}ms`, { orderId });
      
      await job.updateProgress(50);
      await new Promise(resolve => setTimeout(resolve, delay / 2)); // First half
      
      const result = await jupiterSwap(tokenPair, inputAmount, wallet);
      await job.updateProgress(75);
      
      await new Promise(resolve => setTimeout(resolve, delay / 2)); // Second half
      await job.updateProgress(100);
      
      logger.info(`Jupiter swap completed`, {
        orderId,
        success: result.success,
        transactionHash: result.transactionHash
      });
      
      return result;
    } else {
      throw new Error(`Unknown operation: ${operation}`);
    }
  } catch (error) {
    logger.error(`Jupiter worker error for ${operation}`, error, { orderId });
    throw error;
  }
}, { connection });

// ========== WORKER ERROR HANDLING ==========

// Add basic error handlers for each worker
raydiumWorker.on('error', (err) => {
  logger.error('Raydium worker error', err);
});

meteoraWorker.on('error', (err) => {
  logger.error('Meteora worker error', err);
});

orcaWorker.on('error', (err) => {
  logger.error('Orca worker error', err);
});

jupiterWorker.on('error', (err) => {
  logger.error('Jupiter worker error', err);
});

// ========== GRACEFUL SHUTDOWN ==========

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down workers gracefully');
  
  try {
    await Promise.all([
      raydiumWorker.close(),
      meteoraWorker.close(),
      orcaWorker.close(),
      jupiterWorker.close()
    ]);
    
    await connection.quit();
    logger.info('All workers and connections closed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during worker shutdown', error);
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down workers gracefully');
  
  try {
    await Promise.all([
      raydiumWorker.close(),
      meteoraWorker.close(),
      orcaWorker.close(),
      jupiterWorker.close()
    ]);
    
    await connection.quit();
    logger.info('All workers and connections closed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during worker shutdown', error);
    process.exit(1);
  }
});

logger.info('🚀 All DEX workers are ready and listening for jobs...');

module.exports = {
  raydiumWorker,
  meteoraWorker,
  orcaWorker,
  jupiterWorker,
  emitStatusUpdate
};
