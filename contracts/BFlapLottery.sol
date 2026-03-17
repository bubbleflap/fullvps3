// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * BFlapLottery — Pure prize vault for BubbleFlap.fun BFLAP Lottery
 * Network: BNB Smart Chain (BSC)
 *
 * BFLAP Token:  0xa2320fff1069ED5b4B02dDb386823E837A7e7777
 * BSC USDT:     0x55d398326f99059fF775485246999027B3197955
 *
 * ARCHITECTURE — Contract is a dumb vault. All price logic lives in the web app.
 *
 *  PURCHASE FLOW:
 *   1. Frontend shows live BNB/BFLAP price (from backend/DexScreener)
 *   2. User clicks "Buy Spins" → MetaMask sends BNB/USDT/BFLAP to this contract
 *   3. Contract emits SpinsPurchased event with buyer + amount
 *   4. Backend verifies the on-chain tx, calculates spin qty from live price, grants spins in DB
 *
 *  PAYOUT FLOW:
 *   1. User wins prizes (backend RNG), stats tracked in DB
 *   2. User clicks "Withdraw" → backend calls payout() with nonce from DB spin ID
 *   3. Contract sends BNB/USDT/BFLAP directly to winner's wallet
 *   4. Nonce marked used — prevents double payout
 *
 * CONSTRUCTOR ARGS:
 *   _bflapToken:    0xa2320fff1069ED5b4B02dDb386823E837A7e7777
 *   _usdtToken:     0x55d398326f99059fF775485246999027B3197955
 *   _backendSigner: <public address of LOTTERY_BOT_KEY wallet>
 */

// ─── Minimal IERC20 ──────────────────────────────────────────────────────────

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function decimals() external view returns (uint8);
}

// ─── SafeERC20 ───────────────────────────────────────────────────────────────

library SafeERC20 {
    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        (bool ok, bytes memory data) = address(token).call(
            abi.encodeWithSelector(token.transfer.selector, to, value)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "SafeERC20: transfer failed");
    }

    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        (bool ok, bytes memory data) = address(token).call(
            abi.encodeWithSelector(token.transferFrom.selector, from, to, value)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "SafeERC20: transferFrom failed");
    }
}

// ─── BFlapLottery ────────────────────────────────────────────────────────────

