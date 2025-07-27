/**
 * Jupiter API client for fetching token prices
 * 
 * Usage:
 * ```javascript
 * const { getJupiterPrice } = require('./jupiter.js');
 * 
 * // Fetch price for a single token using its address
 * getJupiterPrice('So11111111111111111111111111111111111111112') // SOL
 *   .then(price => console.log(`Price: ${price}`))
 *   .catch(error => console.error(error));
 * 
 * // Fetch price for multiple tokens
 * getJupiterPrice('So11111111111111111111111111111111111111112,Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB')
 *   .then(prices => console.log(prices))
 *   .catch(error => console.error(error));
 * ```
 */

const https = require('follow-redirects').https;
const util = require('util');

/**
 * Fetches token prices from Jupiter API
 * 
 * @param {string} ids - Comma-separated string of token addresses to fetch prices for
 * @returns {Promise<Object>} - Promise that resolves to a JSON object containing price data
 * @throws {Error} - Throws an error if the API request fails or response is invalid
 * 
 * @example
 * // Single token
 * getJupiterPrice('So11111111111111111111111111111111111111112') // SOL
 * 
 * @example
 * // Multiple tokens
 * getJupiterPrice('So11111111111111111111111111111111111111112,Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB')
 */
const getJupiterPrice = async (ids) => {
  return new Promise((resolve, reject) => {
    const options = {
      'method': 'GET',
      'hostname': 'lite-api.jup.ag',
      'path': `/price/v3?ids=${encodeURIComponent(ids)}`,
      'headers': {
        'Accept': 'application/json'
      },
      'maxRedirects': 20
    };

    const req = https.request(options, function (res) {
      let chunks = [];

      res.on("data", function (chunk) {
        chunks.push(chunk);
      });

      res.on("end", function () {
        const body = Buffer.concat(chunks).toString();
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
};

async function testJupiterAPI() {
  try {
    // Test with SOL token
    console.log('Testing SOL price...');
    const solPrice = await getJupiterPrice('So11111111111111111111111111111111111111112');
    console.log('Raw SOL response:', JSON.stringify(solPrice, null, 2));
    console.log('Parsed SOL price:', util.inspect(solPrice, { depth: null, colors: true }));

    // Test with USDC token
    console.log('\nTesting USDC price...');
    const usdcPrice = await getJupiterPrice('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    console.log('Raw USDC response:', JSON.stringify(usdcPrice, null, 2));
    console.log('Parsed USDC price:', util.inspect(usdcPrice, { depth: null, colors: true }));

    // Test with multiple tokens
    console.log('\nTesting multiple tokens (SOL + USDC)...');
    const multiplePrices = await getJupiterPrice(
      'So11111111111111111111111111111111111111112,EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
    );
    console.log('Raw multiple tokens response:', JSON.stringify(multiplePrices, null, 2));
    console.log('Parsed multiple tokens prices:', util.inspect(multiplePrices, { depth: null, colors: true }));

    // Test error handling with invalid token
    console.log('\nTesting error handling with invalid token...');
    try {
      await getJupiterPrice('INVALID_TOKEN');
    } catch (error) {
      console.log('Error test passed:', error.message);
    }

    console.log('\nAll tests completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test if this file is run directly
if (require.main === module) {
  testJupiterAPI();
}

module.exports = {
  /**
   * Exported function to fetch token prices
   * @see {getJupiterPrice}
   */
  getJupiterPrice,
  
};