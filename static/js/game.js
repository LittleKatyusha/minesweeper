// Game Constants
const BOARD_SIZE = 25;
const TOTAL_MINES = 120;
const TIME_LIMIT = 600; // 10 minutes in seconds
const LONG_PRESS_DURATION = 500; // ms for long press to flag

// Game State Variables
let sessionId = null;
let gameActive = false;
let timerInterval = null;
let timeRemaining = TIME_LIMIT;
let flagCount = 0;
let revealedCount = 0;
let board = []; // 2D array to track cell states

// Touch/Mobile State
let touchStartTime = 0;
let touchTimer = null;
let currentTouchCell = null;
let isMobile = false;
let currentZoom = 100;
const ZOOM_STEP = 10;
const MIN_ZOOM = 60;
const MAX_ZOOM = 120;

// Mobile Mode Toggle (reveal or flag)
let currentMode = 'reveal'; // 'reveal' or 'flag'

// DOM Elements
const boardElement = document.getElementById('board');
const minesRemainingElement = document.getElementById('mines-remaining');
const timeElement = document.getElementById('time');
const statusMessage = document.getElementById('status-message');
const keyDisplay = document.getElementById('key-display');
const keyValue = document.getElementById('key-value');
const newGameBtn = document.getElementById('new-game-btn');
const copyBtn = document.getElementById('copy-btn');
const proxyLink = document.getElementById('proxy-link');

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Detect mobile device
    isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    // Initialize mode toggle for mobile
    initModeToggle();
    
    // Initialize zoom controls
    initZoomControls();
    
    // Start game
    initGame();
});

newGameBtn.addEventListener('click', initGame);
copyBtn.addEventListener('click', copyKey);

/**
 * Initialize mode toggle buttons for mobile (Reveal/Flag)
 */
function initModeToggle() {
    const modeReveal = document.getElementById('mode-reveal');
    const modeFlag = document.getElementById('mode-flag');
    
    if (modeReveal && modeFlag) {
        modeReveal.addEventListener('click', () => {
            currentMode = 'reveal';
            modeReveal.classList.add('active');
            modeFlag.classList.remove('active');
        });
        
        modeFlag.addEventListener('click', () => {
            currentMode = 'flag';
            modeFlag.classList.add('active');
            modeReveal.classList.remove('active');
        });
    }
}

/**
 * Initialize zoom controls for mobile
 */
function initZoomControls() {
    const zoomIn = document.getElementById('zoom-in');
    const zoomOut = document.getElementById('zoom-out');
    const zoomReset = document.getElementById('zoom-reset');
    const zoomLevelEl = document.getElementById('zoom-level');
    
    if (zoomIn && zoomOut) {
        zoomIn.addEventListener('click', () => {
            if (currentZoom < MAX_ZOOM) {
                currentZoom += ZOOM_STEP;
                applyZoom();
            }
        });
        
        zoomOut.addEventListener('click', () => {
            if (currentZoom > MIN_ZOOM) {
                currentZoom -= ZOOM_STEP;
                applyZoom();
            }
        });
    }
    
    if (zoomReset) {
        zoomReset.addEventListener('click', () => {
            currentZoom = 100;
            applyZoom();
            // Scroll board to center
            const boardWrapper = document.getElementById('board-wrapper');
            if (boardWrapper) {
                boardWrapper.scrollLeft = 0;
                boardWrapper.scrollTop = 0;
            }
        });
    }
    
    // Set initial zoom based on screen width (keep board same size, just adjust initial view)
    if (window.innerWidth <= 400) {
        currentZoom = 80;
    } else if (window.innerWidth <= 600) {
        currentZoom = 90;
    }
    applyZoom();
    
    // Initialize navigation controls
    initNavControls();
}

/**
 * Initialize navigation controls (D-pad) for mobile
 */
