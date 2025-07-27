# DEX Trading Server README

## Overview  
This server demonstrates a multi-provider DEX routing and swap execution setup using **mocked DEX implementations** for Raydium, Meteora, Orca, and Jupiter. The core logic simulates fetching quotes and executing swaps without requiring real Solana RPC connections, wallets, or signing logic.

**⚠️ Important:**  
The DEX abstraction provided here is entirely *mocked*. There is no real blockchain interaction, no wallet signing, and no network RPC calls. This allows for easy local development, testing, and experimentation without infrastructure dependencies.

## Table of Contents  

1. [Key Features](#key-features)  
2. [Prerequisites](#prerequisites)   
3. [Getting Started](#getting-started)  
4. [Architecture & Flow](#architecture--flow)  
5. [Mock DEX Implementations](#mock-dex-implementations)  
6. [API & Usage](#api--usage)  
7. [Limitations](#limitations)  
8. [Extending & Customization](#extending--customization)  

## Key Features  

- **Multi-DEX Quote Simulation:** Generates randomized, realistic-looking quotes for 4 different DEX providers.
- **Swap Simulation:** Performs swaps by mocking wallet balance updates and swap execution delays.
- **No Blockchain Dependency:** Does not need a wallet, RPC endpoint, or transaction signing.
- **Slippage and Failure Simulation:** Randomized slippage failures and swap errors to mimic real-world scenarios.
- **Simple Wallet Balance Tracking:** Supports a mocked wallet object with balances for testing swap logic.
- **Easy to Integrate:** Exported functions allow flexible use in larger routing engines or testing pipelines.

## Prerequisites  

- **Node.js ≥ 14**  
- No blockchain connection or wallet is required  
- The entire setup is local and in-memory  

## Getting Started  

1. Clone or download the project files.  
2. Install dependencies (if any additional libraries are used).  
3. Use the exported async functions to fetch quotes and perform swaps.

## Architecture & Flow  

1. **Quote Generation:**  
   Call functions like `raydiumQuote(tokenPair, amount)` to asynchronously get a mocked quote with prices, fees, liquidity, and timestamps.

2. **Quote Comparison:**  
   Compare quotes from multiple providers to select the best route based on output amount, fees, or price impact.

3. **Swap Simulation:**  
   Call swap functions like `jupiterSwap(tokenPair, amount, wallet)` to simulate executing a swap. The functions validate wallet balances, update balances, and simulate delays and failure rates.

4. **Wallet State Updates:**  
   The mocked wallet object (plain JavaScript object) is updated in place on successful swaps.

5. **Failure Handling:**  
   Randomized failures simulate real-world conditions like slippage or routing failures.

## Mock DEX Implementations  

Each DEX provider exposes:

- **Quote function:** Returns a quote object with fields like input/output amounts, fees, price impact, liquidity, pool type, and timestamp.
- **Swap function:** Takes a mocked wallet object, validates balances, simulates execution delay and possible failure, and updates wallet balances.

### Supported DEXs:  
- Raydium (AMM)  
- Meteora (DLMM - Discrete Liquidity Market Maker)  
- Orca (Whirlpool)  
- Jupiter (Aggregated multi-route)

### Token Examples:  
- SOL (`So11111111111111111111111111111111111111112`)  
- USDC (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`)  
- USDT (`Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB`)  
- BONK (`DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263`)

## API & Usage  

### Example Wallet Object  

```js
const wallet = {
  address: 'wallet123',
  balances: {
    SOL: 10.5,
    USDC: 1000,
    BONK: 5000000
  }
};
```

### Fetching Quotes  

```js
const tokenPair = { base: 'SOL', quote: 'USDC' };

const raydiumQuoteResult = await raydiumQuote(tokenPair, 1);
const meteoraQuoteResult = await meteoraQuote(tokenPair, 1);
const orcaQuoteResult = await orcaQuote(tokenPair, 1);
const jupiterQuoteResult = await jupiterQuote(tokenPair, 1);

console.log('Quotes:', {
  raydium: raydiumQuoteResult.outputAmount,
  meteora: meteoraQuoteResult.outputAmount,
  orca: orcaQuoteResult.outputAmount,
  jupiter: jupiterQuoteResult.outputAmount
});
```

### Performing a Swap  

```js
const swapResult = await jupiterSwap(tokenPair, 1, wallet);

if (swapResult.success) {
  console.log('Swap successful! Updated wallet:', swapResult.updatedWallet);
} else {
  console.error('Swap failed:', swapResult.error);
}
```

## Limitations  

- **No real asset or token transfers.**  
- **Wallet is a mock JavaScript object; no signing or RPC calls are made.**  
- **Prices and liquidity values are randomized for demo purposes — not reflective of live markets.**  
- **Simulated random delays and failure rates only approximate real asynchronous behavior.**  
- **Intended to be used for prototyping or integration testing only.**

## Extending & Customization  

- Add real RPC interaction by replacing mock quote and swap functions with real SDK calls.  
- Extend supported tokens and pools via `TOKEN_ADDRESSES`.  
- Tune random delay and failure parameters for desired simulation fidelity.  
- Integrate with real or simulated order routing logic and frontends.

## Exported Module Summary  

```js
module.exports = {
  raydiumQuote,
  raydiumSwap,
  meteoraQuote,
  meteoraSwap,
  orcaQuote,
  orcaSwap,
  jupiterQuote,
  jupiterSwap,
  DEX_PROVIDERS,
  TOKEN_ADDRESSES,
  exampleUsage
};
```

## Example Usage Function  

```js
(async function example() {
  const wallet = {
    address: 'wallet123',
    balances: {
      SOL: 10.5,
      USDC: 1000,
      BONK: 5000000
    }
  };

  const tokenPair = { base: 'SOL', quote: 'USDC' };
  console.log('Fetching quotes...');
  const quotes = await Promise.all([
    raydiumQuote(tokenPair, 1),
    meteoraQuote(tokenPair, 1),
    orcaQuote(tokenPair, 1),
    jupiterQuote(tokenPair, 1)
  ]);

  console.table(quotes.map(q => ({
    Provider: q.provider,
    OutputAmount: q.outputAmount,
    Price: q.price,
    Fee: q.fee,
    PriceImpact: q.priceImpact + '%'
  })));

  console.log('Performing swap on Jupiter...');
  const swapResult = await jupiterSwap(tokenPair, 1, wallet);

  if (swapResult.success) {
    console.log('Swap successful! Updated wallet:', swapResult.updatedWallet);
  } else {
    console.error('Swap failed:', swapResult.error);
  }
})();
```

This mock DEX abstraction provides a lightweight testbed for building routing logic, UI prototypes, or experimenting with multi-DEX quote comparison without requiring access to live wallets or Solana nodes.