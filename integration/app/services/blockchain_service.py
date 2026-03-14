"""
Web3.py client for owner-only smart contract calls.
The Integration Service acts as the 'owner' (admin) wallet.
"""
import json
import os
from typing import Optional
from web3 import Web3
from web3.middleware import geth_poa_middleware

from app.config import settings

# Minimal ABI — only the owner-callable functions we need
ESCROW_ABI = [
    {
        "type": "function",
        "name": "setClientReview",
        "inputs": [{"name": "projectId", "type": "uint256"}],
        "outputs": [],
        "stateMutability": "nonpayable",
    },
    {
        "type": "function",
        "name": "raiseDispute",
        "inputs": [
            {"name": "projectId", "type": "uint256"},
            {"name": "disputeId", "type": "string"},
        ],
        "outputs": [],
        "stateMutability": "nonpayable",
    },
    {
        "type": "function",
        "name": "resolveDisputeForWorker",
        "inputs": [{"name": "projectId", "type": "uint256"}],
        "outputs": [],
        "stateMutability": "nonpayable",
    },
    {
        "type": "function",
        "name": "resolveDisputeForClient",
        "inputs": [{"name": "projectId", "type": "uint256"}],
        "outputs": [],
        "stateMutability": "nonpayable",
    },
    {
        "type": "function",
        "name": "getProject",
        "inputs": [{"name": "projectId", "type": "uint256"}],
        "outputs": [
            {"name": "client", "type": "address"},
            {"name": "worker", "type": "address"},
            {"name": "amount", "type": "uint256"},
            {"name": "isCompleted", "type": "bool"},
            {"name": "status", "type": "uint8"},
            {"name": "revisionCount", "type": "uint8"},
            {"name": "revisionPaid", "type": "uint256"},
        ],
        "stateMutability": "view",
    },
]

STATUS_MAP = {
    0: "active",
    1: "client_review",
    2: "completed",
    3: "disputed",
    4: "refunded",
}


class BlockchainService:
    def __init__(self):
        self.w3 = Web3(Web3.HTTPProvider(settings.BLOCKCHAIN_RPC_URL))
        # POA middleware for Anvil/Hardhat
        self.w3.middleware_onion.inject(geth_poa_middleware, layer=0)
        self.admin_key = settings.ADMIN_PRIVATE_KEY
        self.admin_account = (
            self.w3.eth.account.from_key(self.admin_key) if self.admin_key else None
        )
        escrow_addr = settings.ESCROW_CONTRACT_ADDRESS
        self.contract = None
        if escrow_addr:
            self.contract = self.w3.eth.contract(
                address=Web3.to_checksum_address(escrow_addr),
                abi=ESCROW_ABI,
            )

    def _send_tx(self, fn) -> Optional[str]:
        """Build, sign and send a transaction. Returns tx hash or None on failure."""
        if not self.contract or not self.admin_account:
            return None
        try:
            tx = fn.build_transaction({
                "from": self.admin_account.address,
                "nonce": self.w3.eth.get_transaction_count(self.admin_account.address),
                "gas": 200_000,
                "gasPrice": self.w3.eth.gas_price,
            })
            signed = self.w3.eth.account.sign_transaction(tx, self.admin_key)
            tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
            self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=30)
            return tx_hash.hex()
        except Exception as e:
            print(f"[blockchain_service] TX failed: {e}")
            return None

    def set_client_review(self, blockchain_project_id: int) -> Optional[str]:
        fn = self.contract.functions.setClientReview(blockchain_project_id)
        return self._send_tx(fn)

    def raise_dispute(self, blockchain_project_id: int, dispute_id: str) -> Optional[str]:
        fn = self.contract.functions.raiseDispute(blockchain_project_id, dispute_id)
        return self._send_tx(fn)

    def resolve_dispute_for_worker(self, blockchain_project_id: int) -> Optional[str]:
        fn = self.contract.functions.resolveDisputeForWorker(blockchain_project_id)
        return self._send_tx(fn)

    def resolve_dispute_for_client(self, blockchain_project_id: int) -> Optional[str]:
        fn = self.contract.functions.resolveDisputeForClient(blockchain_project_id)
        return self._send_tx(fn)

    def get_project(self, blockchain_project_id: int) -> Optional[dict]:
        if not self.contract:
            return None
        try:
            result = self.contract.functions.getProject(blockchain_project_id).call()
            return {
                "client": result[0],
                "worker": result[1],
                "amount_wei": result[2],
                "is_completed": result[3],
                "status": STATUS_MAP.get(result[4], "unknown"),
                "revision_count": result[5],
                "revision_paid_wei": result[6],
            }
        except Exception as e:
            print(f"[blockchain_service] getProject failed: {e}")
            return None
