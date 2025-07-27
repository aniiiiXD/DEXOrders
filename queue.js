const { Queue } = require('bullmq');
const IORedis = require('ioredis');
const { inspect } = require('util');

const connection = new IORedis("redis://localhost:6379"); 

// Create separate queues for different DEX operations
const raydiumQueue = new Queue('raydium-dex', { connection });
const meteoraQueue = new Queue('meteora-dex', { connection });
const orcaQueue = new Queue('orca-dex', { connection });
const jupiterQueue = new Queue('jupiter-dex', { connection });

// Generic event listener function
function addQueueEventListeners(queue, dexName) {
  queue.on('active', job => {
    console.log(`${dexName} job ${job.id} started for operation: ${job.data.operation}`);
  });

  queue.on('completed', (job, result) => {
    console.log(`${dexName} job ${job.id} completed for operation: ${job.data.operation}`);
    console.log('Result:', inspect(result, { depth: null, colors: true }));
  });

  queue.on('failed', (job, err) => {
    console.error(`${dexName} job ${job.id} failed for operation: ${job.data.operation}`);
    console.error('Error:', err.message);
    console.error('Stack:', err.stack);
  });

  queue.on('stalled', job => {
    console.warn(`${dexName} job ${job.id} is stalled for operation: ${job.data.operation}`);
  });
}

// Add event listeners for all DEX queues
addQueueEventListeners(raydiumQueue, 'RAYDIUM');
addQueueEventListeners(meteoraQueue, 'METEORA');
addQueueEventListeners(orcaQueue, 'ORCA');
addQueueEventListeners(jupiterQueue, 'JUPITER');

/**
 * Add a job to get quote from a specific DEX
 * @param {string} dexProvider - DEX provider name (RAYDIUM, METEORA, ORCA, JUPITER)
 * @param {object} tokenPair - Token pair {base: 'SOL', quote: 'USDC'}
 * @param {number} inputAmount - Amount to swap
 * @param {string} orderId - Order ID for tracking (optional for standalone quotes)
 */
async function addQuoteJob(dexProvider, tokenPair, inputAmount, orderId = null) {
  try {
    const queueMap = {
      'RAYDIUM': raydiumQueue,
      'METEORA': meteoraQueue,
      'ORCA': orcaQueue,
      'JUPITER': jupiterQueue
    };

    const queue = queueMap[dexProvider];
    if (!queue) {
      throw new Error(`Unknown DEX provider: ${dexProvider}`);
    }

    console.log(`Adding quote job for ${dexProvider}: ${tokenPair.base}/${tokenPair.quote}${orderId ? ` (Order: ${orderId})` : ''}`);
    const job = await queue.add('get-quote', {
      operation: 'quote',
      dexProvider,
      tokenPair,
      inputAmount,
      orderId  // Add orderId to job data
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 10,
      removeOnFail: 5
    });

    console.log(`${dexProvider} quote job ${job.id} added successfully`);
    return job;
  } catch (error) {
    console.error(`Failed to add quote job for ${dexProvider}:`, error.message);
    throw error;
  }
}

/**
 * Add a job to perform swap on a specific DEX
 * @param {string} dexProvider - DEX provider name (Raydium, Meteora, Orca, Jupiter)
 * @param {object} tokenPair - Token pair {base: 'SOL', quote: 'USDC'}
 * @param {number} inputAmount - Amount to swap
 * @param {object} wallet - Wallet object with balances
 * @param {string} orderId - Order ID for tracking
 */
async function addSwapJob(dexProvider, tokenPair, inputAmount, wallet, orderId) {
  try {
    const queueMap = {
      'Raydium': raydiumQueue,
      'Meteora': meteoraQueue,
      'Orca': orcaQueue,
      'Jupiter': jupiterQueue
    };

    const queue = queueMap[dexProvider];
    if (!queue) {
      throw new Error(`Unknown DEX provider: ${dexProvider}`);
    }

    console.log(`Adding swap job for ${dexProvider}: ${inputAmount} ${tokenPair.base} -> ${tokenPair.quote} (Order: ${orderId})`);
    const job = await queue.add('swap', {  // Changed from 'perform-swap' to 'swap'
      operation: 'swap',
      dexProvider,
      tokenPair,
      inputAmount,
      wallet,
      orderId  // Add orderId to job data
    }, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 10000 },
      removeOnComplete: 10,
      removeOnFail: 10
    });

    console.log(`${dexProvider} swap job ${job.id} added successfully`);
    return job;
  } catch (error) {
    console.error(`Failed to add swap job for ${dexProvider}:`, error.message);
    throw error;
  }
}

/**
 * Add jobs to get quotes from all DEXs for comparison
 * @param {object} tokenPair - Token pair {base: 'SOL', quote: 'USDC'}
 * @param {number} inputAmount - Amount to swap
 * @param {string} orderId - Order ID for tracking (optional)
 */
async function addCompareQuotesJob(tokenPair, inputAmount, orderId = null) {
  try {
    console.log(`Adding compare quotes job for ${inputAmount} ${tokenPair.base} -> ${tokenPair.quote}${orderId ? ` (Order: ${orderId})` : ''}`);
    
    const jobs = await Promise.all([
      addQuoteJob('RAYDIUM', tokenPair, inputAmount, orderId),
      addQuoteJob('METEORA', tokenPair, inputAmount, orderId),
      addQuoteJob('ORCA', tokenPair, inputAmount, orderId),
      addQuoteJob('JUPITER', tokenPair, inputAmount, orderId)
    ]);

    console.log(`All DEX quote jobs added successfully. Job IDs: ${jobs.map(j => j.id).join(', ')}`);
    return jobs;
  } catch (error) {
    console.error(`Failed to add compare quotes jobs:`, error.message);
    throw error;
  }
}

module.exports = { 
  addQuoteJob, 
  addSwapJob, 
  addCompareQuotesJob,
  raydiumQueue,
  meteoraQueue,
  orcaQueue,
  jupiterQueue
};
