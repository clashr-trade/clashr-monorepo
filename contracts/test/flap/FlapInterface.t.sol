// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.26;

import {IFlapPortal} from "../../src/flap/IFlapPortal.sol";
import {FlapBNB} from "../../src/flap/FlapBNB.sol";

interface VmFlap {
    struct Log {
        bytes32[] topics;
        bytes data;
        address emitter;
    }

    function etch(address target, bytes calldata code) external;
    function mockCall(address target, bytes calldata data, bytes calldata returnData) external;
    function recordLogs() external;
    function getRecordedLogs() external returns (Log[] memory);
}

/// @notice ABI regression fixtures, not a mock implementation of Flap economics.
contract FlapInterfaceTest {
    VmFlap private constant vm = VmFlap(address(uint160(uint256(keccak256("hevm cheat code")))));

    function testBnbIdentityAndZeroPlatformFee() public pure {
        require(FlapBNB.CHAIN_ID == 56);
        require(FlapBNB.PORTAL == 0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0);
        require(FlapBNB.NATIVE == address(0));
        require(FlapBNB.TRADABLE == 1 && FlapBNB.DEX == 4);
        require(FlapBNB.PLATFORM_FEE_BPS == 0);
    }

    function testPublishedPortalSelectors() public pure {
        require(IFlapPortal.version.selector == 0x54fd4d50);
        require(IFlapPortal.getTokenV8Safe.selector == 0x62fafcca);
        require(IFlapPortal.nftGate.selector == 0x9b95f8dc);
        require(IFlapPortal.maxBuyPerOrigin.selector == 0x4b02c8e9);
        require(IFlapPortal.buyQuotaOf.selector == 0x929b098c);
        require(IFlapPortal.quoteExactInput.selector == 0xfc847c2b);
        require(IFlapPortal.swapExactInput.selector == 0xef7ec2e7);
    }

    function testPublishedErrorSelectors() public pure {
        require(IFlapPortal.TokenNotFound.selector == 0xde6137d1);
        require(IFlapPortal.TokenNotTradable.selector == 0x6e8698f2);
        require(IFlapPortal.SlippageTooHigh.selector == 0x76baadda);
        require(IFlapPortal.NFTGatedOnly.selector == 0xf38fb4a7);
        require(IFlapPortal.BuyCapExceeded.selector == 0xc866db66);
    }

    function testStateTupleDecodesAllEighteenPublishedWords() public {
        // Encode the wire fixture independently of the Solidity struct declaration.
        bytes memory wire = bytes.concat(
            abi.encode(
                uint8(1), uint256(2), uint256(3), uint256(4), uint8(5), uint256(6), uint256(7), uint256(8), uint256(9)
            ),
            abi.encode(
                address(10),
                true,
                bytes32(uint256(12)),
                uint256(13),
                uint256(14),
                address(15),
                uint256(16),
                uint8(17),
                uint8(18)
            )
        );
        vm.etch(FlapBNB.PORTAL, hex"00");
        vm.mockCall(FlapBNB.PORTAL, abi.encodeCall(IFlapPortal.getTokenV8Safe, (address(123))), wire);
        IFlapPortal.TokenStateV8Safe memory s = IFlapPortal(FlapBNB.PORTAL).getTokenV8Safe(address(123));
        require(s.status == 1 && s.reserve == 2 && s.circulatingSupply == 3 && s.price == 4);
        require(s.tokenVersion == 5 && s.r == 6 && s.h == 7 && s.k == 8 && s.dexSupplyThresh == 9);
        require(
            s.quoteTokenAddress == address(10) && s.nativeToQuoteSwapEnabled && s.extensionID == bytes32(uint256(12))
        );
        require(s.buyTaxRate == 13 && s.sellTaxRate == 14 && s.pool == address(15));
        require(s.progress == 16 && s.lpFeeProfile == 17 && s.dexId == 18);
    }

    function testFillEventsHaveOneTopicAndSevenDataWords() public {
        vm.recordLogs();
        emit IFlapPortal.TokenBought(1, address(2), address(3), 4, 5, 6, 7);
        emit IFlapPortal.TokenSold(1, address(2), address(3), 4, 5, 6, 7);
        VmFlap.Log[] memory logs = vm.getRecordedLogs();
        require(logs.length == 2);
        require(logs[0].topics.length == 1 && logs[1].topics.length == 1);
        require(logs[0].topics[0] == 0xa800a2038683844fac66747f771bfdfae862eb28b16bcfa387afa9fbacce8ff7);
        require(logs[1].topics[0] == 0x03a4693e592f5e75dc7c136acb39b146d2b4966c0e509c34f362dee02b3b861a);
        bytes memory data =
            abi.encode(uint256(1), address(2), address(3), uint256(4), uint256(5), uint256(6), uint256(7));
        require(keccak256(logs[0].data) == keccak256(data) && keccak256(logs[1].data) == keccak256(data));
    }
}
