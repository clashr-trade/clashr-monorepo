// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {TreasuryTimelock} from "../src/TreasuryTimelock.sol";
import {ClashrLegacyRouter, IUniversalRouter} from "../src/ClashrLegacyRouter.sol";

/// @notice Access control, timelock, validation and pause, without a fork. Swap paths are covered by
///         ClashrLegacyRouter.fork.t.sol against the real Universal Router and pools.
contract ClashrLegacyRouterTest is Test {
    ClashrLegacyRouter router;
    address constant UR = address(0xBEEF);
    address constant WETH = address(0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73);
    address constant TOKEN = address(0x7070);
    address treasury = makeAddr("treasury");
    address guardian = makeAddr("guardian");
    address operator = makeAddr("operator");
    address alice = makeAddr("alice");
    address lift = address(0x2c668601193e4A081DD82604785e436AFf6a2aCC);

    function setUp() public {
        address[] memory hooks = new address[](1);
        hooks[0] = address(0);
        router = new ClashrLegacyRouter(IUniversalRouter(UR), WETH, treasury, 50, 45, guardian, operator, 1 hours, hooks);
        vm.deal(alice, 10 ether);
    }

    function _route(ClashrLegacyRouter.Kind kind, address quote, address hooks)
        internal
        pure
        returns (ClashrLegacyRouter.Route memory)
    {
        return ClashrLegacyRouter.Route({kind: kind, token: TOKEN, quote: quote, fee: 3000, tickSpacing: 60, hooks: hooks});
    }

    function test_constructorValidates() public {
        address[] memory none = new address[](0);
        vm.expectRevert(ClashrLegacyRouter.FeeTooHigh.selector);
        new ClashrLegacyRouter(IUniversalRouter(UR), WETH, treasury, 301, 0, guardian, operator, 1 hours, none);
        vm.expectRevert(ClashrLegacyRouter.FeeTooHigh.selector);
        new ClashrLegacyRouter(IUniversalRouter(UR), WETH, treasury, 50, 51, guardian, operator, 1 hours, none);
        vm.expectRevert(TreasuryTimelock.DelayTooShort.selector);
        new ClashrLegacyRouter(IUniversalRouter(UR), WETH, treasury, 50, 45, guardian, operator, 5 minutes, none);
        vm.expectRevert(TreasuryTimelock.ZeroAddress.selector);
        new ClashrLegacyRouter(IUniversalRouter(UR), WETH, address(0), 50, 45, guardian, operator, 1 hours, none);
        vm.expectRevert(TreasuryTimelock.ZeroAddress.selector);
        new ClashrLegacyRouter(IUniversalRouter(UR), WETH, treasury, 50, 45, address(0), operator, 1 hours, none);
        assertTrue(router.hookAllowed(address(0)));
        assertFalse(router.hookAllowed(lift));
    }

    function test_routeValidation() public {
        vm.startPrank(alice);
        // v2/v3 must be WETH-quoted with no hooks
        vm.expectRevert(ClashrLegacyRouter.BadRoute.selector);
        router.buy{value: 1 ether}(_route(ClashrLegacyRouter.Kind.V3, address(0), address(0)), 0, block.timestamp, false);
        vm.expectRevert(ClashrLegacyRouter.BadRoute.selector);
        router.buy{value: 1 ether}(_route(ClashrLegacyRouter.Kind.V2, WETH, lift), 0, block.timestamp, false);
        // v4 quote must be ETH or WETH
        vm.expectRevert(ClashrLegacyRouter.BadRoute.selector);
        router.buy{value: 1 ether}(_route(ClashrLegacyRouter.Kind.V4, address(0x5fc5), address(0)), 0, block.timestamp, false);
        // v4 hooks must be allowlisted
        vm.expectRevert(abi.encodeWithSelector(ClashrLegacyRouter.HookNotAllowed.selector, lift));
        router.buy{value: 1 ether}(_route(ClashrLegacyRouter.Kind.V4, address(0), lift), 0, block.timestamp, false);
        // the token can't be the quote or WETH
        ClashrLegacyRouter.Route memory r = _route(ClashrLegacyRouter.Kind.V3, WETH, address(0));
        r.token = WETH;
        vm.expectRevert(ClashrLegacyRouter.BadRoute.selector);
        router.buy{value: 1 ether}(r, 0, block.timestamp, false);
        vm.stopPrank();
    }

    function test_guardsZeroDeadlinePause() public {
        ClashrLegacyRouter.Route memory r = _route(ClashrLegacyRouter.Kind.V4, address(0), address(0));
        vm.startPrank(alice);
        vm.expectRevert(ClashrLegacyRouter.ZeroAmount.selector);
        router.buy{value: 0}(r, 0, block.timestamp, false);
        vm.expectRevert(ClashrLegacyRouter.DeadlinePassed.selector);
        router.buy{value: 1 ether}(r, 0, block.timestamp - 1, false);
        vm.stopPrank();

        vm.prank(alice);
        vm.expectRevert(TreasuryTimelock.NotGuardian.selector);
        router.setPaused(true);
        vm.prank(guardian);
        router.setPaused(true);

        vm.startPrank(alice);
        vm.expectRevert(ClashrLegacyRouter.IsPaused.selector);
        router.buy{value: 1 ether}(r, 0, block.timestamp, false);
        vm.expectRevert(ClashrLegacyRouter.IsPaused.selector);
        router.sell(r, 1, 0, block.timestamp, false);
        // The user-confirmed exit is never paused: it gets past the pause check (and fails later on the
        // code-less mock token, not on IsPaused).
        (bool ok, bytes memory err) =
            address(router).call(abi.encodeCall(ClashrLegacyRouter.sellAnyPool, (r, 1, 0, block.timestamp, false)));
        assertFalse(ok);
        assertTrue(keccak256(err) != keccak256(abi.encodeWithSelector(ClashrLegacyRouter.IsPaused.selector)));
        vm.stopPrank();
    }

    function test_sellRequiresAllowlistedPool() public {
        ClashrLegacyRouter.Route memory r = _route(ClashrLegacyRouter.Kind.V3, WETH, address(0));
        bytes32 key = router.poolKeyOf(r);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ClashrLegacyRouter.PoolNotAllowed.selector, key));
        router.sell(r, 1, 0, block.timestamp, false);
    }

    function test_timelockForSellPools() public {
        bytes32 key = keccak256("pool");
        vm.prank(alice);
        vm.expectRevert(ClashrLegacyRouter.NotOperator.selector);
        router.queueSellPool(key);

        vm.expectRevert(ClashrLegacyRouter.NotQueued.selector);
        router.activateSellPool(key);

        vm.prank(operator);
        router.queueSellPool(key);
        uint256 eta = block.timestamp + 1 hours;
        assertEq(router.queuedAt(key), eta);
        vm.expectRevert(abi.encodeWithSelector(ClashrLegacyRouter.TooEarly.selector, eta));
        router.activateSellPool(key);

        vm.warp(eta);
        vm.prank(alice); // anyone can activate after the delay
        router.activateSellPool(key);
        assertTrue(router.sellPoolAllowed(key));
        assertEq(router.queuedAt(key), 0);

        vm.prank(operator);
        vm.expectRevert(TreasuryTimelock.NotGuardian.selector);
        router.removeSellPool(key);
        vm.prank(guardian);
        router.removeSellPool(key);
        assertFalse(router.sellPoolAllowed(key));
    }

    function test_guardianCancelsQueuedHook() public {
        vm.prank(operator);
        router.queueHook(lift);
        vm.prank(guardian);
        router.removeHook(lift);
        vm.warp(block.timestamp + 2 hours);
        vm.expectRevert(ClashrLegacyRouter.NotQueued.selector);
        router.activateHook(lift);
        assertFalse(router.hookAllowed(lift));

        vm.prank(operator);
        router.queueHook(lift);
        vm.warp(block.timestamp + 1 hours);
        router.activateHook(lift);
        assertTrue(router.hookAllowed(lift));
    }

    function test_operatorRotationOnlyByGuardian() public {
        vm.prank(operator);
        vm.expectRevert(TreasuryTimelock.NotGuardian.selector);
        router.setOperator(alice);
        vm.prank(guardian);
        router.setOperator(alice);
        assertEq(router.operator(), alice);
        vm.prank(operator); // old operator lost the role
        vm.expectRevert(ClashrLegacyRouter.NotOperator.selector);
        router.queueSellPool(bytes32(uint256(1)));
    }

    function test_rejectsStrayEth() public {
        vm.prank(alice);
        (bool ok,) = address(router).call{value: 1 ether}("");
        assertFalse(ok);
    }

    function test_poolKeys() public view {
        // v4 key equals the PoolId of the live PONS/ETH 0.30% pool.
        ClashrLegacyRouter.Route memory r = ClashrLegacyRouter.Route({
            kind: ClashrLegacyRouter.Kind.V4,
            token: 0x39dBED3a2bd333467115dE45665cC57F813C4571,
            quote: address(0),
            fee: 3000,
            tickSpacing: 60,
            hooks: address(0)
        });
        assertEq(router.poolKeyOf(r), 0x6073975413484a350101c0c5d592a91ceb6c3ee881ad359613a08359fd1495a0);
        // v2 keys ignore fee; v3 keys don't
        ClashrLegacyRouter.Route memory a = _route(ClashrLegacyRouter.Kind.V2, WETH, address(0));
        ClashrLegacyRouter.Route memory b = _route(ClashrLegacyRouter.Kind.V2, WETH, address(0));
        b.fee = 500;
        assertEq(router.poolKeyOf(a), router.poolKeyOf(b));
        ClashrLegacyRouter.Route memory c = _route(ClashrLegacyRouter.Kind.V3, WETH, address(0));
        ClashrLegacyRouter.Route memory d = _route(ClashrLegacyRouter.Kind.V3, WETH, address(0));
        d.fee = 500;
        assertTrue(router.poolKeyOf(c) != router.poolKeyOf(d));
        // Shared with packages/trade (clashrLegacyPoolKey): WETH/PONS v3 0.30%.
        r.kind = ClashrLegacyRouter.Kind.V3;
        r.quote = WETH;
        r.tickSpacing = 0;
        assertEq(router.poolKeyOf(r), 0xa3f5a45e222714c4fc15486925f027adce5b0d0c9ae1ec4491443885f7e15796);
    }
}
