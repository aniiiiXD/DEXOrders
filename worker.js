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
  
  // Also log for debugging
  console.log(`📊 [${orderId}] Status: ${status.toUpperCase()}`, data.message || '');
}

/**
 * Enhanced worker event listeners with status tracking
 */
const addWorkerEventListeners = (worker, dexName) => {
  worker.on('active', job => {
    const orderId = job.data.orderId;
    console.log(`${dexName} worker started processing job ${job.id} (${job.data.operation})`);
    
    if (job.data.operation === 'quote') {
      emitStatusUpdate(orderId, 'routing', {
        message: `Getting quote from ${dexName}...`,
        dex: dexName,
        operation: 'quote'
      });
    } else if (job.data.operation === 'swap') {
      emitStatusUpdate(orderId, 'building', {
        message: `Building transaction on ${dexName}...`,
        dex: dexName,
        operation: 'swap'
      });
    }
  });

  worker.on('completed', (job, result) => {
    const orderId = job.data.orderId;
    console.log(`${dexName} worker completed job ${job.id}:`, inspect(result, { depth: 2 }));
    
    if (job.data.operation === 'quote') {
      emitStatusUpdate(orderId, 'routing', {
        message: `Quote received from ${dexName}`,
        dex: dexName,
        quote: result,
        operation: 'quote_completed'
      });
    } else if (job.data.operation === 'swap') {
      if (result.success) {
        emitStatusUpdate(orderId, 'submitted', {
          message: `Transaction submitted on ${dexName}`,
          dex: dexName,
          transactionHash: result.transactionHash,
          operation: 'swap_submitted'
        });
        
        // Simulate network confirmation delay
        setTimeout(() => {
          emitStatusUpdate(orderId, 'confirmed', {
            message: `Transaction confirmed on ${dexName}`,
            dex: dexName,
            transactionHash: result.transactionHash,
            result: result,
            operation: 'swap_confirmed'
          });
        }, 1000); // 1 second delay to simulate network confirmation
      }
    }
  });

  worker.on('failed', (job, err) => {
    const orderId = job.data.orderId;
    console.error(`${dexName} worker failed job ${job.id}:`, err.message);
    
    emitStatusUpdate(orderId, 'failed', {
      message: `${job.data.operation} failed on ${dexName}: ${err.message}`,
      dex: dexName,
      error: err.message,
      operation: job.data.operation
    });
  });

  worker.on('error', (err) => {
    console.error(`${dexName} worker error:`, err);
  });

  worker.on('progress', (job, progress) => {
    const orderId = job.data.orderId;
    console.log(`${dexName} worker job ${job.id} progress:`, progress);
    
    // Emit progress updates for better UX
    if (job.data.operation === 'quote' && progress === 25) {
      emitStatusUpdate(orderId, 'routing', {
        message: `Processing quote on ${dexName}...`,
        dex: dexName,
        progress: progress
      });
    } else if (job.data.operation === 'swap' && progress === 25) {
      emitStatusUpdate(orderId, 'building', {
        message: `Preparing transaction on ${dexName}...`,
        dex: dexName,
        progress: progress
      });
    }
  });
};

// ========== ENHANCED WORKERS WITH STATUS TRACKING ==========

// Raydium worker
const raydiumWorker = new Worker('raydium-dex', async job => {
  const { operation, tokenPair, inputAmount, wallet, orderId } = job.data;
  
  console.log(`Raydium worker processing ${operation} for ${tokenPair.base}/${tokenPair.quote}`);
  
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
      console.log(`Raydium ${operation} delay: ${delay}ms`);
      
      await job.updateProgress(25);
      await new Promise(resolve => setTimeout(resolve, delay / 2)); // First half
      
      const result = await raydiumQuote(tokenPair, inputAmount);
      await job.updateProgress(75);
      
      await new Promise(resolve => setTimeout(resolve, delay / 2)); // Second half
      await job.updateProgress(100);
      
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
      console.log(`Raydium ${operation} delay: ${delay}ms`);
      
      await job.updateProgress(25);
      await new Promise(resolve => setTimeout(resolve, delay / 2)); // First half
      
      const result = await raydiumSwap(tokenPair, inputAmount, wallet);
      await job.updateProgress(75);
      
      await new Promise(resolve => setTimeout(resolve, delay / 2)); // Second half
      await job.updateProgress(100);
      
      return result;
    } else {
      throw new Error(`Unknown operation: ${operation}`);
    }
  } catch (error) {
    console.error(`Raydium worker error for ${operation}:`, error.message);
    throw error;
  }
}, { connection });

