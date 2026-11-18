// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.26;

interface IFourMemeHelper {
    function buyWithEth(uint256 origin,address token,address to,uint256 funds,uint256 minAmount) external payable;
    function sellForEth(uint256 origin,address token,address from,address to,uint256 amount,uint256 minFunds) external;
    function getTokenInfo(address token) external view returns (
        uint256 version, address manager, address quote, uint256 lastPrice,
        uint256 tradingFeeRate, uint256 minTradingFee, uint256 launchTime,
        uint256 offers, uint256 maxOffers, uint256 funds, uint256 maxFunds, bool liquidityAdded
    );
}
interface IFourMemeManager {
    function buyTokenAMAP(address token, address to, uint256 funds, uint256 minAmount) external payable;
    function sellToken(uint256 origin, address token, address from, uint256 amount, uint256 minFunds, uint256 feeRate, address feeRecipient) external;
}
interface IBnbCurveToken {
    function balanceOf(address account) external view returns (uint256);
}

/// @notice BNB-settled Four.meme V2 adapter. No platform fee, owner, upgrade or arbitrary call.
/// @dev In particular, sell minBnbOut checks NET BNB after protocol fees. Manager2's own minFunds is
///      a gross-quote check and cannot by itself enforce a user's net BNB minimum.
///      NOT DEPLOYED: verify this source and runtime bytecode before configuring a signing deployment.
contract BnbFourMemeRouter {
    address public constant MANAGER = 0x5c952063c7fc8610FFDB798152D69F0B9550762b;
    address public constant HELPER = 0xF251F83e40a78868FcfA3FA4599Dad6494E46034;
    uint256 private lock = 1;
    event Trade(address indexed trader, address indexed token, bool isBuy, uint256 nativeAmount, uint256 tokenAmount);
    error WrongChain();
    error InvalidAmount();
    error Expired();
    error UnsupportedCurve();
    error TransferFailed();
    error MinimumNotMet();
    error Reentrant();
    error TokenDebitMismatch();

    constructor() {
        if (block.chainid != 56) revert WrongChain();
        if (MANAGER.code.length == 0 || HELPER.code.length == 0) revert UnsupportedCurve();
    }
    modifier nonReentrant() {
        if (lock != 1) revert Reentrant();
        lock = 2;
        _;
        lock = 1;
    }
    receive() external payable {
        if (msg.sender != MANAGER && msg.sender != HELPER) revert TransferFailed();
    }
    function _curve(address token, uint256 deadline) private view returns(address quote) {
        if (block.chainid != 56) revert WrongChain();
        if (block.timestamp > deadline) revert Expired();
        (uint256 version,address manager,address quote_,,,,,,,,,bool graduated) = IFourMemeHelper(HELPER).getTokenInfo(token);
        if (version != 2 || manager != MANAGER || graduated || token.code.length == 0) revert UnsupportedCurve();
        return quote_;
    }
    function _send(uint256 amount) private {
        if (amount == 0) return;
        (bool ok,) = msg.sender.call{value:amount}("");
        if (!ok) revert TransferFailed();
    }
    function buy(address token, uint256 funds, uint256 minTokensOut, uint256 deadline)
        external payable nonReentrant returns (uint256 received, uint256 spent)
    {
        address quote = _curve(token,deadline);
        if (msg.value == 0 || funds == 0 || funds > msg.value || minTokensOut == 0) revert InvalidAmount();
        uint256 beforeToken = IBnbCurveToken(token).balanceOf(msg.sender);
        uint256 dust = address(this).balance - msg.value;
        if(quote == address(0)) IFourMemeManager(MANAGER).buyTokenAMAP{value:msg.value}(token,msg.sender,funds,minTokensOut);
        else IFourMemeHelper(HELPER).buyWithEth{value:msg.value}(0,token,msg.sender,funds,minTokensOut);
        received = IBnbCurveToken(token).balanceOf(msg.sender) - beforeToken;
        if (received < minTokensOut) revert MinimumNotMet();
        uint256 refund = address(this).balance - dust;
        spent = msg.value - refund;
        if (spent == 0) revert InvalidAmount();
        emit Trade(msg.sender,token,true,spent,received);
        _send(refund);
    }
    function sell(address token, uint256 amount, uint256 minBnbOut, uint256 deadline)
        external nonReentrant returns (uint256 received)
    {
        address quote = _curve(token,deadline);
        if (amount == 0 || minBnbOut == 0) revert InvalidAmount();
        uint256 beforeToken = IBnbCurveToken(token).balanceOf(msg.sender);
        uint256 beforeBnb = address(this).balance;
        // No router fee; the outer balance check enforces the NET BNB minimum atomically.
        // Manager's from-overload requires tx.origin == from. The SDK deliberately admits EOA wallets only.
        // The user approves the canonical Manager, never this router. No extra token transfer/tax hop.
        if(quote == address(0)) IFourMemeManager(MANAGER).sellToken(0,token,msg.sender,amount,0,0,address(0));
        else IFourMemeHelper(HELPER).sellForEth(0,token,msg.sender,address(this),amount,0);
        received = address(this).balance - beforeBnb;
        if (received < minBnbOut) revert MinimumNotMet();
        if (beforeToken - IBnbCurveToken(token).balanceOf(msg.sender) != amount) revert TokenDebitMismatch();
        emit Trade(msg.sender,token,false,received,amount);
        _send(received);
    }
}
