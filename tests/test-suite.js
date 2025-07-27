// test-suite.js - Comprehensive DEX Trading Server Test Suite (No WebSocket Testing)
const axios = require('axios');
const { performance } = require('perf_hooks');

class DEXTestSuite {
    constructor(config = {}) {
        this.serverUrl = config.serverUrl || 'http://localhost:3000';
        this.concurrentRequests = config.concurrentRequests || 25;
        this.testTimeout = config.testTimeout || 60000; // 1 minute
        
        this.testResults = {
            total: 0,
            passed: 0,
            failed: 0,
            startTime: null,
            endTime: null,
            duration: 0,
            testsPerMinute: 0,
            details: []
        };
    }

    // Utility method to log test results
    logTest(testName, passed, details = '', duration = 0) {
        this.testResults.total++;
        if (passed) {
            this.testResults.passed++;
            console.log(`✅ ${testName} - PASSED ${details ? `(${details})` : ''} [${duration.toFixed(2)}ms]`);
        } else {
            this.testResults.failed++;
            console.log(`❌ ${testName} - FAILED ${details ? `(${details})` : ''} [${duration.toFixed(2)}ms]`);
        }
        
        this.testResults.details.push({
            test: testName,
            passed,
            details,
            duration
        });
    }

    // Test server health and availability
    async testServerHealth() {
        const startTime = performance.now();
        try {
            const response = await axios.get(`${this.serverUrl}/api/health`, { timeout: 5000 });
            const duration = performance.now() - startTime;
            
            if (response.status === 200 && response.data.status === 'healthy') {
                this.logTest('Server Health Check', true, `Status: ${response.data.status}`, duration);
                return true;
            } else {
                this.logTest('Server Health Check', false, `Unexpected response: ${response.status}`, duration);
                return false;
            }
        } catch (error) {
            const duration = performance.now() - startTime;
            this.logTest('Server Health Check', false, `Error: ${error.message}`, duration);
            return false;
        }
    }

    // Test routing strategies endpoint
    async testRoutingStrategies() {
        const startTime = performance.now();
        try {
            const response = await axios.get(`${this.serverUrl}/api/routing-strategies`, { timeout: 5000 });
            const duration = performance.now() - startTime;
            
            if (response.status === 200) {
                // Accept both array and object responses
                const isValidResponse = Array.isArray(response.data) || 
                                      (typeof response.data === 'object' && response.data !== null);
                
                if (isValidResponse) {
                    const strategiesCount = Array.isArray(response.data) ? 
                                          response.data.length : 
                                          Object.keys(response.data).length;
                    this.logTest('Routing Strategies Endpoint', true, `${strategiesCount} strategies available`, duration);
                    return true;
                } else {
                    this.logTest('Routing Strategies Endpoint', false, 'Invalid response format', duration);
                    return false;
                }
            } else {
                this.logTest('Routing Strategies Endpoint', false, `HTTP ${response.status}`, duration);
                return false;
            }
        } catch (error) {
            const duration = performance.now() - startTime;
            this.logTest('Routing Strategies Endpoint', false, `Error: ${error.message}`, duration);
            return false;
        }
    }

    // Test single order creation (queue test)
    async testSingleOrder() {
        const startTime = performance.now();
        try {
            const orderPayload = {
                tokenPair: {
                    base: "SOL",
                    quote: "USDC"
                },
                inputAmount: 1.0,
                wallet: {
                    balances: {
                        SOL: 10,
                        USDC: 1000
                    }
                },
                routingStrategy: "BEST_PRICE"
            };

            const response = await axios.post(`${this.serverUrl}/api/orders`, orderPayload, { timeout: 10000 });
            const duration = performance.now() - startTime;
            
            if (response.status === 200 && response.data.orderId) {
                this.logTest('Single Order Creation', true, `OrderID: ${response.data.orderId.substring(0, 8)}...`, duration);
                return response.data.orderId;
            } else {
                this.logTest('Single Order Creation', false, 'No orderId returned', duration);
                return null;
            }
        } catch (error) {
            const duration = performance.now() - startTime;
            this.logTest('Single Order Creation', false, `Error: ${error.message}`, duration);
            return null;
        }
    }