// Meteora worker
const meteoraWorker = new Worker('meteora-dex', async job => {
  const { operation, tokenPair, inputAmount, wallet, orderId } = job.data;
  
  console.log(`Meteora worker processing ${operation} for ${tokenPair.base}/${tokenPair.quote}`);
  
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
      console.log(`Meteora ${operation} delay: ${delay}ms`);
      
      await job.updateProgress(25);
      await new Promise(resolve => setTimeout(resolve, delay / 2)); // First half
      
      const result = await meteoraQuote(tokenPair, inputAmount);
      await job.updateProgress(75);
      
      await new Promise(resolve => setTimeout(resolve, delay / 2)); // Second half
      await job.updateProgress(100);
      
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
      console.log(`Meteora ${operation} delay: ${delay}ms`);
      
      await job.updateProgress(25);
      await new Promise(resolve => setTimeout(resolve, delay / 2)); // First half
      
      const result = await meteoraSwap(tokenPair, inputAmount, wallet);
      await job.updateProgress(75);
      
      await new Promise(resolve => setTimeout(resolve, delay / 2)); // Second half
      await job.updateProgress(100);
      
      return result;
    } else {
      throw new Error(`Unknown operation: ${operation}`);
    }
  } catch (error) {
    console.error(`Meteora worker error for ${operation}:`, error.message);
    throw error;
  }
}, { connection });

// Orca worker
const orcaWorker = new Worker('orca-dex', async job => {
  const { operation, tokenPair, inputAmount, wallet, orderId } = job.data;
  
  console.log(`Orca worker processing ${operation} for ${tokenPair.base}/${tokenPair.quote}`);
  
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
      console.log(`Orca ${operation} delay: ${delay}ms`);
      
      await job.updateProgress(25);
      await new Promise(resolve => setTimeout(resolve, delay / 2)); // First half
      
      const result = await orcaQuote(tokenPair, inputAmount);
      await job.updateProgress(75);
      
      await new Promise(resolve => setTimeout(resolve, delay / 2)); // Second half
      await job.updateProgress(100);
      
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
      console.log(`Orca ${operation} delay: ${delay}ms`);
      
      await job.updateProgress(25);
      await new Promise(resolve => setTimeout(resolve, delay / 2)); // First half
      
      const result = await orcaSwap(tokenPair, inputAmount, wallet);
      await job.updateProgress(75);
      
      await new Promise(resolve => setTimeout(resolve, delay / 2)); // Second half
      await job.updateProgress(100);
      
      return result;
    } else {
      throw new Error(`Unknown operation: ${operation}`);
    }
  } catch (error) {
    console.error(`Orca worker error for ${operation}:`, error.message);
    throw error;
  }
}, { connection });

// Jupiter worker
const jupiterWorker = new Worker('jupiter-dex', async job => {
  const { operation, tokenPair, inputAmount, wallet, orderId } = job.data;
  
  console.log(`Jupiter worker processing ${operation} for ${tokenPair.base}/${tokenPair.quote}`);
  
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
      console.log(`Jupiter ${operation} delay: ${delay}ms`);
      
      await job.updateProgress(25);
      await new Promise(resolve => setTimeout(resolve, delay / 2)); // First half
      
      const result = await jupiterQuote(tokenPair, inputAmount);
      await job.updateProgress(75);
      
      await new Promise(resolve => setTimeout(resolve, delay / 2)); // Second half
      await job.updateProgress(100);
      
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
      console.log(`Jupiter ${operation} delay: ${delay}ms`);
      
      await job.updateProgress(25);
      await new Promise(resolve => setTimeout(resolve, delay / 2)); // First half
      
      const result = await jupiterSwap(tokenPair, inputAmount, wallet);
      await job.updateProgress(75);
      
      await new Promise(resolve => setTimeout(resolve, delay / 2)); // Second half
      await job.updateProgress(100);
      
      return result;
    } else {
      throw new Error(`Unknown operation: ${operation}`);
    }
  } catch (error) {
    console.error(`Jupiter worker error for ${operation}:`, error.message);
    throw error;
  }
}, { connection });

// Add event listeners for all workers
addWorkerEventListeners(raydiumWorker, 'Raydium');
addWorkerEventListeners(meteoraWorker, 'Meteora');
addWorkerEventListeners(orcaWorker, 'Orca');
addWorkerEventListeners(jupiterWorker, 'Jupiter');

console.log('🚀 All DEX workers are ready and listening for jobs...');

module.exports = {
  raydiumWorker,
  meteoraWorker,
  orcaWorker,
  jupiterWorker,
  emitStatusUpdate // Export for server to use
};
