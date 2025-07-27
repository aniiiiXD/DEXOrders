// ========== CORE TYPES AND CONSTANTS ==========
const DEX_PROVIDERS = {
    RAYDIUM: 'Raydium',
    METEORA: 'Meteora', 
    ORCA: 'Orca',
    JUPITER: 'Jupiter'
  };
  
  const TOKEN_ADDRESSES = {
    SOL: 'So11111111111111111111111111111111111111112',
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'
  };
  
  // ========== UTILITY FUNCTIONS ==========
  function simulateDelay(min = 2000, max = 5000) {
    const delay = Math.random() * (max - min) + min;
    console.log(`Simulating delay: ${delay}ms`);
    return new Promise(resolve => setTimeout(resolve, delay));
  }
  
  function getBasePrice(tokenPair) {
    const basePrices = {
      'SOL/USDC': 98.5,
      'SOL/USDT': 98.2,
      'BONK/USDC': 0.000025,
      'USDC/USDT': 0.9995
    };
    const pairKey = `${tokenPair.base}/${tokenPair.quote}`;
    return basePrices[pairKey] || 100;
  }
  
  function validateWallet(wallet, requiredToken, requiredAmount) {
    if (!wallet || !wallet.balances) {
      return { valid: false, error: 'Invalid wallet' };
    }
    
    const balance = wallet.balances[requiredToken] || 0;
    if (balance < requiredAmount) {
      return { 
        valid: false, 
        error: `Insufficient ${requiredToken} balance. Required: ${requiredAmount}, Available: ${balance}` 
      };
    }
    
    return { valid: true };
  }
  
  // ========== RAYDIUM DEX ==========
  async function raydiumQuote(tokenPair, inputAmount) {
    await simulateDelay(2000, 2500);
    
    const basePrice = getBasePrice(tokenPair);
    const variation = (Math.random() - 0.5) * 0.015; // ±1.5%
    const adjustedPrice = basePrice * (1 + variation);
    const feeRate = 0.0025;
    
    const outputAmount = inputAmount * adjustedPrice * (1 - feeRate);
    const priceImpact = Math.random() * 0.008;
    
    return {
      provider: DEX_PROVIDERS.RAYDIUM,
      inputToken: tokenPair.base,
      outputToken: tokenPair.quote,
      inputAmount,
      outputAmount: Number(outputAmount.toFixed(6)),
      price: Number(adjustedPrice.toFixed(4)),
      priceImpact: Number((priceImpact * 100).toFixed(3)),
      fee: feeRate * 100,
      liquidity: Math.random() * 15000000 + 5000000,
      poolType: 'AMM',
      timestamp: new Date().toISOString()
    };
  }
  
  async function raydiumSwap(tokenPair, inputAmount, wallet) {
    // Validate wallet
    const walletCheck = validateWallet(wallet, tokenPair.base, inputAmount);
    if (!walletCheck.valid) {
      return { success: false, error: walletCheck.error };
    }
    
    // Get quote first
    const quote = await raydiumQuote(tokenPair, inputAmount);
    
    // Simulate swap execution
    await simulateDelay(3000, 4000);
    
    // Check for slippage failure (5% chance)
    if (Math.random() < 0.05) {
      return { 
        success: false, 
        error: 'Transaction failed due to slippage',
        quote 
      };
    }
    
    // Update wallet balances
    wallet.balances[tokenPair.base] -= inputAmount;
    wallet.balances[tokenPair.quote] = (wallet.balances[tokenPair.quote] || 0) + quote.outputAmount;
    
    const txHash = 'raydium_' + Math.random().toString(36).substring(2, 15);
    
    return {
      success: true,
      transactionHash: txHash,
      inputAmount,
      outputAmount: quote.outputAmount,
      provider: DEX_PROVIDERS.RAYDIUM,
      timestamp: new Date().toISOString(),
      updatedWallet: { ...wallet }
    };
  }
  
  // ========== METEORA DEX ==========
  async function meteoraQuote(tokenPair, inputAmount) {
    await simulateDelay(2200, 2800);
    
    const basePrice = getBasePrice(tokenPair);
    const variation = (Math.random() - 0.5) * 0.012; // ±1.2%
    const adjustedPrice = basePrice * (1 + variation + 0.008); // Slightly better rates
    const feeRate = 0.001;
    
    const outputAmount = inputAmount * adjustedPrice * (1 - feeRate);
    const priceImpact = Math.random() * 0.005;
    
    return {
      provider: DEX_PROVIDERS.METEORA,
      inputToken: tokenPair.base,
      outputToken: tokenPair.quote,
      inputAmount,
      outputAmount: Number(outputAmount.toFixed(6)),
      price: Number(adjustedPrice.toFixed(4)),
      priceImpact: Number((priceImpact * 100).toFixed(3)),
      fee: feeRate * 100,
      liquidity: Math.random() * 12000000 + 3000000,
      poolType: 'DLMM',
      bins: Math.floor(Math.random() * 50) + 20,
      timestamp: new Date().toISOString()
    };
  }
  
  async function meteoraSwap(tokenPair, inputAmount, wallet) {
    const walletCheck = validateWallet(wallet, tokenPair.base, inputAmount);
    if (!walletCheck.valid) {
      return { success: false, error: walletCheck.error };
    }
    
    const quote = await meteoraQuote(tokenPair, inputAmount);
    await simulateDelay(3200, 4200);
    
    if (Math.random() < 0.03) { // 3% failure rate
      return { 
        success: false, 
        error: 'DLMM bin allocation failed',
        quote 
      };
    }
    
    wallet.balances[tokenPair.base] -= inputAmount;
    wallet.balances[tokenPair.quote] = (wallet.balances[tokenPair.quote] || 0) + quote.outputAmount;
    
    const txHash = 'meteora_' + Math.random().toString(36).substring(2, 15);
    
    return {
      success: true,
      transactionHash: txHash,
      inputAmount,
      outputAmount: quote.outputAmount,
      provider: DEX_PROVIDERS.METEORA,
      timestamp: new Date().toISOString(),
      updatedWallet: { ...wallet }
    };
  }
  
  // ========== ORCA DEX ==========
  async function orcaQuote(tokenPair, inputAmount) {
    await simulateDelay(1800, 2400);
    
    const basePrice = getBasePrice(tokenPair);
    const variation = (Math.random() - 0.5) * 0.018; // ±1.8%
    const adjustedPrice = basePrice * (1 + variation - 0.003); // Slightly lower rates
    const feeRate = 0.003;
    
    const outputAmount = inputAmount * adjustedPrice * (1 - feeRate);
    const priceImpact = Math.random() * 0.006;
    
    return {
      provider: DEX_PROVIDERS.ORCA,
      inputToken: tokenPair.base,
      outputToken: tokenPair.quote,
      inputAmount,
      outputAmount: Number(outputAmount.toFixed(6)),
      price: Number(adjustedPrice.toFixed(4)),
      priceImpact: Number((priceImpact * 100).toFixed(3)),
      fee: feeRate * 100,
      liquidity: Math.random() * 18000000 + 8000000,
      poolType: 'Whirlpool',
      tickSpacing: Math.random() > 0.5 ? 64 : 128,
      timestamp: new Date().toISOString()
    };
  }
  
  async function orcaSwap(tokenPair, inputAmount, wallet) {
    const walletCheck = validateWallet(wallet, tokenPair.base, inputAmount);
    if (!walletCheck.valid) {
      return { success: false, error: walletCheck.error };
    }
    
    const quote = await orcaQuote(tokenPair, inputAmount);
    await simulateDelay(2800, 3800);
    
    if (Math.random() < 0.04) { // 4% failure rate
      return { 
        success: false, 
        error: 'Whirlpool tick range exceeded',
        quote 
      };
    }
    
    wallet.balances[tokenPair.base] -= inputAmount;
    wallet.balances[tokenPair.quote] = (wallet.balances[tokenPair.quote] || 0) + quote.outputAmount;
    
    const txHash = 'orca_' + Math.random().toString(36).substring(2, 15);
    
    return {
      success: true,
      transactionHash: txHash,
      inputAmount,
      outputAmount: quote.outputAmount,
      provider: DEX_PROVIDERS.ORCA,
      timestamp: new Date().toISOString(),
      updatedWallet: { ...wallet }
    };
  }
  
  // ========== JUPITER DEX ==========
  async function jupiterQuote(tokenPair, inputAmount) {
    await simulateDelay(2500, 3200);
    
    const basePrice = getBasePrice(tokenPair);
    const variation = (Math.random() - 0.5) * 0.008; // ±0.8%
    const adjustedPrice = basePrice * (1 + variation + 0.012); // Best rates
    const feeRate = 0.002;
    
    const outputAmount = inputAmount * adjustedPrice * (1 - feeRate);
    const priceImpact = Math.random() * 0.003;
    
    // Generate route
    const possibleRoutes = [
      [tokenPair.base, tokenPair.quote],
      [tokenPair.base, 'USDC', tokenPair.quote],
      [tokenPair.base, 'SOL', tokenPair.quote]
    ];
    const route = possibleRoutes[Math.floor(Math.random() * possibleRoutes.length)];
    
    return {
      provider: DEX_PROVIDERS.JUPITER,
      inputToken: tokenPair.base,
      outputToken: tokenPair.quote,
      inputAmount,
      outputAmount: Number(outputAmount.toFixed(6)),
      price: Number(adjustedPrice.toFixed(4)),
      priceImpact: Number((priceImpact * 100).toFixed(3)),
      fee: feeRate * 100,
      route,
      liquidity: Math.random() * 25000000 + 10000000,
      poolType: 'Aggregated',
      routeSteps: route.length - 1,
      dexsUsed: ['Raydium', 'Orca', 'Meteora'].slice(0, Math.ceil(Math.random() * 3)),
      timestamp: new Date().toISOString()
    };
  }
  
  async function jupiterSwap(tokenPair, inputAmount, wallet) {
    const walletCheck = validateWallet(wallet, tokenPair.base, inputAmount);
    if (!walletCheck.valid) {
      return { success: false, error: walletCheck.error };
    }
    
    const quote = await jupiterQuote(tokenPair, inputAmount);
    await simulateDelay(3500, 4500);
    
    if (Math.random() < 0.02) { // 2% failure rate (best reliability)
      return { 
        success: false, 
        error: 'Route optimization failed',
        quote 
      };
    }
    
    wallet.balances[tokenPair.base] -= inputAmount;
    wallet.balances[tokenPair.quote] = (wallet.balances[tokenPair.quote] || 0) + quote.outputAmount;
    
    const txHash = 'jupiter_' + Math.random().toString(36).substring(2, 15);
    
    return {
      success: true,
      transactionHash: txHash,
      inputAmount,
      outputAmount: quote.outputAmount,
      provider: DEX_PROVIDERS.JUPITER,
      route: quote.route,
      timestamp: new Date().toISOString(),
      updatedWallet: { ...wallet }
    };
  }
  
  // ========== EXAMPLE USAGE ==========
  async function exampleUsage() {
    // Mock wallet
    const wallet = {
      address: 'wallet123',
      balances: {
        SOL: 10.5,
        USDC: 1000,
        BONK: 5000000
      }
    };
    
    const tokenPair = { base: 'SOL', quote: 'USDC' };
    
    try {
      // Get quotes
      console.log('Getting quotes...');
      const raydiumQ = await raydiumQuote(tokenPair, 1);
      const meteoraQ = await meteoraQuote(tokenPair, 1);
      const orcaQ = await orcaQuote(tokenPair, 1);
      const jupiterQ = await jupiterQuote(tokenPair, 1);
      
      console.log('Quotes received:', {
        raydium: raydiumQ.outputAmount,
        meteora: meteoraQ.outputAmount,
        orca: orcaQ.outputAmount,
        jupiter: jupiterQ.outputAmount
      });
      
      // Perform swap with best quote (Jupiter)
      console.log('Performing swap...');
      const swapResult = await jupiterSwap(tokenPair, 1, wallet);
      console.log('Swap result:', swapResult);
      
    } catch (error) {
      console.error('Error:', error);
    }
  }
  

// async function test(){
//     const wallet = {
//         balances: { SOL: 10, USDC: 1000 }
//       };
      
//       // Get quote
//       const quote = await jupiterQuote({base: 'SOL', quote: 'USDC'}, 1);
//       console.log(quote)
      
//       // Perform swap
//       const result = await jupiterSwap({base: 'SOL', quote: 'USDC'}, 1, wallet);
//       console.log(result.success ? 'Swap successful!' : result.error);
//       console.log("wallet" , wallet)
// }

// test();


  // Export functions
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
  