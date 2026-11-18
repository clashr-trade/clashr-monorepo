// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.26;
import {BnbFourMemeRouter} from "../../src/bnb/BnbFourMemeRouter.sol";

interface VmBnb {
    function chainId(uint256) external;
    function deal(address,uint256) external;
    function etch(address,bytes calldata) external;
    function warp(uint256) external;
    function expectRevert(bytes4) external;
    function expectRevert() external;
    function startPrank(address,address) external;
}
contract BnbMockToken {
    mapping(address=>uint256) public balanceOf;
    mapping(address=>mapping(address=>uint256)) public allowance;
    bool public falseReturn;
    bool public extraSenderTax;
    uint256 public taxBps;
    function mint(address to,uint256 amount) external {balanceOf[to]+=amount;}
    function setTax(uint256 tax) external {taxBps=tax;}
    function setFalse(bool value) external {falseReturn=value;}
    function setSenderTax(bool value) external {extraSenderTax=value;}
    function approve(address to,uint256 amount) external returns(bool){if(falseReturn)return false;allowance[msg.sender][to]=amount;return true;}
    function transferFrom(address from,address to,uint256 amount) external returns(bool){
        if(falseReturn)return false;
        allowance[from][msg.sender]-=amount;balanceOf[from]-=amount+(extraSenderTax?amount*taxBps/10000:0);balanceOf[to]+=amount-amount*taxBps/10000;return true;
    }
}
contract BnbMockHelper {
    uint256 public version;
    address public quote;
    bool public graduated;
    function setVersion(uint256 v) external {version=v;}
    function setQuote(address q) external {quote=q;}
    function setGraduated(bool g) external {graduated=g;}
    receive() external payable {}
    function buyWithEth(uint256,address token,address to,uint256 funds,uint256) external payable {require(funds==msg.value);BnbMockToken(token).mint(to,funds*500);}
    function sellForEth(uint256,address token,address from,address to,uint256 amount,uint256) external {
        uint256 beforeBnb=address(this).balance;
        BnbMockManager(payable(0x5c952063c7fc8610FFDB798152D69F0B9550762b)).sellToken(0,token,from,amount,0,0,address(0));
        (bool ok,)=to.call{value:address(this).balance-beforeBnb}("");require(ok);
    }
    function getTokenInfo(address) external view returns(uint256,address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,bool){
        return(version==0?2:version,0x5c952063c7fc8610FFDB798152D69F0B9550762b,quote,1e15,100,0,0,1,2,1,2,graduated);
    }
}
contract BnbMockManager {
    uint256 public refund;
    uint256 public sellFeeBps;
    uint256 public buyBps;
    receive() external payable {}
    function setRefund(uint256 v) external {refund=v;}
    function setFee(uint256 v) external {sellFeeBps=v;}
    function setBuyBps(uint256 v) external {buyBps=v;}
    function buyTokenAMAP(address token,address to,uint256,uint256) external payable {
        BnbMockToken(token).mint(to,(msg.value-refund)*1000*(buyBps==0?10000:buyBps)/10000);
        if(refund>0){(bool ok,)=msg.sender.call{value:refund}("");require(ok);}
    }
    function sellToken(uint256,address token,address from,uint256 amount,uint256,uint256,address) external {
        require(tx.origin==from);require(BnbMockToken(token).transferFrom(from,address(this),amount));
        uint256 net=amount/1000*(10000-sellFeeBps)/10000;
        (bool ok,)=msg.sender.call{value:net}("");require(ok);
    }
}
contract BnbReenterer {
    BnbFourMemeRouter public router;
    address public token;
    bool public blocked;
    constructor(BnbFourMemeRouter r,address t){router=r;token=t;}
    function buy() external payable {router.buy{value:msg.value}(token,msg.value,1,block.timestamp+60);}
    receive() external payable {
        (bool ok,)=address(router).call(abi.encodeCall(router.buy,(token,1,1,block.timestamp+60)));
        blocked=!ok;
    }
}
contract BnbFourMemeRouterTest {
    VmBnb constant vm=VmBnb(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant MANAGER=0x5c952063c7fc8610FFDB798152D69F0B9550762b;
    address constant HELPER=0xF251F83e40a78868FcfA3FA4599Dad6494E46034;
    BnbFourMemeRouter router;
    BnbMockToken token;
    function setUp() public {
        vm.chainId(56);vm.warp(10000);vm.deal(address(this),100 ether);
        vm.etch(MANAGER,address(new BnbMockManager()).code);vm.etch(HELPER,address(new BnbMockHelper()).code);
        vm.deal(MANAGER,100 ether);token=new BnbMockToken();router=new BnbFourMemeRouter();
        vm.startPrank(address(this),address(this));
    }
    receive() external payable {}
    function testBuyRefundsOnlyCurrentFundsAndMeasuresActualTokens() public {
        vm.deal(address(router),3 ether);BnbMockManager(payable(MANAGER)).setRefund(0.1 ether);
        (uint256 received,uint256 spent)=router.buy{value:1 ether}(address(token),1 ether,900 ether,block.timestamp+60);
        require(received==900 ether&&spent==0.9 ether);require(address(router).balance==3 ether);require(address(this).balance==99.1 ether);
    }
    function testSellEnforcesNetAndLeavesNoApprovalOrUserResidue() public {
        vm.deal(address(router),3 ether);token.mint(address(router),5 ether);token.mint(address(this),1000 ether);token.approve(MANAGER,1000 ether);
        uint256 out=router.sell(address(token),1000 ether,0.99 ether,block.timestamp+60);
        require(out==1 ether&&address(this).balance==101 ether&&address(router).balance==3 ether);
        require(token.balanceOf(address(router))==5 ether&&token.allowance(address(router),MANAGER)==0);
    }
    function testFeeIncreaseCannotViolateNetMinimumOrTakeTokens() public {
        token.mint(address(this),1000 ether);token.approve(MANAGER,1000 ether);BnbMockManager(payable(MANAGER)).setFee(5000);
        vm.expectRevert(BnbFourMemeRouter.MinimumNotMet.selector);router.sell(address(token),1000 ether,0.9 ether,block.timestamp+60);
        require(token.balanceOf(address(this))==1000 ether&&token.balanceOf(address(router))==0);
    }
    function testNominalBuyReturnCannotReplaceWalletBalanceMinimum() public {
        BnbMockManager(payable(MANAGER)).setBuyBps(5000);
        vm.expectRevert(BnbFourMemeRouter.MinimumNotMet.selector);router.buy{value:1 ether}(address(token),1 ether,900 ether,block.timestamp+60);
        require(token.balanceOf(address(this))==0);
    }
    function testRejectsExtraSenderDebitAndFalseReturningTokens() public {
        token.mint(address(this),2000 ether);token.approve(MANAGER,2000 ether);token.setTax(100);token.setSenderTax(true);
        vm.expectRevert(BnbFourMemeRouter.TokenDebitMismatch.selector);router.sell(address(token),1000 ether,1,block.timestamp+60);
        require(token.balanceOf(address(this))==2000 ether);token.setTax(0);token.setFalse(true);
        vm.expectRevert();router.sell(address(token),1000 ether,1,block.timestamp+60);
    }
    function testRejectsGraduatedAndVersionOneCurves() public {
        BnbMockHelper(payable(HELPER)).setGraduated(true);vm.expectRevert(BnbFourMemeRouter.UnsupportedCurve.selector);router.buy{value:1}(address(token),1,1,block.timestamp+60);
        BnbMockHelper(payable(HELPER)).setGraduated(false);BnbMockHelper(payable(HELPER)).setVersion(1);vm.expectRevert(BnbFourMemeRouter.UnsupportedCurve.selector);router.buy{value:1}(address(token),1,1,block.timestamp+60);
    }
    function testErc20QuoteUsesHelperAndStillChecksNetBnb() public {
        BnbMockHelper(payable(HELPER)).setQuote(address(1));
        (uint256 received,)=router.buy{value:1 ether}(address(token),1 ether,490 ether,block.timestamp+60);require(received==500 ether);
        token.approve(MANAGER,500 ether);uint256 output=router.sell(address(token),500 ether,0.49 ether,block.timestamp+60);require(output==0.5 ether);
    }
    function testRejectsWrongChainDeadlineAndZeroMinimum() public {
        vm.chainId(1);vm.expectRevert(BnbFourMemeRouter.WrongChain.selector);new BnbFourMemeRouter();vm.chainId(56);
        vm.expectRevert(BnbFourMemeRouter.Expired.selector);router.buy{value:1}(address(token),1,1,block.timestamp-1);
        vm.expectRevert(BnbFourMemeRouter.InvalidAmount.selector);router.buy{value:1}(address(token),1,0,block.timestamp+60);
    }
    function testRefundRecipientCannotReenter() public {
        BnbMockManager(payable(MANAGER)).setRefund(0.1 ether);BnbReenterer receiver=new BnbReenterer(router,address(token));
        receiver.buy{value:1 ether}();require(receiver.blocked());
    }
    function testFuzzSellMinimumAppliesAfterProtocolFee(uint96 rawAmount,uint16 rawFee) public {
        uint256 amount=uint256(rawAmount)%(10000 ether)+1 ether; uint256 fee=uint256(rawFee)%10000;
        token.mint(address(this),amount);token.approve(MANAGER,amount);BnbMockManager(payable(MANAGER)).setFee(fee);
        if(fee>0)vm.expectRevert(BnbFourMemeRouter.MinimumNotMet.selector);
        router.sell(address(token),amount,amount/1000,block.timestamp+60);
    }
}