    // Test quotes endpoint (queue test)
    async testQuotesEndpoint() {
        const startTime = performance.now();
        try {
            const quotesPayload = {
                tokenPair: {
                    base: "SOL",
                    quote: "USDC"
                },
                inputAmount: 2.5
            };

            const response = await axios.post(`${this.serverUrl}/api/quotes`, quotesPayload, { timeout: 10000 });
            const duration = performance.now() - startTime;
            
            if (response.status === 200 && response.data.orderId) {
                this.logTest('Quotes Endpoint', true, `${response.data.jobIds?.length || 0} jobs queued`, duration);
                return true;
            } else {
                this.logTest('Quotes Endpoint', false, 'Invalid response', duration);
                return false;
            }
        } catch (error) {
            const duration = performance.now() - startTime;
            this.logTest('Quotes Endpoint', false, `Error: ${error.message}`, duration);
            return false;
        }
    }

    // Test order status endpoint
    async testOrderStatus(orderId) {
        const startTime = performance.now();
        try {
            const response = await axios.get(`${this.serverUrl}/api/orders/${orderId}`, { timeout: 5000 });
            const duration = performance.now() - startTime;
            
            if (response.status === 200 && response.data.orderId === orderId) {
                this.logTest('Order Status Check', true, `Order found with status`, duration);
                return true;
            } else if (response.status === 404) {
                this.logTest('Order Status Check', false, 'Order not found', duration);
                return false;
            } else {
                this.logTest('Order Status Check', false, `Unexpected response: ${response.status}`, duration);
                return false;
            }
        } catch (error) {
            const duration = performance.now() - startTime;
            if (error.response?.status === 404) {
                this.logTest('Order Status Check', false, 'Order not found (404)', duration);
            } else {
                this.logTest('Order Status Check', false, `Error: ${error.message}`, duration);
            }
            return false;
        }
    }

    // Test concurrent order requests
    async testConcurrentOrders() {
        console.log(`\n🔄 Starting ${this.concurrentRequests} concurrent order requests...`);
        const startTime = performance.now();
        
        const orderPromises = [];
        
        // Create concurrent order requests
        for (let i = 0; i < this.concurrentRequests; i++) {
            const orderPayload = {
                tokenPair: {
                    base: "SOL",
                    quote: "USDC"
                },
                inputAmount: Math.random() * 5 + 0.5, // Random amount between 0.5 and 5.5
                wallet: {
                    balances: {
                        SOL: 20,
                        USDC: 2000
                    }
                },
                routingStrategy: ["BEST_PRICE", "FASTEST_EXECUTION", "LOWEST_SLIPPAGE", "BALANCED"][i % 4]
            };

            const orderPromise = this.createConcurrentOrder(i + 1, orderPayload);
            orderPromises.push(orderPromise);
        }

        // Wait for all orders to complete
        const orderResults = await Promise.allSettled(orderPromises);
        
        // Process results
        let successfulOrders = 0;
        let orderIds = [];
        for (const result of orderResults) {
            if (result.status === 'fulfilled' && result.value.success) {
                successfulOrders++;
                if (result.value.orderId) {
                    orderIds.push(result.value.orderId);
                }
            }
        }

        // Test a few order status checks for successful orders
        if (orderIds.length > 0) {
            console.log(`\n🔍 Testing Order Status for ${Math.min(3, orderIds.length)} orders...`);
            for (let i = 0; i < Math.min(3, orderIds.length); i++) {
                await this.testOrderStatus(orderIds[i]);
            }
        }

        const duration = performance.now() - startTime;
        const successRate = (successfulOrders / this.concurrentRequests) * 100;
        
        this.logTest('Concurrent Orders Overall', successfulOrders > 0, 
            `${successfulOrders}/${this.concurrentRequests} successful (${successRate.toFixed(1)}%)`, duration);
        
        return successfulOrders;
    }

