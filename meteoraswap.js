const swapAmount = new BN(0.1 * 10 ** 9);
// Swap quote
const swapYtoX = true;
const binArrays = await dlmmPool.getBinArrayForSwap(swapYtoX);

const swapQuote = await dlmmPool.swapQuote(
  swapAmount,
  swapYtoX,
  new BN(1),
  binArrays
);

// Swap
const swapTx = await dlmmPool.swap({
  inToken: dlmmPool.tokenX.publicKey,
  binArraysPubkey: swapQuote.binArraysPubkey,
  inAmount: swapAmount,
  lbPair: dlmmPool.pubkey,
  user: user.publicKey,
  minOutAmount: swapQuote.minOutAmount,
  outToken: dlmmPool.tokenY.publicKey,
});

try {
  const swapTxHash = await sendAndConfirmTransaction(connection, swapTx, [
    user,
  ]);
} catch (error) {}