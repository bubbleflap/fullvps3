// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
    function approve(address spender, uint256 amount) external returns (bool);
}

contract TordVault {
    address public owner;
    IERC20 public usdt;
    address public perps;
    address public insurance;

    uint256 public totalLiquidity;
    uint256 public lockedCollateral;
    uint256 public totalFeesCollected;
    uint256 public totalPnLPaid;
    uint256 public totalPnLReceived;

    mapping(address => uint256) public traderBalances;
    mapping(address => bool) public hasOpenPosition;

    bool public paused;
    uint256 private _status;

    event LiquidityDeposit(address indexed provider, uint256 amount);
    event LiquidityWithdraw(address indexed provider, uint256 amount);
    event TraderDeposit(address indexed trader, uint256 amount);
    event TraderWithdraw(address indexed trader, uint256 amount);
    event PnLSettled(address indexed trader, int256 pnl);
    event FeeCollected(uint256 amount);
    event PerpsSet(address perps);
    event InsuranceSet(address insurance);
    event Paused(bool state);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyPerps() {
        require(msg.sender == perps, "Only perps contract");
        _;
    }

    modifier nonReentrant() {
        require(_status == 0, "Reentrant");
        _status = 1;
        _;
        _status = 0;
    }

    modifier whenNotPaused() {
        require(!paused, "Vault paused");
        _;
    }

    constructor(address _usdt) {
        owner = msg.sender;
        usdt = IERC20(_usdt);
    }

    function setPerps(address _perps) external onlyOwner {
        require(_perps != address(0), "Invalid address");
        perps = _perps;
        emit PerpsSet(_perps);
    }

    function setInsurance(address _insurance) external onlyOwner {
        require(_insurance != address(0), "Invalid address");
        insurance = _insurance;
        emit InsuranceSet(_insurance);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit Paused(_paused);
    }

    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "Invalid address");
        owner = _newOwner;
    }

    function depositLiquidity(uint256 amount) external onlyOwner nonReentrant {
        require(amount > 0, "Zero amount");
        require(usdt.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        totalLiquidity += amount;
        emit LiquidityDeposit(msg.sender, amount);
    }

    function withdrawLiquidity(uint256 amount) external onlyOwner nonReentrant {
        require(amount > 0, "Zero amount");
        require(totalLiquidity - lockedCollateral >= amount, "Insufficient free liquidity");
        totalLiquidity -= amount;
        require(usdt.transfer(owner, amount), "Transfer failed");
        emit LiquidityWithdraw(owner, amount);
    }

    function traderDeposit(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "Zero amount");
        require(usdt.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        traderBalances[msg.sender] += amount;
        emit TraderDeposit(msg.sender, amount);
    }

    function traderWithdraw(uint256 amount) external nonReentrant {
        require(amount > 0, "Zero amount");
        require(!hasOpenPosition[msg.sender], "Close positions first");
        require(traderBalances[msg.sender] >= amount, "Insufficient balance");
        traderBalances[msg.sender] -= amount;
        require(usdt.transfer(msg.sender, amount), "Transfer failed");
        emit TraderWithdraw(msg.sender, amount);
    }

    function setPositionStatus(address trader, bool isOpen) external onlyPerps {
        hasOpenPosition[trader] = isOpen;
    }

    function lockCollateral(address trader, uint256 amount) external onlyPerps {
        require(traderBalances[trader] >= amount, "Insufficient collateral");
        traderBalances[trader] -= amount;
        lockedCollateral += amount;
    }

    function deductFee(address trader, uint256 amount) external onlyPerps {
        require(traderBalances[trader] >= amount, "Insufficient for fee");
        traderBalances[trader] -= amount;
        totalLiquidity += amount;
        totalFeesCollected += amount;
        emit FeeCollected(amount);
    }

    function settlePnL(address trader, uint256 collateral, int256 pnl) external onlyPerps {
        require(lockedCollateral >= collateral, "Locked underflow");
        lockedCollateral -= collateral;

        if (pnl > 0) {
            uint256 profit = uint256(pnl);
            uint256 avail = totalLiquidity > lockedCollateral ? totalLiquidity - lockedCollateral : 0;
            if (profit > avail) {
                profit = avail;
            }
            traderBalances[trader] += collateral + profit;
            totalLiquidity -= profit;
            totalPnLPaid += profit;
        } else if (pnl < 0) {
            uint256 loss = uint256(-pnl);
            if (loss >= collateral) {
                totalLiquidity += collateral;
                totalPnLReceived += collateral;
            } else {
                traderBalances[trader] += collateral - loss;
                totalLiquidity += loss;
                totalPnLReceived += loss;
            }
        } else {
            traderBalances[trader] += collateral;
        }

        emit PnLSettled(trader, pnl);
    }

    function settleLiquidation(address trader, uint256 collateral, uint256 insuranceAmount) external onlyPerps {
        require(lockedCollateral >= collateral, "Locked underflow");
        require(insuranceAmount <= collateral, "Insurance exceeds collateral");
        lockedCollateral -= collateral;

        uint256 toVault = collateral - insuranceAmount;
        totalLiquidity += toVault;
        totalPnLReceived += toVault;

        if (insuranceAmount > 0 && insurance != address(0)) {
            require(usdt.transfer(insurance, insuranceAmount), "Insurance transfer failed");
        } else {
            totalLiquidity += insuranceAmount;
        }

        emit PnLSettled(trader, -int256(collateral));
    }

    function getAvailableLiquidity() external view returns (uint256) {
        if (totalLiquidity <= lockedCollateral) return 0;
        return totalLiquidity - lockedCollateral;
    }

    function getTraderBalance(address trader) external view returns (uint256) {
        return traderBalances[trader];
    }

    function getVaultStats() external view returns (
        uint256 liquidity,
        uint256 vaultLocked,
        uint256 available,
        uint256 fees,
        uint256 pnlPaid,
        uint256 pnlReceived,
        uint256 actualBalance
    ) {
        liquidity = totalLiquidity;
        vaultLocked = lockedCollateral;
        available = totalLiquidity > lockedCollateral ? totalLiquidity - lockedCollateral : 0;
        fees = totalFeesCollected;
        pnlPaid = totalPnLPaid;
        pnlReceived = totalPnLReceived;
        actualBalance = usdt.balanceOf(address(this));
    }

    function emergencyWithdraw() external onlyOwner nonReentrant {
        uint256 bal = usdt.balanceOf(address(this));
        require(usdt.transfer(owner, bal), "Transfer failed");
        totalLiquidity = 0;
        lockedCollateral = 0;
    }

    function rescueToken(address _token, uint256 _amount) external onlyOwner nonReentrant {
        require(_token != address(0), "Invalid token");
        require(IERC20(_token).transfer(owner, _amount), "Transfer failed");
    }

    function rescueBNB() external onlyOwner nonReentrant {
        uint256 bal = address(this).balance;
        require(bal > 0, "No BNB");
        (bool ok,) = owner.call{value: bal}("");
        require(ok, "BNB transfer failed");
    }

    receive() external payable {}
}