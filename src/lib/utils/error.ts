export function parseError(err: any): string {
  if (!err) return "An unknown error occurred.";
  
  const msg = err?.shortMessage || err?.message || err.toString();
  
  // Handle Common User wallet rejections
  if (msg.includes("User rejected the request") || msg.includes("User denied transaction")) {
    return "Transaction was cancelled in your wallet.";
  }
  
  // Handle Gas / Balance limits
  if (msg.includes("insufficient funds for gas") || msg.includes("exceeds the balance")) {
    return "Insufficient ETH to cover network gas fees.";
  }
  
  // Handle Custom Contract Reverts from our Code
  if (msg.includes("ERC20: insufficient allowance")) {
    return "Token allowance too low. Please approve tokens first.";
  }
  if (msg.includes("ERC20: transfer amount exceeds balance")) {
    return "You do not have enough MockUSDT balance.";
  }
  if (msg.includes("Transfer failed")) {
    return "Token transfer failed inside the smart contract.";
  }
  if (msg.includes("Already completed")) {
    return "This project has already been marked as completed.";
  }
  if (msg.includes("Not authorized")) {
    return "You must be the assigned worker or client to perform this action.";
  }
  if (msg.includes("Payment already processed")) {
    return "This Razorpay deposit has already been claimed.";
  }
  
  // Try mapping the raw viem revert message explicitly
  const revertMatch = msg.match(/reverted with the following reason:\n(.*)/);
  if (revertMatch && revertMatch[1]) {
    return revertMatch[1].trim();
  }

  // Generic fallback for giant unreadable Wagmi stack traces
  if (msg.length > 80) {
    return "Blockchain transaction failed. Please check your inputs.";
  }

  return msg;
}
