export function parseSwapError(err) {
  const msg = (err?.message || String(err) || '').toLowerCase();

  if (msg.includes('insufficient_output_amount') || msg.includes('insufficient output amount')) {
    return {
      reason: 'Slippage too low — the price moved before the trade completed',
      suggestion: 'Increase slippage to 15–25% in ⚙️ Settings and try again.',
    };
  }
  if (msg.includes('transfer_from_failed') || msg.includes('transferfrom') || msg.includes('transfer failed')) {
    return {
      reason: 'Token transfer rejected — possible honeypot or approval issue',
      suggestion: 'Scan the token first with 🔍 Scan Token. It may have trading restrictions.',
    };
  }
  if (msg.includes('insufficient funds') || msg.includes('insufficient balance')) {
    return {
      reason: 'Insufficient BNB to cover the swap and gas',
      suggestion: 'Deposit more BNB to your wallet via 📥 Receive.',
    };
  }
  if (msg.includes('gas required exceeds allowance') || msg.includes('gas limit')) {
    return {
      reason: 'Gas limit exceeded',
      suggestion: 'Try a higher gas setting (Fast or Turbo) in ⚙️ Settings.',
    };
  }
  if (msg.includes('expired') || msg.includes('deadline')) {
    return {
      reason: 'Transaction expired — network was too slow',
      suggestion: 'Switch to a faster gas mode (Turbo) in ⚙️ Settings and retry.',
    };
  }
  if (msg.includes('nonce')) {
    return {
      reason: 'Transaction nonce conflict',
      suggestion: 'Wait a moment and try again.',
    };
  }
  if (msg.includes('replacement fee too low') || msg.includes('underpriced') || msg.includes('fee too low')) {
    return {
      reason: 'Gas price too low for current network conditions',
      suggestion: 'Increase gas to Fast or Turbo in ⚙️ Settings.',
    };
  }
  if (msg.includes('insufficient_a_amount') || msg.includes('insufficient_b_amount') || msg.includes('insufficient liquidity')) {
    return {
      reason: 'Insufficient liquidity on this trading pair',
      suggestion: 'Try a smaller amount, or wait for more liquidity.',
    };
  }
  if (msg.includes('execution reverted')) {
    return {
      reason: 'Transaction rejected by the token contract',
      suggestion: 'The token may have high tax, trading restrictions, or be a honeypot. Use 🔍 Scan Token to verify.',
    };
  }
  if (msg.includes('blacklist') || msg.includes('not allowed') || msg.includes('forbidden')) {
    return {
      reason: 'Your wallet is blacklisted by this token',
      suggestion: 'This token has blocked your wallet address from trading.',
    };
  }
  if (msg.includes('timeout') || msg.includes('etimedout') || msg.includes('econnrefused') || msg.includes('network')) {
    return {
      reason: 'Network connection issue',
      suggestion: 'The RPC may be temporarily unavailable. Try again in a moment.',
    };
  }

  return {
    reason: 'Unexpected error during transaction',
    suggestion: 'Try again. If it persists, check your slippage/gas settings or use 🔍 Scan Token.',
  };
}

export function buyFailMsg(ca, err) {
  const { reason, suggestion } = parseSwapError(err);
  return (
    `🦋 <b>Bubble Flap — Buy Failed</b>\n\n` +
    `Token: <code>${ca}</code>\n\n` +
    `⚠️ <b>Reason:</b> ${reason}\n` +
    `💡 <b>Fix:</b> ${suggestion}`
  );
}

export function sellFailMsg(ca, err) {
  const { reason, suggestion } = parseSwapError(err);
  return (
    `🦋 <b>Bubble Flap — Sell Failed</b>\n\n` +
    `Token: <code>${ca}</code>\n\n` +
    `⚠️ <b>Reason:</b> ${reason}\n` +
    `💡 <b>Fix:</b> ${suggestion}`
  );
}

export function snipeFailMsg(ca, err) {
  const { reason, suggestion } = parseSwapError(err);
  return (
    `🦋 <b>Bubble Flap — Snipe Failed</b>\n\n` +
    `Token: <code>${ca}</code>\n\n` +
    `⚠️ <b>Reason:</b> ${reason}\n` +
    `💡 <b>Fix:</b> ${suggestion}`
  );
}

export function limitFailMsg(orderId, ca, err) {
  const { reason, suggestion } = parseSwapError(err);
  return (
    `🦋 <b>Bubble Flap — Limit Order #${orderId} Failed</b>\n\n` +
    `Token: <code>${ca}</code>\n\n` +
    `⚠️ <b>Reason:</b> ${reason}\n` +
    `💡 <b>Fix:</b> ${suggestion}`
  );
}

export function buySuccessMsg(ca, bnbSpent, txHash, router) {
  return (
    `🦋 <b>Bubble Flap — Buy Successful! ✅</b>\n\n` +
    `Token: <code>${ca}</code>\n` +
    `Spent: <b>${Number(bnbSpent).toFixed(4)} BNB</b>\n` +
    `Router: ${router}\n\n` +
    `<a href="https://bscscan.com/tx/${txHash}">View on BscScan</a>`
  );
}

export function sellSuccessMsg(ca, symbol, percent, receivedBnb, txHash, router) {
  const bnbStr = Number(receivedBnb) > 0 ? `${Number(receivedBnb).toFixed(4)} BNB` : 'check BscScan';
  return (
    `🦋 <b>Bubble Flap — Sell Successful! ✅</b>\n\n` +
    `Token: <code>${ca}</code>\n` +
    `Sold: <b>${percent}% of ${symbol}</b>\n` +
    `Received: <b>~${bnbStr}</b>\n` +
    `Router: ${router}\n\n` +
    `<a href="https://bscscan.com/tx/${txHash}">View on BscScan</a>`
  );
}

export function snipeSuccessMsg(ca, bnbSpent, txHash, router) {
  return (
    `🦋 <b>Bubble Flap — Snipe Executed! 🎯</b>\n\n` +
    `Token: <code>${ca}</code>\n` +
    `Spent: <b>${Number(bnbSpent).toFixed(4)} BNB</b>\n` +
    `Router: ${router}\n\n` +
    `<a href="https://bscscan.com/tx/${txHash}">View on BscScan</a>`
  );
}

export function limitSuccessMsg(orderId, side, ca, price, amount, txHash, router) {
  const verb = side === 'buy' ? '🟢 Bought' : '🔴 Sold';
  return (
    `🦋 <b>Bubble Flap — Limit Order Executed! ⚡</b>\n\n` +
    `Order #${orderId} · ${verb}\n` +
    `Token: <code>${ca}</code>\n` +
    `Trigger: $${Number(price).toFixed(8)}\n` +
    `Amount: ${Number(amount).toFixed(4)} BNB\n` +
    `Router: ${router}\n\n` +
    `<a href="https://bscscan.com/tx/${txHash}">View on BscScan</a>`
  );
}