function initNavControls() {
    const boardWrapper = document.getElementById('board-wrapper');
    const navUp = document.getElementById('nav-up');
    const navDown = document.getElementById('nav-down');
    const navLeft = document.getElementById('nav-left');
    const navRight = document.getElementById('nav-right');
    const navCenter = document.getElementById('nav-center');
    
    const SCROLL_AMOUNT = 100; // pixels to scroll per click
    
    if (!boardWrapper) return;
    
    if (navUp) {
        navUp.addEventListener('click', () => {
            boardWrapper.scrollBy({ top: -SCROLL_AMOUNT, behavior: 'smooth' });
        });
    }
    
    if (navDown) {
        navDown.addEventListener('click', () => {
            boardWrapper.scrollBy({ top: SCROLL_AMOUNT, behavior: 'smooth' });
        });
    }
    
    if (navLeft) {
        navLeft.addEventListener('click', () => {
            boardWrapper.scrollBy({ left: -SCROLL_AMOUNT, behavior: 'smooth' });
        });
    }
    
    if (navRight) {
        navRight.addEventListener('click', () => {
            boardWrapper.scrollBy({ left: SCROLL_AMOUNT, behavior: 'smooth' });
        });
    }
    
    if (navCenter) {
        navCenter.addEventListener('click', () => {
            // Scroll to center of board
            const boardEl = document.getElementById('board');
            if (boardEl) {
                const centerX = (boardEl.scrollWidth - boardWrapper.clientWidth) / 2;
                const centerY = (boardEl.scrollHeight - boardWrapper.clientHeight) / 2;
                boardWrapper.scrollTo({ left: centerX, top: centerY, behavior: 'smooth' });
            }
        });
    }
}

/**
 * Apply zoom level to the board using CSS transform
 */
function applyZoom() {
    const zoomLevelEl = document.getElementById('zoom-level');
    const boardEl = document.getElementById('board');
    
    if (boardEl) {
        const scale = currentZoom / 100;
        boardEl.style.transform = `scale(${scale})`;
        boardEl.style.transformOrigin = 'top left';
    }
    
    if (zoomLevelEl) {
        zoomLevelEl.textContent = `${currentZoom}%`;
    }
}

/**
 * Initialize a new game
 */
async function initGame() {
    // Reset state variables
    gameActive = false;
    flagCount = 0;
    revealedCount = 0;
    timeRemaining = TIME_LIMIT;
    
    // Stop any existing timer
    stopTimer();
    
    // Remove warning class from timer
    document.getElementById('timer').classList.remove('warning');
    
    // Reset UI
    updateMinesDisplay();
    updateTimerDisplay();
    hideKeyDisplay();
    showMessage('');
    
    // Initialize board state
    initBoardState();
    
    // Clear and create board
    createBoard();
    
    try {
        // Call API to get new session
        const data = await apiNewGame();
        sessionId = data.session_id;
        gameActive = true;
        
        // Start timer
        startTimer();
        
        showMessage('Game started! Good luck!');
    } catch (error) {
        showMessage('Failed to start game. Please try again.', true);
        console.error('Error starting game:', error);
    }
}

/**
 * Initialize board state array
 */
function initBoardState() {
    board = [];
    for (let x = 0; x < BOARD_SIZE; x++) {
        board[x] = [];
        for (let y = 0; y < BOARD_SIZE; y++) {
            board[x][y] = { revealed: false, flagged: false, adjacent: 0 };
        }
    }
}

/**
 * Create the game board with cell elements
 */
function createBoard() {
    boardElement.innerHTML = '';
    
    for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.x = x;
            cell.dataset.y = y;
            
            // Left click to reveal (desktop)
            cell.addEventListener('click', (e) => {
                e.preventDefault();
                // Only handle if not from touch
                if (!isMobile) {
                    handleCellClick(x, y);
                }
            });
            
            // Right click to flag (desktop)
            cell.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                handleRightClick(x, y);
            });
            
            // Touch events for mobile
            cell.addEventListener('touchstart', (e) => {
                e.preventDefault();
                handleTouchStart(x, y, cell);
            }, { passive: false });
            
            cell.addEventListener('touchend', (e) => {
                e.preventDefault();
                handleTouchEnd(x, y);
            }, { passive: false });
            
            cell.addEventListener('touchmove', (e) => {
                // Cancel long press if finger moves
                handleTouchCancel();
            }, { passive: true });
            
            cell.addEventListener('touchcancel', (e) => {
                handleTouchCancel();
            });
            
            boardElement.appendChild(cell);
        }
    }
}

/**
 * Handle touch start (for mobile)
 */
