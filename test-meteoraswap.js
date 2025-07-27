const { Connection, PublicKey, Keypair, Transaction } = require('@solana/web3.js');
const { BN } = require('bn.js');
const { DLMMPool } = require('./dlmm-pool');

// Test configuration
const SOLANA_NETWORK = 'https://api.mainnet-beta.solana.com';
const DLMM_POOL_ADDRESS = new PublicKey('YOUR_POOL_ADDRESS');

async function testMeteoraswap() {
    try {
        // Initialize connection
        const connection = new Connection(SOLANA_NETWORK);
        
        // Create test wallet
        const user = Keypair.generate();
        
        // Initialize DLMM pool
        const dlmmPool = new DLMMPool(connection, DLMM_POOL_ADDRESS);
        
        // Test swap parameters
        const swapAmount = new BN(0.1 * 10 ** 9);
        const swapYtoX = true;
        
        console.log('Getting bin arrays...');
        const binArrays = await dlmmPool.getBinArrayForSwap(swapYtoX);
        console.log('Got bin arrays:', binArrays);
        
        console.log('Getting swap quote...');
        const swapQuote = await dlmmPool.swapQuote(
            swapAmount,
            swapYtoX,
            new BN(1),
            binArrays
        );
        console.log('Swap quote:', swapQuote);
        
        console.log('Creating swap transaction...');
        const swapTx = await dlmmPool.swap({
            inToken: dlmmPool.tokenX.publicKey,
            binArraysPubkey: swapQuote.binArraysPubkey,
            inAmount: swapAmount,
            lbPair: dlmmPool.pubkey,
            user: user.publicKey,
            minOutAmount: swapQuote.minOutAmount,
            outToken: dlmmPool.tokenY.publicKey,
        });
        
        console.log('Transaction created. Testing send...');
        try {
            const swapTxHash = await connection.sendTransaction(swapTx, [user]);
            console.log('Transaction sent:', swapTxHash);
        } catch (error) {
            console.error('Transaction failed:', error);
        }
        
    } catch (error) {
        console.error('Test failed:', error);
    }
}

// Run the test
testMeteoraswap();
