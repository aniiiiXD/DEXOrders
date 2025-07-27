const { Queue } = require('bullmq');
const IORedis = require('ioredis');
const { inspect } = require('util');

const connection = new IORedis("redis://localhost:6379");

// Create separate queues for different price sources
const alchemyQueue = new Queue('alchemy-price-fetch', { connection });
const jupiterQueue = new Queue('jupiter-price-fetch', { connection });

// Add event listeners for queue events
alchemyQueue.on('active', job => {
  console.log(`Alchemy job ${job.id} started for symbol: ${job.data.symbol}`);
});

alchemyQueue.on('completed', (job, result) => {
  console.log(`Alchemy job ${job.id} completed for symbol: ${job.data.symbol}`);
  console.log('Result:', inspect(result, { depth: null, colors: true }));
});

alchemyQueue.on('failed', (job, err) => {
  console.error(`Alchemy job ${job.id} failed for symbol: ${job.data.symbol}`);
  console.error('Error:', err.message);
  console.error('Stack:', err.stack);
});

alchemyQueue.on('stalled', job => {
  console.warn(`Alchemy job ${job.id} is stalled for symbol: ${job.data.symbol}`);
});

jupiterQueue.on('active', job => {
  console.log(`Jupiter job ${job.id} started for ID: ${job.data.id}`);
});

jupiterQueue.on('completed', (job, result) => {
  console.log(`Jupiter job ${job.id} completed for ID: ${job.data.id}`);
  console.log('Result:', inspect(result, { depth: null, colors: true }));
});

jupiterQueue.on('failed', (job, err) => {
  console.error(`Jupiter job ${job.id} failed for ID: ${job.data.id}`);
  console.error('Error:', err.message);
  console.error('Stack:', err.stack);
});

jupiterQueue.on('stalled', job => {
  console.warn(`Jupiter job ${job.id} is stalled for ID: ${job.data.id}`);
});

/**
 * Add a job to fetch price from Alchemy
 * @param {string} symbol - Token symbol (e.g., ETH, BTC)
 */
async function addAlchemyFetchJob(symbol) {
    try {
      console.log(`Adding Alchemy fetch job for symbol: ${symbol}`);
      const job = await alchemyQueue.add('fetch-price', { symbols: [symbol] }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: true
      });
      console.log(`Alchemy job ${job.id} added successfully`);
      return job;
    } catch (error) {
      console.error(`Failed to add Alchemy job for symbol ${symbol}:`, error.message);
      throw error;
    }
}  

/**
 * Add a job to fetch price from Jupiter
 * @param {string} id - Token ID (e.g., So11111111111111111111111111111111111111112)
 */
async function addJupiterFetchJob(id) {
  try {
    console.log(`Adding Jupiter fetch job for ID: ${id}`);
    const job = await jupiterQueue.add('fetch-price', { id }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: 1000 * 60 * 60 // Remove failed jobs after 1 hour
    });
    console.log(`Jupiter job ${job.id} added successfully`);
    return job;
  } catch (error) {
    console.error(`Failed to add Jupiter job for ID ${id}:`, error.message);
    throw error;
  }
}

module.exports = { addAlchemyFetchJob, addJupiterFetchJob };
