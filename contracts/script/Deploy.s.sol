// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {MockUSDT} from "../src/MockUSDT.sol";
import {CrossBorderEscrow} from "../src/CrossBorderEscrow.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        MockUSDT usdt = new MockUSDT();
        CrossBorderEscrow escrow = new CrossBorderEscrow(address(usdt));

        usdt.transferOwnership(address(escrow));

        console2.log("MockUSDT deployed at:", address(usdt));
        console2.log("CrossBorderEscrow deployed at:", address(escrow));

        vm.stopBroadcast();
    }
}