function handleTouchStart(x, y, cell) {
    touchStartTime = Date.now();
    currentTouchCell = cell;
    
    // Visual feedback
    cell.classList.add('pressing');
}

/**
 * Handle touch end - use mode toggle for action
 */
function handleTouchEnd(x, y) {
    // Remove visual feedback
    if (currentTouchCell) {
        currentTouchCell.classList.remove('pressing');
    }
    
    // Perform action based on current mode
    if (currentTouchCell) {
        if (currentMode === 'flag') {
            // Flag mode - toggle flag
            handleRightClick(x, y);
            // Vibrate feedback
            if (navigator.vibrate) {
                navigator.vibrate(30);
            }
        } else {
            // Reveal mode - reveal cell
            handleCellClick(x, y);
        }
    }
    
    currentTouchCell = null;
}

/**
 * Handle touch cancel (finger moved or interrupted)
 */
function handleTouchCancel() {
    if (currentTouchCell) {
        currentTouchCell.classList.remove('pressing');
        currentTouchCell = null;
    }
}

/**
 * Handle left click on a cell (reveal)
 */
async function handleCellClick(x, y) {
    if (!gameActive) return;
    
    const cellState = board[x][y];
    if (cellState.revealed || cellState.flagged) return;
    
    try {
        const data = await apiClick(x, y);
        
        if (data.result === 'boom') {
            // Game over - hit a mine
            revealAllMines(data.mines);
            gameOver(false);
        } else if (data.result === 'safe') {
            // Safe click - handle revealed cells
            handleRevealResponse(data);
        }
    } catch (error) {
        showMessage('Error processing click. Please try again.', true);
        console.error('Error on click:', error);
    }
}

/**
 * Handle right click on a cell (flag/unflag)
 */
async function handleRightClick(x, y) {
    if (!gameActive) return;
    
    const cellState = board[x][y];
    if (cellState.revealed) return;
    
    const cell = getCell(x, y);
    
    try {
        const data = await apiFlag(x, y);
        
        if (data.success) {
            if (data.flagged) {
                cellState.flagged = true;
                cell.classList.add('flagged');
                cell.textContent = '🚩';
                flagCount++;
            } else {
                cellState.flagged = false;
                cell.classList.remove('flagged');
                cell.textContent = '';
                flagCount--;
            }
        }
        
        updateMinesDisplay();
    } catch (error) {
        showMessage('Error toggling flag. Please try again.', true);
        console.error('Error on flag:', error);
    }
}

/**
 * Handle reveal response from server (flood fill)
 */
function handleRevealResponse(data) {
    if (data.revealed && data.revealed.length > 0) {
        data.revealed.forEach(cellData => {
            // Server returns {x, y, adjacent} objects
            const x = cellData.x;
            const y = cellData.y;
            const adjacent = cellData.adjacent;
            revealCell(x, y, adjacent);
        });
    }
    
    // Check win after each reveal
    checkWin();
}

/**
 * Reveal a single cell
 */
function revealCell(x, y, adjacent) {
    const cellState = board[x][y];
    if (cellState.revealed) return;
    
    cellState.revealed = true;
    cellState.adjacent = adjacent;
    revealedCount++;
    
    const cell = getCell(x, y);
    cell.classList.add('revealed');
    cell.classList.remove('flagged');
    
    // Remove flag if it was flagged
    if (cellState.flagged) {
        cellState.flagged = false;
        flagCount--;
        updateMinesDisplay();
    }
    
    // Display adjacent mine count
    if (adjacent > 0) {
        cell.textContent = adjacent;
        cell.classList.add(`num-${adjacent}`);
    } else {
        cell.textContent = '';
    }
}

/**
 * Reveal all mines (on game over)
 */
function revealAllMines(mines) {
    if (!mines) return;
    
    mines.forEach(mine => {
        const [x, y] = mine;
        const cell = getCell(x, y);
        cell.classList.add('mine');
        cell.textContent = '💣';
    });
}

/**
 * Check if the player has won
 */
async function checkWin() {
    if (!gameActive) return;
    
    try {
        const data = await apiCheckWin();
        
        if (data.won) {
            gameOver(true, data.key);
        }
    } catch (error) {
        console.error('Error checking win:', error);
    }
}

/**
 * Handle game over (win or lose)
 */
