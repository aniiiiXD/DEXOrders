// ========== DEX ROUTING HUB ==========

/**
 * DEX Routing Hub - determines best DEX based on quotes
 * Provides multiple routing strategies for optimal trade execution
 */
class DEXRoutingHub {
    constructor() {
      this.routingStrategies = {
        'BEST_PRICE': this.getBestPriceRoute.bind(this),
        'LOWEST_SLIPPAGE': this.getLowestSlippageRoute.bind(this),
        'HIGHEST_LIQUIDITY': this.getHighestLiquidityRoute.bind(this),
        'FASTEST_EXECUTION': this.getFastestExecutionRoute.bind(this)
      };
    }
  
    /**
     * Get best price route (highest output amount)
     * @param {Array} quotes - Array of quote objects from different DEXs
     * @returns {Object} Best quote with highest output amount
     */
    getBestPriceRoute(quotes) {
      return quotes.reduce((best, current) => 
        current.outputAmount > best.outputAmount ? current : best
      );
    }
  
    /**
     * Get lowest slippage route (lowest price impact)
     * @param {Array} quotes - Array of quote objects from different DEXs
     * @returns {Object} Quote with lowest price impact
     */
    getLowestSlippageRoute(quotes) {
      return quotes.reduce((best, current) => 
        current.priceImpact < best.priceImpact ? current : best
      );
    }
  
    /**
     * Get highest liquidity route
     * @param {Array} quotes - Array of quote objects from different DEXs
     * @returns {Object} Quote with highest liquidity
     */
    getHighestLiquidityRoute(quotes) {
      return quotes.reduce((best, current) => 
        current.liquidity > best.liquidity ? current : best
      );
    }
  
    /**
     * Get fastest execution route
     * Jupiter usually wins due to aggregation capabilities
     * @param {Array} quotes - Array of quote objects from different DEXs
     * @returns {Object} Quote from fastest DEX
     */
    getFastestExecutionRoute(quotes) {
      const executionSpeed = {
        'Jupiter': 4,   // Fastest due to aggregation
        'Meteora': 3,   // Fast with DLMM
        'Orca': 2,      // Medium speed
        'Raydium': 1    // Standard AMM speed
      };
      
      return quotes.reduce((best, current) => {
        const currentSpeed = executionSpeed[current.provider] || 0;
        const bestSpeed = executionSpeed[best.provider] || 0;
        return currentSpeed > bestSpeed ? current : best;
      });
    }
  
    /**
     * Main routing function - selects best route based on strategy
     * @param {Array} quotes - Array of quote objects from different DEXs
     * @param {string} strategy - Routing strategy to use
     * @param {Object} userPreferences - User preferences (e.g., excluded DEXs)
     * @returns {Object} Selected best route
     */
    selectBestRoute(quotes, strategy = 'BEST_PRICE', userPreferences = {}) {
      if (!quotes || quotes.length === 0) {
        throw new Error('No quotes available for routing');
      }
  
      const routingFunction = this.routingStrategies[strategy];
      if (!routingFunction) {
        throw new Error(`Unknown routing strategy: ${strategy}`);
      }
  
      let bestRoute = routingFunction(quotes);
      
      // Apply user preferences (optional)
      if (userPreferences.excludeDEXs && userPreferences.excludeDEXs.includes(bestRoute.provider)) {
        const filteredQuotes = quotes.filter(q => !userPreferences.excludeDEXs.includes(q.provider));
        if (filteredQuotes.length > 0) {
          bestRoute = routingFunction(filteredQuotes);
        }
      }
  
      // Apply minimum liquidity filter if specified
      if (userPreferences.minLiquidity && bestRoute.liquidity < userPreferences.minLiquidity) {
        const filteredQuotes = quotes.filter(q => q.liquidity >= userPreferences.minLiquidity);
        if (filteredQuotes.length > 0) {
          bestRoute = routingFunction(filteredQuotes);
        }
      }
  
      // Apply maximum slippage tolerance if specified
      if (userPreferences.maxSlippage && bestRoute.priceImpact > userPreferences.maxSlippage) {
        const filteredQuotes = quotes.filter(q => q.priceImpact <= userPreferences.maxSlippage);
        if (filteredQuotes.length > 0) {
          bestRoute = routingFunction(filteredQuotes);
        }
      }
  
      return bestRoute;
    }
  
