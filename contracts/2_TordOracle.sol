// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20Oracle {
    function transfer(address to, uint256 amount) external returns (bool);
}

contract TordOracle {
    address public owner;
    address public updater;

    uint256 public twapPrice;
    uint256 public lastUpdateTime;
    uint256 public minUpdateInterval = 60;

    uint256[] public priceHistory;
    uint256[] public timestampHistory;
    uint256 public maxHistory = 60;
    uint256 public twapWindow = 300;
    uint256 public maxPriceDeviation = 500;

    event PriceUpdated(uint256 price, uint256 timestamp);
    event TWAPWindowSet(uint256 window);
    event UpdaterSet(address updater);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyUpdater() {
        require(msg.sender == owner || msg.sender == updater, "Not authorized");
        _;
    }

    constructor() {
        owner = msg.sender;
        updater = msg.sender;
    }

    function setUpdater(address _updater) external onlyOwner {
        updater = _updater;
        emit UpdaterSet(_updater);
    }

    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "Invalid address");
        owner = _newOwner;
    }

    function pushPrice(uint256 _price) external onlyUpdater {
        require(_price > 0, "Invalid price");
        require(
            block.timestamp >= lastUpdateTime + minUpdateInterval,
            "Update too frequent"
        );

        if (twapPrice > 0) {
            uint256 deviation;
            if (_price > twapPrice) {
                deviation = ((_price - twapPrice) * 10000) / twapPrice;
            } else {
                deviation = ((twapPrice - _price) * 10000) / twapPrice;
            }
            require(deviation <= maxPriceDeviation, "Price deviation too high");
        }

        priceHistory.push(_price);
        timestampHistory.push(block.timestamp);

        if (priceHistory.length > maxHistory) {
            _trimHistory();
        }

        twapPrice = _calculateTWAP();
        lastUpdateTime = block.timestamp;
        emit PriceUpdated(twapPrice, block.timestamp);
    }

    function _calculateTWAP() internal view returns (uint256) {
        if (priceHistory.length == 0) return 0;
        if (priceHistory.length == 1) return priceHistory[0];

        uint256 cutoff = block.timestamp > twapWindow ? block.timestamp - twapWindow : 0;
        uint256 weightedSum = 0;
        uint256 totalTime = 0;

        for (uint256 i = 1; i < priceHistory.length; i++) {
            if (timestampHistory[i] < cutoff) continue;
            uint256 dt = timestampHistory[i] - timestampHistory[i - 1];
            weightedSum += priceHistory[i - 1] * dt;
            totalTime += dt;
        }

        if (totalTime == 0) return priceHistory[priceHistory.length - 1];
        return weightedSum / totalTime;
    }

    function _trimHistory() internal {
        uint256 half = priceHistory.length / 2;
        for (uint256 i = 0; i < priceHistory.length - half; i++) {
            priceHistory[i] = priceHistory[i + half];
            timestampHistory[i] = timestampHistory[i + half];
        }
        for (uint256 i = 0; i < half; i++) {
            priceHistory.pop();
            timestampHistory.pop();
        }
    }

    function getMarkPrice() external view returns (uint256) {
        return twapPrice;
    }

    function setTWAPWindow(uint256 _window) external onlyOwner {
        twapWindow = _window;
        emit TWAPWindowSet(_window);
    }

    function setMinUpdateInterval(uint256 _interval) external onlyOwner {
        minUpdateInterval = _interval;
    }

    function setMaxPriceDeviation(uint256 _bps) external onlyOwner {
        require(_bps >= 100 && _bps <= 5000, "1-50%");
        maxPriceDeviation = _bps;
    }

    function setMaxHistory(uint256 _max) external onlyOwner {
        maxHistory = _max;
    }

    function ownerSetPrice(uint256 _price) external onlyOwner {
        require(_price > 0, "Invalid price");
        twapPrice = _price;
        lastUpdateTime = block.timestamp;
        emit PriceUpdated(_price, block.timestamp);
    }

    function rescueToken(address _token, uint256 _amount) external onlyOwner {
        require(_token != address(0), "Invalid token");
        require(IERC20Oracle(_token).transfer(owner, _amount), "Transfer failed");
    }

    function rescueBNB() external onlyOwner {
        uint256 bal = address(this).balance;
        require(bal > 0, "No BNB");
        (bool ok,) = owner.call{value: bal}("");
        require(ok, "BNB transfer failed");
    }

    receive() external payable {}
}