// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.26;

/// @notice Integration constants only. Clashr deploys no swap router on this path.
/// @dev The separate Pool Launch Portal and VaultPortal are not bonding-curve swap targets.
///      Source: https://docs.flap.sh/en/flap/v2/developers/deployed-contract-addresses
library FlapBNB {
    uint256 internal constant CHAIN_ID = 56;
    address internal constant PORTAL = 0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0;
    address internal constant NATIVE = address(0);
    uint8 internal constant TRADABLE = 1;
    uint8 internal constant DEX = 4;
    uint256 internal constant PLATFORM_FEE_BPS = 0;
}