    /**
     * Get comprehensive routing analysis for all strategies
     * @param {Array} quotes - Array of quote objects from different DEXs
     * @returns {Object} Detailed analysis of all routing options
     */
    getRoutingAnalysis(quotes) {
      if (!quotes || quotes.length === 0) return null;
  
      const strategies = Object.keys(this.routingStrategies);
      const analysis = {};
  
      // Get best route for each strategy
      strategies.forEach(strategy => {
        try {
          analysis[strategy] = this.routingStrategies[strategy](quotes);
        } catch (error) {
          analysis[strategy] = null;
        }
      });
  
      // Calculate market metrics
      const prices = quotes.map(q => q.price);
      const outputAmounts = quotes.map(q => q.outputAmount);
      const priceImpacts = quotes.map(q => q.priceImpact);
      const liquidities = quotes.map(q => q.liquidity);
  
      return {
        totalQuotes: quotes.length,
        marketMetrics: {
          priceSpread: Math.max(...prices) - Math.min(...prices),
          priceSpreadPercentage: ((Math.max(...prices) - Math.min(...prices)) / Math.min(...prices)) * 100,
          averagePrice: prices.reduce((sum, p) => sum + p, 0) / prices.length,
          bestOutputAmount: Math.max(...outputAmounts),
          worstOutputAmount: Math.min(...outputAmounts),
          averagePriceImpact: priceImpacts.reduce((sum, p) => sum + p, 0) / priceImpacts.length,
          totalLiquidity: liquidities.reduce((sum, l) => sum + l, 0)
        },
        strategies: analysis,
        recommendation: analysis.BEST_PRICE,
        timestamp: new Date().toISOString()
      };
    }
  
    /**
     * Get available routing strategies
     * @returns {Object} Available strategies with descriptions
     */
    getAvailableStrategies() {
      return {
        strategies: Object.keys(this.routingStrategies),
        default: 'BEST_PRICE',
        descriptions: {
          'BEST_PRICE': 'Selects DEX with highest output amount',
          'LOWEST_SLIPPAGE': 'Selects DEX with lowest price impact',
          'HIGHEST_LIQUIDITY': 'Selects DEX with highest liquidity',
          'FASTEST_EXECUTION': 'Selects fastest DEX for execution'
        }
      };
    }
  
    /**
     * Validate quotes before routing
     * @param {Array} quotes - Array of quote objects
     * @returns {Object} Validation result
     */
    validateQuotes(quotes) {
      const errors = [];
      const warnings = [];
  
      if (!quotes || quotes.length === 0) {
        errors.push('No quotes provided');
        return { valid: false, errors, warnings };
      }
  
      quotes.forEach((quote, index) => {
        if (!quote.provider) errors.push(`Quote ${index}: Missing provider`);
        if (!quote.outputAmount || quote.outputAmount <= 0) {
          errors.push(`Quote ${index}: Invalid output amount`);
        }
        if (quote.priceImpact > 10) {
          warnings.push(`Quote ${index}: High price impact (${quote.priceImpact}%)`);
        }
        if (quote.liquidity < 100000) {
          warnings.push(`Quote ${index}: Low liquidity ($${quote.liquidity})`);
        }
      });
  
      return {
        valid: errors.length === 0,
        errors,
        warnings
      };
    }
  
    /**
     * Compare two quotes
     * @param {Object} quoteA - First quote
     * @param {Object} quoteB - Second quote
     * @returns {Object} Comparison result
     */
    compareQuotes(quoteA, quoteB) {
      return {
        outputDifference: quoteB.outputAmount - quoteA.outputAmount,
        outputDifferencePercentage: ((quoteB.outputAmount - quoteA.outputAmount) / quoteA.outputAmount) * 100,
        priceDifference: quoteB.price - quoteA.price,
        slippageDifference: quoteB.priceImpact - quoteA.priceImpact,
        liquidityDifference: quoteB.liquidity - quoteA.liquidity,
        betterChoice: quoteB.outputAmount > quoteA.outputAmount ? quoteB.provider : quoteA.provider
      };
    }
  }
  
  module.exports = {
    DEXRoutingHub
  };
  