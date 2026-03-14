// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {MockUSDT} from "./MockUSDT.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract CrossBorderEscrow is Ownable {
    MockUSDT public token;
    uint256 public nextProjectId;

    struct Project {
        address client;
        address worker;
        uint256 amount;
        bool isCompleted;
    }

    mapping(uint256 => Project) public projects;
    mapping(string => bool) public processedPayments;

    event TokensMinted(address indexed user, uint256 amount, string paymentId);
    event ProjectCreated(uint256 indexed projectId, address indexed client, address indexed worker, uint256 amount);
    event PaymentReleased(uint256 indexed projectId, address indexed client, address indexed worker, uint256 amount);
    event TokensBurned(address indexed user, uint256 amount);

    constructor(address _token) Ownable(msg.sender) {
        token = MockUSDT(_token);
    }

    function depositAndMint(address user, uint256 amount, string calldata razorpayPaymentId) external onlyOwner {
        require(!processedPayments[razorpayPaymentId], "Payment already processed");
        processedPayments[razorpayPaymentId] = true;
        token.mint(user, amount);
        emit TokensMinted(user, amount, razorpayPaymentId);
    }

    function createProject(address worker, uint256 amount) external {
        uint256 projectId = nextProjectId++;
        projects[projectId] = Project({
            client: msg.sender,
            worker: worker,
            amount: amount,
            isCompleted: false
        });
        require(token.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        emit ProjectCreated(projectId, msg.sender, worker, amount);
    }

    function releasePayment(uint256 projectId) external {
        Project storage project = projects[projectId];
        require(!project.isCompleted, "Already completed");
        require(msg.sender == project.client || msg.sender == owner() || msg.sender == project.worker, "Not authorized");
        project.isCompleted = true;
        require(token.transfer(project.worker, project.amount), "Transfer failed");
        emit PaymentReleased(projectId, project.client, project.worker, project.amount);
    }

    function burnAndWithdraw(uint256 amount) external {
        token.burn(msg.sender, amount);
        emit TokensBurned(msg.sender, amount);
    }

    function getProject(uint256 projectId) external view returns (address client, address worker, uint256 amount, bool isCompleted) {
        Project memory project = projects[projectId];
        return (project.client, project.worker, project.amount, project.isCompleted);
    }
}