contract BFlapLottery {
    using SafeERC20 for IERC20;

    // ─── State ───────────────────────────────────────────────

    address public owner;
    address public pendingOwner;

    /// @dev LOTTERY_BOT_KEY wallet — the only address besides owner that can call payout()
    address public backendSigner;

    IERC20 public bflapToken;
    IERC20 public usdtToken;

    bool public paused;

    /// @dev Nonce → already paid out (prevents double-payout per spin)
    mapping(bytes32 => bool) public usedNonces;

    /// @dev Lifetime totals collected from spin purchases (in token smallest units)
    uint256 public totalCollectedBNB;
    uint256 public totalCollectedUSDT;
    uint256 public totalCollectedBFLAP;

    /// @dev Lifetime totals paid out as prizes
    uint256 public totalPaidBNB;
    uint256 public totalPaidUSDT;
    uint256 public totalPaidBFLAP;

    /// @dev Per-wallet on-chain winnings (informational)
    mapping(address => uint256) public wonBNB;
    mapping(address => uint256) public wonUSDT;
    mapping(address => uint256) public wonBFLAP;

    // ─── Events ──────────────────────────────────────────────

    /// @dev Emitted when a user pays for spins. Backend listens and grants spins in DB.
    ///      paymentCurrency: 0 = BNB, 1 = USDT, 2 = BFLAP
    event SpinsPurchased(
        address indexed buyer,
        uint8   indexed paymentCurrency,
        uint256         amountPaid
    );

    event Payout(
        address indexed winner,
        bytes32 indexed nonce,
        uint256 bnbAmount,
        uint256 usdtAmount,
        uint256 bflapAmount
    );

    event Deposited(address indexed depositor, uint8 currency, uint256 amount);
    event OwnerWithdraw(address indexed to, uint8 currency, uint256 amount);
    event Paused(address indexed by);
    event Unpaused(address indexed by);
    event BackendSignerUpdated(address oldSigner, address newSigner);
    event OwnershipTransferInitiated(address current, address proposed);
    event OwnershipTransferred(address previous, address newOwner);

    // ─── Modifiers ───────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAuthorized() {
        require(msg.sender == owner || msg.sender == backendSigner, "Not authorized");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Contract paused");
        _;
    }

    bool private _lock;
    modifier nonReentrant() {
        require(!_lock, "Reentrant");
        _lock = true;
        _;
        _lock = false;
    }

    // ─── Constructor ─────────────────────────────────────────

    constructor(
        address _bflapToken,
        address _usdtToken,
        address _backendSigner
    ) {
        require(_bflapToken    != address(0), "Bad BFLAP addr");
        require(_usdtToken     != address(0), "Bad USDT addr");
        require(_backendSigner != address(0), "Bad signer addr");

        owner         = msg.sender;
        bflapToken    = IERC20(_bflapToken);
        usdtToken     = IERC20(_usdtToken);
        backendSigner = _backendSigner;
    }

    // ================================================================
    //  SECTION 1 — SPIN PURCHASES
    //  No price enforcement here — the web app backend handles live pricing.
    //  Contract just collects payment and emits an event.
    //  Backend verifies the on-chain tx and grants spins accordingly.
    // ================================================================

    /**
     * @notice Pay for spins with BNB.
     *         Send any amount of BNB — backend calculates spin count from live price.
     */
    function purchaseSpinsBNB() external payable whenNotPaused {
        require(msg.value > 0, "Send BNB");
        totalCollectedBNB += msg.value;
        emit SpinsPurchased(msg.sender, 0, msg.value);
    }

    /**
     * @notice Pay for spins with USDT.
     *         Approve this contract first: usdtToken.approve(contractAddress, amount)
     * @param usdtAmount USDT amount in 18-decimal units
     */
    function purchaseSpinsUSDT(uint256 usdtAmount) external whenNotPaused {
        require(usdtAmount > 0, "Amount required");
        usdtToken.safeTransferFrom(msg.sender, address(this), usdtAmount);
        totalCollectedUSDT += usdtAmount;
        emit SpinsPurchased(msg.sender, 1, usdtAmount);
    }

    /**
     * @notice Pay for spins with BFLAP tokens.
     *         Approve this contract first: bflapToken.approve(contractAddress, amount)
     * @param bflapAmount BFLAP amount in 18-decimal units
     */
    function purchaseSpinsBFLAP(uint256 bflapAmount) external whenNotPaused {
        require(bflapAmount > 0, "Amount required");
        bflapToken.safeTransferFrom(msg.sender, address(this), bflapAmount);
        totalCollectedBFLAP += bflapAmount;
        emit SpinsPurchased(msg.sender, 2, bflapAmount);
    }

    // ================================================================
    //  SECTION 2 — OWNER DEPOSITS (top up the prize vault)
    // ================================================================

    /// @notice Receive BNB directly (e.g. direct transfer from owner wallet)
    receive() external payable {
        emit Deposited(msg.sender, 0, msg.value);
    }

    function depositBNB() external payable {
        require(msg.value > 0, "No BNB");
        emit Deposited(msg.sender, 0, msg.value);
    }

    function depositUSDT(uint256 amount) external {
        require(amount > 0, "No amount");
        usdtToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, 1, amount);
    }

    function depositBFLAP(uint256 amount) external {
        require(amount > 0, "No amount");
        bflapToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, 2, amount);
    }

    // ================================================================
    //  SECTION 3 — PAYOUT (backend calls this to send prizes to winners)
    // ================================================================

    /**
     * @notice Send prize to winner. Called by backendSigner after spin result.
     *
     * @param winner      Winner wallet address
     * @param bnbAmount   BNB prize in wei (0 if none)
     * @param usdtAmount  USDT prize in 18-dec units (0 if none)
     * @param bflapAmount BFLAP prize in 18-dec units (0 if none)
     * @param nonce       Unique bytes32 derived from the DB spin ID:
     *                    ethers.keccak256(ethers.toUtf8Bytes(spinId.toString()))
     *                    Prevents replay / double payout.
     */
    function payout(
        address winner,
        uint256 bnbAmount,
        uint256 usdtAmount,
        uint256 bflapAmount,
        bytes32 nonce
    ) external onlyAuthorized whenNotPaused nonReentrant {
        require(winner != address(0),                                "Bad winner");
        require(bnbAmount > 0 || usdtAmount > 0 || bflapAmount > 0, "No prize");
        require(!usedNonces[nonce],                                  "Nonce used");

        usedNonces[nonce] = true;

        if (bnbAmount > 0) {
            require(address(this).balance >= bnbAmount, "Vault low on BNB");
            (bool sent, ) = winner.call{value: bnbAmount}("");
            require(sent, "BNB send failed");
            totalPaidBNB   += bnbAmount;
            wonBNB[winner] += bnbAmount;
        }

        if (usdtAmount > 0) {
            require(usdtToken.balanceOf(address(this)) >= usdtAmount, "Vault low on USDT");
            usdtToken.safeTransfer(winner, usdtAmount);
            totalPaidUSDT   += usdtAmount;
            wonUSDT[winner] += usdtAmount;
        }

        if (bflapAmount > 0) {
            require(bflapToken.balanceOf(address(this)) >= bflapAmount, "Vault low on BFLAP");
            bflapToken.safeTransfer(winner, bflapAmount);
            totalPaidBFLAP   += bflapAmount;
            wonBFLAP[winner] += bflapAmount;
        }

        emit Payout(winner, nonce, bnbAmount, usdtAmount, bflapAmount);
    }

    // ================================================================
    //  SECTION 4 — OWNER WITHDRAWALS (emergency / profit extraction)
    // ================================================================

    function withdrawAll() external onlyOwner nonReentrant {
        uint256 bnb   = address(this).balance;
        uint256 usdt  = usdtToken.balanceOf(address(this));
        uint256 bflap = bflapToken.balanceOf(address(this));

        if (bnb > 0) {
            (bool ok, ) = owner.call{value: bnb}("");
            require(ok, "BNB fail");
            emit OwnerWithdraw(owner, 0, bnb);
        }
        if (usdt > 0) {
            usdtToken.safeTransfer(owner, usdt);
            emit OwnerWithdraw(owner, 1, usdt);
        }
        if (bflap > 0) {
            bflapToken.safeTransfer(owner, bflap);
            emit OwnerWithdraw(owner, 2, bflap);
        }
    }

    function withdrawBNB(uint256 amount) external onlyOwner nonReentrant {
        require(address(this).balance >= amount, "Low BNB");
        (bool ok, ) = owner.call{value: amount}("");
        require(ok, "BNB fail");
        emit OwnerWithdraw(owner, 0, amount);
    }

    function withdrawUSDT(uint256 amount) external onlyOwner nonReentrant {
        require(usdtToken.balanceOf(address(this)) >= amount, "Low USDT");
        usdtToken.safeTransfer(owner, amount);
        emit OwnerWithdraw(owner, 1, amount);
    }

    function withdrawBFLAP(uint256 amount) external onlyOwner nonReentrant {
        require(bflapToken.balanceOf(address(this)) >= amount, "Low BFLAP");
        bflapToken.safeTransfer(owner, amount);
        emit OwnerWithdraw(owner, 2, amount);
    }

    function recoverToken(address token, uint256 amount) external onlyOwner nonReentrant {
        IERC20(token).safeTransfer(owner, amount);
    }

    // ================================================================
    //  SECTION 5 — ADMIN CONFIG
    // ================================================================

    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function setBackendSigner(address _newSigner) external onlyOwner {
        require(_newSigner != address(0), "Bad addr");
        emit BackendSignerUpdated(backendSigner, _newSigner);
        backendSigner = _newSigner;
    }

    function setBFLAPToken(address _token) external onlyOwner {
        require(_token != address(0), "Bad addr");
        bflapToken = IERC20(_token);
    }

    function setUSDTToken(address _token) external onlyOwner {
        require(_token != address(0), "Bad addr");
        usdtToken = IERC20(_token);
    }

    function transferOwnership(address _new) external onlyOwner {
        require(_new != address(0), "Bad addr");
        pendingOwner = _new;
        emit OwnershipTransferInitiated(owner, _new);
    }

    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "Not pending owner");
        emit OwnershipTransferred(owner, pendingOwner);
        owner        = pendingOwner;
        pendingOwner = address(0);
    }

    // ================================================================
    //  SECTION 6 — VIEW FUNCTIONS
    // ================================================================

    function getVaultBalances() external view returns (uint256 bnb, uint256 usdt, uint256 bflap) {
        return (
            address(this).balance,
            usdtToken.balanceOf(address(this)),
            bflapToken.balanceOf(address(this))
        );
    }

    function getCollectedTotals() external view returns (uint256 bnb, uint256 usdt, uint256 bflap) {
        return (totalCollectedBNB, totalCollectedUSDT, totalCollectedBFLAP);
    }

    function getPaidTotals() external view returns (uint256 bnb, uint256 usdt, uint256 bflap) {
        return (totalPaidBNB, totalPaidUSDT, totalPaidBFLAP);
    }

    function getWinnerStats(address _wallet) external view returns (uint256 bnb, uint256 usdt, uint256 bflap) {
        return (wonBNB[_wallet], wonUSDT[_wallet], wonBFLAP[_wallet]);
    }

    function isNonceUsed(bytes32 nonce) external view returns (bool) {
        return usedNonces[nonce];
    }
}
