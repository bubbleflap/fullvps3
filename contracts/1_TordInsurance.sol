// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract TordInsurance {
    address public owner;
    IERC20 public usdt;
    address public vault;
    address public perps;

    bool private _reentrancyLock;

    event FundDeposit(address indexed from, uint256 amount);
    event FundPayout(address indexed to, uint256 amount);
    event VaultSet(address vault);
    event PerpsSet(address perps);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAuthorized() {
        require(msg.sender == owner || msg.sender == vault || msg.sender == perps, "Not authorized");
        _;
    }

    modifier nonReentrant() {
        require(!_reentrancyLock, "Reentrant");
        _reentrancyLock = true;
        _;
        _reentrancyLock = false;
    }

    constructor(address _usdt) {
        owner = msg.sender;
        usdt = IERC20(_usdt);
    }

    function setVault(address _vault) external onlyOwner {
        require(_vault != address(0), "Invalid address");
        vault = _vault;
        emit VaultSet(_vault);
    }

    function setPerps(address _perps) external onlyOwner {
        require(_perps != address(0), "Invalid address");
        perps = _perps;
        emit PerpsSet(_perps);
    }

    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "Invalid address");
        owner = _newOwner;
    }

    function deposit(uint256 amount) external nonReentrant {
        require(amount > 0, "Zero amount");
        require(usdt.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        emit FundDeposit(msg.sender, amount);
    }

    function coverBadDebt(address to, uint256 amount) external onlyAuthorized nonReentrant {
        uint256 bal = usdt.balanceOf(address(this));
        require(bal >= amount, "Insurance fund insufficient");
        require(usdt.transfer(to, amount), "Payout failed");
        emit FundPayout(to, amount);
    }

    function getBalance() external view returns (uint256) {
        return usdt.balanceOf(address(this));
    }

    function emergencyWithdraw(uint256 amount) external onlyOwner nonReentrant {
        require(amount > 0, "Zero amount");
        require(usdt.transfer(owner, amount), "Withdraw failed");
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