    // Helper method for individual concurrent order
    async createConcurrentOrder(index, payload) {
        const startTime = performance.now();
        try {
            const response = await axios.post(`${this.serverUrl}/api/orders`, payload, { 
                timeout: 15000 
            });
            const duration = performance.now() - startTime;
            
            if (response.status === 200 && response.data.orderId) {
                this.logTest(`Concurrent Order #${index}`, true, 
                    `Strategy: ${payload.routingStrategy}`, duration);
                return { success: true, orderId: response.data.orderId };
            } else {
                this.logTest(`Concurrent Order #${index}`, false, 
                    'Invalid response', duration);
                return { success: false, orderId: null };
            }
        } catch (error) {
            const duration = performance.now() - startTime;
            this.logTest(`Concurrent Order #${index}`, false, 
                `Error: ${error.message}`, duration);
            return { success: false, orderId: null };
        }
    }

    // Test error handling
    async testErrorHandling() {
        console.log('\n🚨 Testing Error Handling...');
        
        // Test invalid token pair
        const startTime1 = performance.now();
        try {
            await axios.post(`${this.serverUrl}/api/orders`, {
                inputAmount: 1.0
            }, { timeout: 5000 });
            
            const duration1 = performance.now() - startTime1;
            this.logTest('Error Handling - Invalid Token Pair', false, 'Should have returned 400', duration1);
        } catch (error) {
            const duration1 = performance.now() - startTime1;
            if (error.response && error.response.status === 400) {
                this.logTest('Error Handling - Invalid Token Pair', true, 'Correctly returned 400', duration1);
            } else {
                this.logTest('Error Handling - Invalid Token Pair', false, `Unexpected error: ${error.message}`, duration1);
            }
        }

        // Test invalid routing strategy
        const startTime2 = performance.now();
        try {
            await axios.post(`${this.serverUrl}/api/orders`, {
                tokenPair: { base: "SOL", quote: "USDC" },
                inputAmount: 1.0,
                wallet: { balances: { SOL: 10 } },
                routingStrategy: "INVALID_STRATEGY"
            }, { timeout: 5000 });
            
            const duration2 = performance.now() - startTime2;
            this.logTest('Error Handling - Invalid Strategy', false, 'Should have returned 400', duration2);
        } catch (error) {
            const duration2 = performance.now() - startTime2;
            if (error.response && error.response.status === 400) {
                this.logTest('Error Handling - Invalid Strategy', true, 'Correctly returned 400', duration2);
            } else {
                this.logTest('Error Handling - Invalid Strategy', false, `Unexpected error: ${error.message}`, duration2);
            }
        }

        // Test invalid order ID lookup
        const startTime3 = performance.now();
        try {
            await axios.get(`${this.serverUrl}/api/orders/invalid-order-id`, { timeout: 5000 });
            
            const duration3 = performance.now() - startTime3;
            this.logTest('Error Handling - Invalid Order ID', false, 'Should have returned 404', duration3);
        } catch (error) {
            const duration3 = performance.now() - startTime3;
            if (error.response && error.response.status === 404) {
                this.logTest('Error Handling - Invalid Order ID', true, 'Correctly returned 404', duration3);
            } else {
                this.logTest('Error Handling - Invalid Order ID', false, `Unexpected error: ${error.message}`, duration3);
            }
        }
    }

    // Test load handling with rapid requests
    async testLoadHandling() {
        console.log('\n⚡ Testing Load Handling...');
        const startTime = performance.now();
        const rapidRequests = 10;
        const promises = [];

        for (let i = 0; i < rapidRequests; i++) {
            promises.push(axios.get(`${this.serverUrl}/api/health`, { timeout: 5000 }));
        }

        try {
            const results = await Promise.allSettled(promises);
            const successCount = results.filter(r => r.status === 'fulfilled' && r.value.status === 200).length;
            const duration = performance.now() - startTime;
            
            const successRate = (successCount / rapidRequests) * 100;
            this.logTest('Load Handling Test', successRate >= 90, 
                `${successCount}/${rapidRequests} rapid requests successful (${successRate.toFixed(1)}%)`, duration);
        } catch (error) {
            const duration = performance.now() - startTime;
            this.logTest('Load Handling Test', false, `Error: ${error.message}`, duration);
        }
    }

