# Web3 Cross-Border Freelance Platform

A full-stack prototype integrating a local EVM blockchain (Foundry/Anvil), a Next.js App Router frontend, and Razorpay for seamless Fiat-to-Stablecoin cross-border payments.

## Prerequisites
- Node.js (v18+)
- Foundry (`foundryup`)
- MetaMask or any Web3 Wallet Extension

## Installation
1. Clone the repository and navigate to the project directory.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Install Foundry dependencies:
   ```bash
   cd contracts && forge install openzeppelin/openzeppelin-contracts --no-git
   ```

## Execution Guide

### 1. Start the Local Blockchain (Anvil)
Open a terminal and run:
```bash
anvil
```
This will start a local node at `http://127.0.0.1:8545` and provide you with 10 test accounts and private keys.

### 2. Deploy Smart Contracts
Open a **new** terminal, navigate to the `contracts` directory, and run the deployment script.

First, export the first Anvil private key:
```bash
export PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```
Then deploy:
```bash
cd contracts
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```
Note the addresses deployed for `MockUSDT` and `CrossBorderEscrow`.

### 3. Configure Environment Variables
Create a `.env.local` in the root of the project:
```env
NEXT_PUBLIC_USDT_ADDRESS="<0x_MOCK_USDT_ADDRESS>"
NEXT_PUBLIC_ESCROW_ADDRESS="<0x_CROSS_BORDER_ESCROW_ADDRESS>"
NEXT_PUBLIC_RAZORPAY_KEY_ID="rzp_test_YourKeyId"
RAZORPAY_KEY_SECRET="YourKeySecret"
ADMIN_PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" 
```
_Note: `ADMIN_PRIVATE_KEY` defaults to the first Anvil account, which is used by the backend to mint tokens upon Razorpay verification._

### 4. Run the Next.js Development Server
In the root directory:
```bash
npm run dev
```
Open `http://localhost:3000`.

### 5. Testing the Roles with MetaMask
Import the Anvil private keys into MetaMask:
- **Admin/Deployer:** `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` (Account #0)
- **Client (US):** Use Account #1
- **Worker (IN):** Use Account #2

**Workflow:**
1. Select **Client (US)** in the top right view switcher. Connect the Client account in MetaMask.
2. Click "Deposit USD". The Razorpay test modal will appear. Complete a dummy payment. The backend will instantly mint `MockUSDT` to your wallet.
3. Click "Hire Now" next to a worker. This will approve Escrow and lock the tokens in the Smart Contract.
4. Select **Worker (IN)** in the view switcher. Connect the Worker account in MetaMask.
5. In the Active Assignments tab, click "Complete & Claim" to release tokens from Escrow to your wallet.
6. Trigger the "Withdraw to INR" button to burn your MockUSDT, emitting an event that triggers the simulated Razorpay Payout (1 Token = ₹83).
7. Select **Admin** to see a live explorer of all blockchain events and the system's global liquidity.