function gameOver(isWin, key = null) {
    stopTimer();
    gameActive = false;
    
    if (isWin) {
        showMessage('🎉 Congratulations! You won!');
        showKeyDisplay(key);
    } else {
        showMessage('💥 Game Over! You hit a mine!', true);
    }
}

// Timer Functions

/**
 * Start the game timer (countdown from 6 minutes)
 */
function startTimer() {
    timeRemaining = TIME_LIMIT;
    updateTimerDisplay();
    timerInterval = setInterval(() => {
        timeRemaining--;
        updateTimerDisplay();
        
        // Check if time is up
        if (timeRemaining <= 0) {
            timeOut();
        }
        
        // Warning when time is almost up (last 30 seconds)
        if (timeRemaining <= 30) {
            document.getElementById('timer').classList.add('warning');
        }
    }, 1000);
}

/**
 * Stop the game timer
 */
function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

/**
 * Update the timer display
 */
function updateTimerDisplay() {
    const mins = Math.floor(timeRemaining / 60).toString().padStart(2, '0');
    const secs = (timeRemaining % 60).toString().padStart(2, '0');
    timeElement.textContent = `${mins}:${secs}`;
}

/**
 * Handle timeout - game auto-restarts
 */
function timeOut() {
    stopTimer();
    gameActive = false;
    showMessage('⏰ TIME\'S UP! Game will restart...', true);
    
    // Auto restart after 2 seconds
    setTimeout(() => {
        initGame();
    }, 2000);
}

// API Functions

/**
 * Call API to start a new game
 */
async function apiNewGame() {
    const response = await fetch('/api/new-game', { method: 'POST' });
    if (!response.ok) {
        throw new Error('Failed to create new game');
    }
    return await response.json();
}

/**
 * Call API to click a cell
 */
async function apiClick(x, y) {
    const response = await fetch('/api/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, x, y })
    });
    if (!response.ok) {
        throw new Error('Failed to process click');
    }
    return await response.json();
}

/**
 * Call API to flag/unflag a cell
 */
async function apiFlag(x, y) {
    const response = await fetch('/api/flag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, x, y })
    });
    if (!response.ok) {
        throw new Error('Failed to toggle flag');
    }
    return await response.json();
}

/**
 * Call API to check if player has won
 */
async function apiCheckWin() {
    const response = await fetch(`/api/check-win?session_id=${sessionId}`);
    if (!response.ok) {
        throw new Error('Failed to check win status');
    }
    return await response.json();
}

// Utility Functions

/**
 * Get a cell element by coordinates
 */
function getCell(x, y) {
    return document.querySelector(`[data-x="${x}"][data-y="${y}"]`);
}

/**
 * Show a status message
 */
function showMessage(msg, isError = false) {
    statusMessage.textContent = msg;
    statusMessage.style.color = isError ? '#ff4444' : '#44ff44';
}

/**
 * Update the mines remaining display
 */
function updateMinesDisplay() {
    const remaining = TOTAL_MINES - flagCount;
    minesRemainingElement.textContent = remaining.toString().padStart(3, '0');
}

/**
 * Show the key display with the winning key
 */
function showKeyDisplay(key) {
    if (key && keyDisplay && keyValue) {
        keyValue.textContent = key;
        keyDisplay.style.display = 'block';
        
        // Update proxy link if it exists
        if (proxyLink) {
            proxyLink.href = `https://lmarena.ai/?key=${encodeURIComponent(key)}`;
        }
    }
}

/**
 * Hide the key display
 */
function hideKeyDisplay() {
    if (keyDisplay) {
        keyDisplay.style.display = 'none';
    }
    if (keyValue) {
        keyValue.textContent = '';
    }
}

/**
 * Copy the key to clipboard
 */
function copyKey() {
    if (!keyValue || !keyValue.textContent) return;
    
    navigator.clipboard.writeText(keyValue.textContent)
        .then(() => {
            if (copyBtn) {
                copyBtn.textContent = '✅ Copied!';
                setTimeout(() => {
                    copyBtn.textContent = '📋 Copy';
                }, 2000);
            }
        })
        .catch(err => {
            console.error('Failed to copy:', err);
            showMessage('Failed to copy key', true);
        });
}