// prices-fetch-script.js
/**
 * Alchemy API client for fetching token prices
 * 
 * Usage:
 * ```javascript
 * const { fetchPrices } = require('./alchemy.js');
 * 
 * // Fetch prices for multiple tokens
 * fetchPrices(['ETH', 'BTC', 'USDT'])
 *   .then(prices => console.log(prices))
 *   .catch(error => console.error(error));
 * 
 * // Fetch price for a single token
 * fetchPrices(['ETH'])
 *   .then(prices => console.log(prices))
 *   .catch(error => console.error(error));
 * ```
 */

const axios = require('axios');
const util = require('util');

// Replace with your Alchemy API key:
const apiKey = "XBkm0hqGOvHDBI-A4g86j";
const fetchURL = `https://api.g.alchemy.com/prices/v1/${apiKey}/tokens/by-symbol`;

const requestOptions = {
  method: 'GET', 
  headers: {
    'Content-Type': 'application/json',
  },
};

/**
 * Fetches token prices from Alchemy API
 * 
 * @param {string[]} symbols - Array of token symbols to fetch prices for (e.g., ['ETH', 'BTC'])
 * @returns {Promise<Object>} - Promise that resolves to a JSON object containing price data
 * @throws {Error} - Throws an error if no symbols are provided or if the API request fails
 */
const fetchPrices = async (symbols) => {
  if (!symbols || symbols.length === 0) {
    throw new Error('No symbols provided');
  }

  try {
    const response = await axios.get(fetchURL, {
      params: { symbols: symbols.join(',') },
      ...requestOptions
    });
    
    return response.data;
  } catch (error) {
    console.error('Error fetching prices:', error.message);
    throw error;
  }
};

// async function testAlchemeyAPI() {
//   try {
//     // Test with multiple tokens
//     console.log('Testing multiple tokens (ETH, BTC, USDT)...');
//     const multiplePrices = await fetchPrices(['ETH', 'BTC', 'USDT']);
//     console.log('\nMultiple tokens prices:\n', util.inspect(multiplePrices, { depth: null, colors: true }));

//     // Test with single token
//     console.log('\nSingle token price:\n');
//     const singlePrice = await fetchPrices(['SOL']);
//     console.log(util.inspect(singlePrice, { depth: null, colors: true }));

//     // Test error handling with invalid token
//     console.log('\nTesting error handling with invalid token...');
//     try {
//       await fetchPrices(['INVALID']);
//     } catch (error) {
//       console.log('Error test passed:', error.message);
//     }

//     // Test error handling with no tokens
//     console.log('\nTesting error handling with no tokens...');
//     try {
//       await fetchPrices([]);
//     } catch (error) {
//       console.log('No tokens test passed:', error.message);
//     }

//     console.log('\nAll tests completed successfully!');
//   } catch (error) {
//     console.error('Test failed:', error);
//   }
// }


//   testAlchemeyAPI();


module.exports = {
  /**
   * Exported function to fetch token prices
   * @see {fetchPrices}
   */
  fetchPrices,
}
