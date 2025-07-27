const axios = require('axios');

const TEST_DURATION_MS = 60 * 1000; // 1 minute
const CONCURRENCY = 20; // adjust as needed

let success = 0;
let failed = 0;
let total = 0;
const endpoint = 'http://localhost:3000/api/orders';

let keepRunning = true;

async function sendRequest() {
  try {
    const response = await axios.post(endpoint, { symbol: 'SOL' });
    // Count as success ONLY if we got a response at all (successful HTTP request)
    if (response && response.status === 200 && response.data && response.data.orderId) {
      success++;
    } else {
      // Response not as expected, treat as failure
      failed++;
    }
  } catch (err) {
    failed++;
  }
  total++;
}

async function main() {
  async function runner() {
    while (keepRunning) {
      await sendRequest();
    }
  }
  const runners = [];
  for (let i = 0; i < CONCURRENCY; ++i) {
    runners.push(runner());
  }
  setTimeout(() => { keepRunning = false; }, TEST_DURATION_MS);
  await Promise.all(runners);

  // Print results
  console.log('== Load Test Complete ==');
  console.log(`Tried:          ${total}`);
  console.log(`Succeeded:      ${success}`);
  console.log(`Failed:         ${failed}`);
  console.log(`Requests/min:   ${success} (successful only)`);
}

main();