    // Run all tests
    async runAllTests() {
        console.log('🚀 DEX Trading Server Test Suite Starting...');
        console.log('='.repeat(50));
        
        this.testResults.startTime = Date.now();
        
        try {
            // Basic health tests
            console.log('\n📊 Basic Health Tests...');
            await this.testServerHealth();
            await this.testRoutingStrategies();
            
            // Queue tests
            console.log('\n🔄 Queue Tests...');
            await this.testQuotesEndpoint();
            const orderId = await this.testSingleOrder();
            
            // Order status test
            if (orderId) {
                console.log('\n📋 Order Management Tests...');
                await this.testOrderStatus(orderId);
            }
            
            // Load handling test
            await this.testLoadHandling();
            
            // Concurrent tests
            console.log('\n⚡ Concurrent Tests...');
            await this.testConcurrentOrders();
            
            // Error handling tests
            await this.testErrorHandling();
            
        } catch (error) {
            console.error('❌ Test suite error:', error.message);
        } finally {
            this.testResults.endTime = Date.now();
            this.testResults.duration = this.testResults.endTime - this.testResults.startTime;
            this.testResults.testsPerMinute = (this.testResults.total / (this.testResults.duration / 60000)).toFixed(2);
            
            // Print summary
            this.printSummary();
        }
    }

    // Print comprehensive test summary
    printSummary() {
        console.log('\n' + '='.repeat(50));
        console.log('📊 TEST SUMMARY');
        console.log('='.repeat(50));
        
        const passRate = ((this.testResults.passed / this.testResults.total) * 100).toFixed(1);
        const durationSeconds = (this.testResults.duration / 1000).toFixed(2);
        
        console.log(`Total Tests: ${this.testResults.total}`);
        console.log(`✅ Passed: ${this.testResults.passed}`);
        console.log(`❌ Failed: ${this.testResults.failed}`);
        console.log(`📈 Pass Rate: ${passRate}%`);
        console.log(`⏱️  Duration: ${durationSeconds}s`);
        console.log(`🚀 Tests Per Minute: ${this.testResults.testsPerMinute}`);
        
        console.log('\n📋 DETAILED RESULTS:');
        this.testResults.details.forEach(test => {
            const status = test.passed ? '✅' : '❌';
            const details = test.details ? ` - ${test.details}` : '';
            console.log(`${status} ${test.test} [${test.duration.toFixed(2)}ms]${details}`);
        });
        
        // Performance insights
        console.log('\n⚡ PERFORMANCE INSIGHTS:');
        const avgDuration = this.testResults.details.reduce((sum, test) => sum + test.duration, 0) / this.testResults.total;
        console.log(`Average Test Duration: ${avgDuration.toFixed(2)}ms`);
        
        const slowTests = this.testResults.details.filter(test => test.duration > 1000);
        if (slowTests.length > 0) {
            console.log(`⚠️  Slow Tests (>1s): ${slowTests.length}`);
            slowTests.forEach(test => {
                console.log(`   • ${test.test}: ${test.duration.toFixed(2)}ms`);
            });
        }

        // Test coverage summary
        console.log('\n🎯 TEST COVERAGE:');
        console.log('• REST API Endpoints: ✅ Covered');
        console.log('• Queue Functionality: ✅ Covered');
        console.log('• Concurrent Requests: ✅ Covered');
        console.log('• Error Handling: ✅ Covered');
        console.log('• Load Testing: ✅ Covered');
        console.log('• Order Management: ✅ Covered');
        console.log('• WebSocket Testing: ⚠️  Excluded (working with delay)');
    }
}

// Main execution
async function main() {
    const config = {
        serverUrl: process.env.SERVER_URL || 'http://localhost:3000',
        concurrentRequests: parseInt(process.env.CONCURRENT_REQUESTS) || 20,
        testTimeout: parseInt(process.env.TEST_TIMEOUT) || 60000
    };
    
    const testSuite = new DEXTestSuite(config);
    await testSuite.runAllTests();
    
    // Exit with proper code
    const exitCode = testSuite.testResults.failed > 0 ? 1 : 0;
    process.exit(exitCode);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Test suite interrupted. Cleaning up...');
    process.exit(1);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught exception:', error.message);
    process.exit(1);
});

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        console.error('❌ Test suite failed:', error.message);
        process.exit(1);
    });
}

module.exports = DEXTestSuite;
