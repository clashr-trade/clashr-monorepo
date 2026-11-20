// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.26;

import {IFlapPortal} from "../../src/flap/IFlapPortal.sol";
import {FlapBNB} from "../../src/flap/FlapBNB.sol";

interface VmFlapFork {
    function envOr(string calldata name, string calldata fallbackValue) external returns (string memory);
    function envOr(string calldata name, address fallbackValue) external returns (address);
    function envOr(string calldata name, uint256 fallbackValue) external returns (uint256);
    function createSelectFork(string calldata url) external returns (uint256);
    function createSelectFork(string calldata url, uint256 blockNumber) external returns (uint256);
    function skip(bool condition) external;
}

/// @notice Read-only BNB fork compatibility checks. Never signs or broadcasts.
contract FlapPortalForkTest {
    VmFlapFork private constant vm = VmFlapFork(address(uint160(uint256(keccak256("hevm cheat code")))));

    function setUp() public {
        string memory rpc = vm.envOr("BSC_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        uint256 forkBlock = vm.envOr("FLAP_FORK_BLOCK", uint256(0));
        if (forkBlock == 0) vm.createSelectFork(rpc);
        else vm.createSelectFork(rpc, forkBlock);
        require(block.chainid == FlapBNB.CHAIN_ID, "Expected BNB mainnet");
        require(FlapBNB.PORTAL.code.length > 0, "Portal has no code");
    }

    function testForkPortalSupportsCurrentMajorVersion() public view {
        bytes memory version = bytes(IFlapPortal(FlapBNB.PORTAL).version());
        bool supported = version.length >= 2 && version[0] == bytes1("5") && version[1] == bytes1(".");
        supported = supported
            || (version.length >= 3
                && version[0] == bytes1("v")
                && version[1] == bytes1("5")
                && version[2] == bytes1("."));
        require(supported, "Review unsupported Portal major version");
    }

    function testForkConfiguredTokenReadSurface() public {
        address token = vm.envOr("FLAP_FORK_TOKEN", address(0));
        if (token == address(0)) {
            vm.skip(true);
            return;
        }
        IFlapPortal portal = IFlapPortal(FlapBNB.PORTAL);
        IFlapPortal.TokenStateV8Safe memory state = portal.getTokenV8Safe(token);
        require(state.status > 0 && state.status <= 5, "Review unknown token status");
        require(state.quoteTokenAddress != token, "Invalid settlement asset");
        // Match the current SDK's read requirements; no quote, approval or swap is sent.
        portal.nftGate(token);
        portal.maxBuyPerOrigin(token);
        portal.buyQuotaOf(token, address(this));
    }
}
