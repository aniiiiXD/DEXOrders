const { Worker } = require('bullmq');
const IORedis = require('ioredis');
const axios = require('axios');
const { getJupiterPrice } = require('./jupiter.js');
const { fetchPrices } = require('./alchemy.js');
const { inspect } = require('util');
 
const connection = new IORedis("redis://localhost:6379", {maxRetriesPerRequest: null,});
const ALCHEMY_KEY = "XBkm0hqGOvHDBI-A4g86j";

// Add worker event listeners
const addWorkerEventListeners = (worker, type) => {
  worker.on('active', job => {
    console.log(`Worker ${type} started processing job ${job.id}`);
  });

  worker.on('completed', (job, result) => {
    console.log(`${type} worker completed job ${job.id} with result:`, inspect(result, { depth: null }));
  });

  worker.on('failed', (job, err) => {
    console.error(`${type} worker failed job ${job.id}:`, err);
  });

  worker.on('error', (err) => {
    console.error(`${type} worker error:`, err);
  });

  worker.on('progress', (job, progress) => {
    console.log(`Worker ${type} job ${job.id} progress:`, progress);
  });
};

// Alchemy worker for Ethereum prices
const alchemyWorker = new Worker('alchemy-price-fetch', async job => {
  const { symbols } = job.data;
  console.log(`Alchemy worker processing symbols: ${symbols}`);
  
  try {
    if (!symbols || symbols.length === 0) {
      throw new Error('No symbols provided in job data');
    }
    
    console.log(`Fetching prices from Alchemy for symbols: ${symbols}`);
    const priceData = await fetchPrices(symbols);
    console.log(`Successfully fetched Alchemy price data for symbols: ${symbols}`);
    return priceData;
  } catch (error) {
    console.error(`Error fetching Alchemy prices for symbols:`, error.message);
    throw error;
  }
}, { connection });

// Jupiter worker for Solana prices
const jupiterWorker = new Worker('jupiter-price-fetch', async job => {
  const { id } = job.data;
  console.log(`Jupiter worker processing ID: ${id}`);
  
  try {
    console.log(`Fetching price from Jupiter for ID ${id}...`);
    const priceData = await getJupiterPrice(id);
    console.log(`Successfully fetched Jupiter price data for ID ${id}`);
    return priceData;
  } catch (error) {
    console.error(`Error fetching Jupiter price for ID ${id}:`, error.message);
    throw error;
  }
}, { connection });

// Add event listeners for both workers
addWorkerEventListeners(alchemyWorker, 'Alchemy');
addWorkerEventListeners(jupiterWorker, 'Jupiter');

// Export the workers
module.exports = {
  alchemyWorker,
  jupiterWorker
};
