// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.26;

/// @notice External Flap bonding-curve Portal interface used by Clashr on BNB Chain.
/// @dev This is an ABI declaration, not a replacement Portal or a custody router.
///      Source: flap-sh/flap-skills, trade-flap-token/references/interface.md.
interface IFlapPortal {
    struct TokenStateV8Safe {
        uint8 status;
        uint256 reserve;
        uint256 circulatingSupply;
        uint256 price;
        uint8 tokenVersion;
        uint256 r;
        uint256 h;
        uint256 k;
        uint256 dexSupplyThresh;
        address quoteTokenAddress;
        bool nativeToQuoteSwapEnabled;
        bytes32 extensionID;
        uint256 buyTaxRate;
        uint256 sellTaxRate;
        address pool;
        uint256 progress;
        uint8 lpFeeProfile;
        uint8 dexId;
    }

    struct QuoteExactInputParams {
        address inputToken;
        address outputToken;
        uint256 inputAmount;
    }

    /// @dev No recipient or deadline field. Outputs belong to the Portal caller.
    ///      Clashr sends empty permitData and uses exact ERC-20 approvals to Portal.
    struct ExactInputParams {
        address inputToken;
        address outputToken;
        uint256 inputAmount;
        uint256 minOutputAmount;
        bytes permitData;
    }

    function version() external view returns (string memory);
    function getTokenV8Safe(address token) external view returns (TokenStateV8Safe memory);
    function nftGate(address token) external view returns (address);
    function maxBuyPerOrigin(address token) external view returns (uint16 bps, uint256 maxBuyAmount);
    function buyQuotaOf(address token, address origin) external view returns (uint256 bought, uint256 remaining);

    /// @dev Non-view on Portal; obtain a quote through eth_call, not a sent transaction.
    function quoteExactInput(QuoteExactInputParams calldata params) external returns (uint256);
    function swapExactInput(ExactInputParams calldata params) external payable returns (uint256);

    // All seven fields are in data. Neither event has indexed arguments.
    // `eth` and `fee` use the curve's quote-asset units, including on native-hop buys.
    event TokenBought(
        uint256 ts, address token, address buyer, uint256 amount, uint256 eth, uint256 fee, uint256 postPrice
    );
    event TokenSold(
        uint256 ts, address token, address seller, uint256 amount, uint256 eth, uint256 fee, uint256 postPrice
    );

    error TokenNotFound(address token);
    error TokenNotTradable(address token);
    error SlippageTooHigh(uint256 actualAmount, uint256 minAmount);
    error NFTGatedOnly(address token);
    error BuyCapExceeded(address token, uint256 amount, uint256 remaining);
}
