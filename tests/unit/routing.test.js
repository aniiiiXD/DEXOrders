// Sample unit tests for routing logic
const { DEXRoutingHub } = require('../../hub');

describe('DEX Routing Hub', () => {
    let routingHub;
    
    beforeEach(() => {
        routingHub = new DEXRoutingHub();
    });
    
    test('should validate quotes correctly', () => {
        const validQuotes = [
            { provider: 'Raydium', outputAmount: 100, fee: 0.25 },
            { provider: 'Orca', outputAmount: 101, fee: 0.30 },
            { provider: 'Jupiter', outputAmount: 99, fee: 0.20 },
            { provider: 'Meteora', outputAmount: 102, fee: 0.35 }
        ];
        
        const validation = routingHub.validateQuotes(validQuotes);
        expect(validation.valid).toBe(true);
    });
    
    test('should select best route by price', () => {
        const quotes = [
            { provider: 'Raydium', outputAmount: 100, fee: 0.25 },
            { provider: 'Orca', outputAmount: 105, fee: 0.30 },
            { provider: 'Jupiter', outputAmount: 99, fee: 0.20 }
        ];
        
        const bestRoute = routingHub.selectBestRoute(quotes, 'BEST_PRICE');
        expect(bestRoute.provider).toBe('Orca');
        expect(bestRoute.outputAmount).toBe(105);
    });
});
