
// Chess Game - JavaScript Logic
// Complete chess implementation with MAXIMUM DIFFICULTY AI opponent

// ============================================
// CONSTANTS AND CONFIGURATION
// ============================================

const BOARD_SIZE = 8;
const PIECES = {
    WHITE_KING: '♔',
    WHITE_QUEEN: '♕',
    WHITE_ROOK: '♖',
    WHITE_BISHOP: '♗',
    WHITE_KNIGHT: '♘',
    WHITE_PAWN: '♙',
    BLACK_KING: '♚',
    BLACK_QUEEN: '♛',
    BLACK_ROOK: '♜',
    BLACK_BISHOP: '♝',
    BLACK_KNIGHT: '♞',
    BLACK_PAWN: '♟'
};

const PIECE_VALUES = {
    'p': 100,
    'n': 320,
    'b': 330,
    'r': 500,
    'q': 900,
    'k': 20000
};

// AI Configuration - STOCKFISH POWERED
const AI_DEPTH = 6; // Fallback depth if Stockfish unavailable
const QUIESCENCE_DEPTH = 4;
const AI_TIME_LIMIT = 1500; // Max 1.5 seconds per move
const STOCKFISH_DEPTH = 15; // Stockfish search depth
const STOCKFISH_TIME = 1000; // Stockfish time limit in ms
const USE_STOCKFISH = true; // Enable Stockfish engine
const USE_ITERATIVE_DEEPENING = true;
const USE_TRANSPOSITION_TABLE = true;
const USE_KILLER_MOVES = true;
const USE_NULL_MOVE_PRUNING = true;
const USE_ASPIRATION_WINDOWS = true;

// Stockfish engine
let stockfish = null;
let stockfishReady = false;
let stockfishResolve = null;

// Transposition table and search helpers
let transpositionTable = new Map();
let killerMoves = [];
let historyTable = {};
let nodesSearched = 0;
let searchStartTime = 0;
let searchAborted = false;

// Initialize Stockfish
function initStockfish() {
    if (!USE_STOCKFISH) {
        console.log('🔧 Stockfish disabled in configuration');
        return;
    }
    
    console.log('🔄 Initializing Stockfish engine...');
    
    try {
        // Load Stockfish from local file
        stockfish = new Worker('/static/js/stockfish.js');
        console.log('✅ Stockfish Worker created successfully');
        
        stockfish.onmessage = function(event) {
            const message = event.data;
            console.log('📨 Stockfish:', message);
            
            if (message === 'uciok') {
                console.log('✅ Stockfish UCI protocol initialized');
                stockfish.postMessage('isready');
            } else if (message === 'readyok') {
                stockfishReady = true;
                console.log('🎉 Stockfish engine ready! AI is now at GRANDMASTER level!');
            } else if (message.startsWith('bestmove')) {
                const parts = message.split(' ');
                const bestMove = parts[1];
                console.log('🎯 Stockfish best move:', bestMove);
                if (stockfishResolve && bestMove && bestMove !== '(none)') {
                    stockfishResolve(bestMove);
                    stockfishResolve = null;
                }
            } else if (message.startsWith('info')) {
                // Log search info (depth, score, etc.)
                if (message.includes('depth') && message.includes('score')) {
                    const depthMatch = message.match(/depth (\d+)/);
                    const scoreMatch = message.match(/score (cp|mate) (-?\d+)/);
                    if (depthMatch && scoreMatch) {
                        const depth = depthMatch[1];
                        const scoreType = scoreMatch[1];
                        const scoreValue = scoreMatch[2];
                        if (scoreType === 'mate') {
                            console.log(`📊 Depth ${depth}: Mate in ${scoreValue}`);
                        } else {
                            console.log(`📊 Depth ${depth}: Score ${(parseInt(scoreValue) / 100).toFixed(2)}`);
                        }
                    }
                }
            }
        };
        
        stockfish.onerror = function(error) {
            console.error('❌ Stockfish Worker error:', error);
            console.log('⚠️ Falling back to built-in AI engine');
            stockfishReady = false;
        };
        
        // Initialize UCI protocol
        console.log('🔄 Sending UCI initialization...');
        stockfish.postMessage('uci');
        
        // Set options for stronger play
        setTimeout(() => {
            if (stockfish && stockfishReady) {
                console.log('⚙️ Configuring Stockfish for maximum strength...');
                stockfish.postMessage('setoption name Skill Level value 20');
                stockfish.postMessage('setoption name Contempt value 50');
                console.log('✅ Stockfish configured: Skill Level 20, Contempt 50');
            }
        }, 1000);
        
    } catch (error) {
        console.error('❌ Failed to initialize Stockfish:', error);
        console.log('⚠️ Falling back to built-in AI engine');
        stockfishReady = false;
    }
}

// Convert board to FEN notation
function boardToFEN(boardState) {
    let fen = '';
    
    for (let row = 0; row < 8; row++) {
        let empty = 0;
        for (let col = 0; col < 8; col++) {
            const piece = boardState[row][col];
            if (piece) {
                if (empty > 0) {
                    fen += empty;
                    empty = 0;
                }
                fen += piece;
            } else {
                empty++;
            }
        }
        if (empty > 0) fen += empty;
        if (row < 7) fen += '/';
    }
    
    // Add turn
    fen += ' ' + (currentTurn === 'white' ? 'w' : 'b');
    
    // Add castling rights
    let castling = '';
    if (!whiteKingMoved) {
        if (!whiteRookKingsideMoved) castling += 'K';
        if (!whiteRookQueensideMoved) castling += 'Q';
    }
    if (!blackKingMoved) {
        if (!blackRookKingsideMoved) castling += 'k';
        if (!blackRookQueensideMoved) castling += 'q';
    }
    fen += ' ' + (castling || '-');
    
    // Add en passant
    if (enPassantTarget) {
        const files = 'abcdefgh';
        const ranks = '87654321';
        fen += ' ' + files[enPassantTarget.col] + ranks[enPassantTarget.row];
    } else {
        fen += ' -';
    }
    
    // Add halfmove and fullmove clocks
    fen += ' 0 ' + Math.floor(moveHistory.length / 2 + 1);
    
    return fen;
}

// Parse Stockfish move (e.g., "e2e4" or "e7e8q")
function parseStockfishMove(moveStr, boardState) {
    if (!moveStr || moveStr.length < 4) return null;
    
    const files = 'abcdefgh';
    const ranks = '87654321';
    
    const fromCol = files.indexOf(moveStr[0]);
    const fromRow = ranks.indexOf(moveStr[1]);
    const toCol = files.indexOf(moveStr[2]);
    const toRow = ranks.indexOf(moveStr[3]);
    
    if (fromCol < 0 || fromRow < 0 || toCol < 0 || toRow < 0) return null;
    
    const piece = boardState[fromRow][fromCol];
    if (!piece) return null;
    
    // Get valid moves to find the matching move info
    const validMoves = getValidMoves(fromRow, fromCol, boardState, true);
    const moveInfo = validMoves.find(m => m.row === toRow && m.col === toCol);
    
    if (!moveInfo) return null;
    
    // Handle promotion
    if (moveStr.length === 5) {
        moveInfo.promotion = moveStr[4];
    }
    
    return {
        fromRow, fromCol, toRow, toCol,
        moveInfo
    };
}

// Get best move from Stockfish
async function getStockfishMove(boardState) {
    if (!stockfishReady || !stockfish) {
        console.log('⚠️ Stockfish not ready, using fallback AI');
        return null;
    }
    
    console.log('🤔 Stockfish is analyzing position...');
    
    return new Promise((resolve) => {
        stockfishResolve = (moveStr) => {
            const move = parseStockfishMove(moveStr, boardState);
            resolve(move);
        };
        
        // Set timeout in case Stockfish doesn't respond
        setTimeout(() => {
            if (stockfishResolve) {
                console.log('⏱️ Stockfish timeout, using fallback');
                stockfishResolve = null;
                resolve(null);
            }
        }, STOCKFISH_TIME + 500);
        
        const fen = boardToFEN(boardState);
        console.log('📋 Position FEN:', fen);
        stockfish.postMessage('position fen ' + fen);
        stockfish.postMessage('go depth ' + STOCKFISH_DEPTH + ' movetime ' + STOCKFISH_TIME);
    });
}

// Position bonus tables for piece-square evaluation
const PAWN_TABLE = [
    [0,  0,  0,  0,  0,  0,  0,  0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [5,  5, 10, 25, 25, 10,  5,  5],
    [0,  0,  0, 20, 20,  0,  0,  0],
    [5, -5,-10,  0,  0,-10, -5,  5],
    [5, 10, 10,-20,-20, 10, 10,  5],
    [0,  0,  0,  0,  0,  0,  0,  0]
];

const KNIGHT_TABLE = [
    [-50,-40,-30,-30,-30,-30,-40,-50],
    [-40,-20,  0,  0,  0,  0,-20,-40],
    [-30,  0, 10, 15, 15, 10,  0,-30],
    [-30,  5, 15, 20, 20, 15,  5,-30],
    [-30,  0, 15, 20, 20, 15,  0,-30],
    [-30,  5, 10, 15, 15, 10,  5,-30],
    [-40,-20,  0,  5,  5,  0,-20,-40],
    [-50,-40,-30,-30,-30,-30,-40,-50]
];

const BISHOP_TABLE = [
    [-20,-10,-10,-10,-10,-10,-10,-20],
    [-10,  0,  0,  0,  0,  0,  0,-10],
    [-10,  0,  5, 10, 10,  5,  0,-10],
    [-10,  5,  5, 10, 10,  5,  5,-10],
    [-10,  0, 10, 10, 10, 10,  0,-10],
    [-10, 10, 10, 10, 10, 10, 10,-10],
    [-10,  5,  0,  0,  0,  0,  5,-10],
    [-20,-10,-10,-10,-10,-10,-10,-20]
];

const ROOK_TABLE = [
    [0,  0,  0,  0,  0,  0,  0,  0],
    [5, 10, 10, 10, 10, 10, 10,  5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [0,  0,  0,  5,  5,  0,  0,  0]
];

const QUEEN_TABLE = [
    [-20,-10,-10, -5, -5,-10,-10,-20],
    [-10,  0,  0,  0,  0,  0,  0,-10],
    [-10,  0,  5,  5,  5,  5,  0,-10],
    [-5,  0,  5,  5,  5,  5,  0, -5],
    [0,  0,  5,  5,  5,  5,  0, -5],
    [-10,  5,  5,  5,  5,  5,  0,-10],
    [-10,  0,  5,  0,  0,  0,  0,-10],
    [-20,-10,-10, -5, -5,-10,-10,-20]
];

const KING_TABLE = [
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-20,-30,-30,-40,-40,-30,-30,-20],
    [-10,-20,-20,-20,-20,-20,-20,-10],
    [20, 20,  0,  0,  0,  0, 20, 20],
    [20, 30, 10,  0,  0, 10, 30, 20]
];

const KING_ENDGAME_TABLE = [
    [-50,-40,-30,-20,-20,-30,-40,-50],
    [-30,-20,-10,  0,  0,-10,-20,-30],
    [-30,-10, 20, 30, 30, 20,-10,-30],
    [-30,-10, 30, 40, 40, 30,-10,-30],
    [-30,-10, 30, 40, 40, 30,-10,-30],
    [-30,-10, 20, 30, 30, 20,-10,-30],
    [-30,-30,  0,  0,  0,  0,-30,-30],
    [-50,-30,-30,-30,-30,-30,-30,-50]
];

const PASSED_PAWN_BONUS = [0, 120, 80, 50, 30, 15, 15, 0];

// ============================================
// OPENING BOOK - Strong opening moves for Black
// ============================================
const OPENING_BOOK = {
    // Response to 1.e4
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR': [
        { from: [1, 4], to: [3, 4] }, // e5 - Open Game
        { from: [1, 2], to: [2, 2] }, // c6 - Caro-Kann
        { from: [1, 4], to: [2, 4] }, // e6 - French Defense
        { from: [1, 2], to: [3, 2] }, // c5 - Sicilian Defense
    ],
    // Response to 1.d4
    'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR': [
        { from: [1, 3], to: [3, 3] }, // d5 - Closed Game
        { from: [0, 6], to: [2, 5] }, // Nf6 - Indian Defense
        { from: [1, 4], to: [2, 4] }, // e6 - Queen's Gambit Declined setup
    ],
    // Response to 1.c4 (English)
    'rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR': [
        { from: [1, 4], to: [3, 4] }, // e5
        { from: [0, 6], to: [2, 5] }, // Nf6
        { from: [1, 2], to: [3, 2] }, // c5 - Symmetrical
    ],
    // Response to 1.Nf3
    'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R': [
        { from: [1, 3], to: [3, 3] }, // d5
        { from: [0, 6], to: [2, 5] }, // Nf6
    ],
    // After 1.e4 e5 2.Nf3
    'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R': [
        { from: [0, 1], to: [2, 2] }, // Nc6
    ],
    // After 1.e4 c5 (Sicilian) 2.Nf3
    'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R': [
        { from: [1, 3], to: [2, 3] }, // d6
        { from: [0, 1], to: [2, 2] }, // Nc6
        { from: [1, 4], to: [2, 4] }, // e6
    ],
    // After 1.d4 d5 2.c4 (Queen's Gambit)
    'rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR': [
        { from: [1, 4], to: [2, 4] }, // e6 - QGD
        { from: [1, 2], to: [2, 2] }, // c6 - Slav
    ],
    // After 1.d4 Nf6 2.c4
    'rnbqkb1r/pppppppp/5n2/8/2PP4/8/PP2PPPP/RNBQKBNR': [
        { from: [1, 4], to: [2, 4] }, // e6 - Nimzo/QID setup
        { from: [1, 6], to: [2, 6] }, // g6 - King's Indian
    ],
};

// ============================================
// GAME STATE
// ============================================

let board = [];
let currentTurn = 'white';
let selectedCell = null;
let validMoves = [];
let moveHistory = [];
let capturedWhite = [];
let capturedBlack = [];
let gameOver = false;
let lastMove = null;
let whiteKingMoved = false;
let blackKingMoved = false;
let whiteRookKingsideMoved = false;
let whiteRookQueensideMoved = false;
let blackRookKingsideMoved = false;
let blackRookQueensideMoved = false;
let enPassantTarget = null;
let promotionPending = null;

// DOM Elements
const boardElement = document.getElementById('board');
const statusText = document.getElementById('status-text');
const currentTurnElement = document.getElementById('current-turn');
const whiteCapturedElement = document.getElementById('white-captured');
const blackCapturedElement = document.getElementById('black-captured');
const movesListElement = document.getElementById('moves-list');
const newGameBtn = document.getElementById('new-game-btn');
const keyDisplay = document.getElementById('key-display');
const keyValue = document.getElementById('key-value');
const copyBtn = document.getElementById('copy-btn');
const proxyLink = document.getElementById('proxy-link');
const promotionModal = document.getElementById('promotion-modal');

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    initGame();
    setupEventListeners();
});

function setupEventListeners() {
    newGameBtn.addEventListener('click', initGame);
    copyBtn.addEventListener('click', copyKey);
    
    document.querySelectorAll('.promotion-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            handlePromotion(btn.dataset.piece);
        });
    });
}

function initGame() {
    board = createInitialBoard();
    currentTurn = 'white';
    selectedCell = null;
    validMoves = [];
    moveHistory = [];
    capturedWhite = [];
    capturedBlack = [];
    gameOver = false;
    lastMove = null;
    whiteKingMoved = false;
    blackKingMoved = false;
    whiteRookKingsideMoved = false;
    whiteRookQueensideMoved = false;
    blackRookKingsideMoved = false;
    blackRookQueensideMoved = false;
    enPassantTarget = null;
    promotionPending = null;
    
    // Reset AI state
    transpositionTable.clear();
    killerMoves = [];
    historyTable = {};
    
    // Initialize Stockfish if not already done
    if (USE_STOCKFISH && !stockfish) {
        initStockfish();
    }
    
    hideKeyDisplay();
    updateStatus('Your turn - Select a piece to move');
    updateTurnIndicator();
    updateCapturedPieces();
    updateMoveHistory();
    renderBoard();
}

function createInitialBoard() {
    return [
        ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
        ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
        [null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null],
        ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
        ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
    ];
}

// ============================================
// BOARD RENDERING
// ============================================

function renderBoard() {
    boardElement.innerHTML = '';
    
    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.classList.add((row + col) % 2 === 0 ? 'light' : 'dark');
            cell.dataset.row = row;
            cell.dataset.col = col;
            
            if (lastMove && 
                ((lastMove.fromRow === row && lastMove.fromCol === col) ||
                 (lastMove.toRow === row && lastMove.toCol === col))) {
                cell.classList.add('last-move');
            }
            
            const piece = board[row][col];
            if (piece) {
                const pieceElement = document.createElement('span');
                pieceElement.className = 'piece';
                pieceElement.classList.add(isWhitePiece(piece) ? 'white' : 'black');
                pieceElement.textContent = getPieceSymbol(piece);
                cell.appendChild(pieceElement);
                
                if (piece.toLowerCase() === 'k') {
                    const color = isWhitePiece(piece) ? 'white' : 'black';
                    if (isInCheck(color, board)) {
                        cell.classList.add('check');
                    }
                }
            }
            
            if (selectedCell && selectedCell.row === row && selectedCell.col === col) {
                cell.classList.add('selected');
            }
            
            if (validMoves.some(m => m.row === row && m.col === col)) {
                cell.classList.add('valid-move');
                if (board[row][col]) {
                    cell.classList.add('has-piece');
                }
            }
            
            cell.addEventListener('click', () => handleCellClick(row, col));
            boardElement.appendChild(cell);
        }
    }
}

function getPieceSymbol(piece) {
    const symbols = {
        'K': PIECES.WHITE_KING, 'Q': PIECES.WHITE_QUEEN, 'R': PIECES.WHITE_ROOK,
        'B': PIECES.WHITE_BISHOP, 'N': PIECES.WHITE_KNIGHT, 'P': PIECES.WHITE_PAWN,
        'k': PIECES.BLACK_KING, 'q': PIECES.BLACK_QUEEN, 'r': PIECES.BLACK_ROOK,
        'b': PIECES.BLACK_BISHOP, 'n': PIECES.BLACK_KNIGHT, 'p': PIECES.BLACK_PAWN
    };
    return symbols[piece] || '';
}

function isWhitePiece(piece) {
    return piece === piece.toUpperCase();
}

// ============================================
// GAME LOGIC - MOVE HANDLING
// ============================================

function handleCellClick(row, col) {
    if (gameOver || currentTurn !== 'white') return;
    
    const piece = board[row][col];
    
    if (selectedCell) {
        const move = validMoves.find(m => m.row === row && m.col === col);
        if (move) {
            makeMove(selectedCell.row, selectedCell.col, row, col, move);
            return;
        }
        
        if (piece && isWhitePiece(piece)) {
            selectPiece(row, col);
            return;
        }
        
        deselectPiece();
        return;
    }
    
    if (piece && isWhitePiece(piece)) {
        selectPiece(row, col);
    }
}

function selectPiece(row, col) {
    selectedCell = { row, col };
    validMoves = getValidMoves(row, col, board, true);
    renderBoard();
}

function deselectPiece() {
    selectedCell = null;
    validMoves = [];
    renderBoard();
}

function makeMove(fromRow, fromCol, toRow, toCol, moveInfo) {
    const piece = board[fromRow][fromCol];
    const capturedPiece = board[toRow][toCol];
    
    if (moveInfo && moveInfo.enPassant) {
        const capturedPawnRow = currentTurn === 'white' ? toRow + 1 : toRow - 1;
        const capturedPawn = board[capturedPawnRow][toCol];
        if (currentTurn === 'white') {
            capturedBlack.push(capturedPawn);
        } else {
            capturedWhite.push(capturedPawn);
        }
        board[capturedPawnRow][toCol] = null;
    }
    
    if (moveInfo && moveInfo.castling) {
        if (moveInfo.castling === 'kingside') {
            board[toRow][5] = board[toRow][7];
            board[toRow][7] = null;
        } else {
            board[toRow][3] = board[toRow][0];
            board[toRow][0] = null;
        }
    }
    
    if (capturedPiece) {
        if (isWhitePiece(capturedPiece)) {
            capturedWhite.push(capturedPiece);
        } else {
            capturedBlack.push(capturedPiece);
        }
    }
    
    board[toRow][toCol] = piece;
    board[fromRow][fromCol] = null;
    
    updateCastlingRights(piece, fromRow, fromCol);
    
    enPassantTarget = null;
    if (piece.toLowerCase() === 'p' && Math.abs(toRow - fromRow) === 2) {
        enPassantTarget = { row: (fromRow + toRow) / 2, col: fromCol };
    }
    
    if (piece.toLowerCase() === 'p' && (toRow === 0 || toRow === 7)) {
        if (currentTurn === 'white') {
            promotionPending = { row: toRow, col: toCol };
            showPromotionModal();
            return;
        } else {
            board[toRow][toCol] = 'q';
        }
    }
    
    recordMove(piece, fromRow, fromCol, toRow, toCol, capturedPiece, moveInfo);
    lastMove = { fromRow, fromCol, toRow, toCol };
    selectedCell = null;
    validMoves = [];
    switchTurn();
}

function updateCastlingRights(piece, fromRow, fromCol) {
    if (piece === 'K') whiteKingMoved = true;
    else if (piece === 'k') blackKingMoved = true;
    else if (piece === 'R') {
        if (fromRow === 7 && fromCol === 0) whiteRookQueensideMoved = true;
        if (fromRow === 7 && fromCol === 7) whiteRookKingsideMoved = true;
    } else if (piece === 'r') {
        if (fromRow === 0 && fromCol === 0) blackRookQueensideMoved = true;
        if (fromRow === 0 && fromCol === 7) blackRookKingsideMoved = true;
    }
}

function recordMove(piece, fromRow, fromCol, toRow, toCol, captured, moveInfo) {
    const files = 'abcdefgh';
    const ranks = '87654321';
    let notation = '';
    
    if (moveInfo && moveInfo.castling) {
        notation = moveInfo.castling === 'kingside' ? 'O-O' : 'O-O-O';
    } else {
        if (piece.toLowerCase() !== 'p') notation += piece.toUpperCase();
        if (captured || (moveInfo && moveInfo.enPassant)) {
            if (piece.toLowerCase() === 'p') notation += files[fromCol];
            notation += 'x';
        }
        notation += files[toCol] + ranks[toRow];
        if (moveInfo && moveInfo.promotion) notation += '=' + moveInfo.promotion.toUpperCase();
    }
    
    const opponentColor = currentTurn === 'white' ? 'black' : 'white';
    if (isInCheck(opponentColor, board)) {
        notation += isCheckmate(opponentColor, board) ? '#' : '+';
    }
    
    moveHistory.push({ notation, color: currentTurn });
    updateMoveHistory();
}

function switchTurn() {
    currentTurn = currentTurn === 'white' ? 'black' : 'white';
    updateTurnIndicator();
    updateCapturedPieces();
    renderBoard();
    
    if (isCheckmate(currentTurn, board)) {
        gameOver = true;
        if (currentTurn === 'black') {
            updateStatus('Checkmate! You win!', 'win');
            generateKey();
        } else {
            updateStatus('Checkmate! AI wins!', 'checkmate');
        }
        return;
    }
    
    if (isStalemate(currentTurn, board)) {
        gameOver = true;
        updateStatus('Stalemate! Draw!', '');
        return;
    }
    
    if (isInCheck(currentTurn, board)) {
        updateStatus(currentTurn === 'white' ? 'You are in check!' : 'AI is in check!', 'check');
    } else {
        updateStatus(currentTurn === 'white' ? 'Your turn - Select a piece to move' : 'AI is thinking deeply...');
    }
    
    if (currentTurn === 'black' && !gameOver) {
        setTimeout(makeAIMove, 100);
    }
}

// ============================================
// PAWN PROMOTION
// ============================================

function showPromotionModal() {
    promotionModal.style.display = 'flex';
}

function hidePromotionModal() {
    promotionModal.style.display = 'none';
}

function handlePromotion(pieceType) {
    if (!promotionPending) return;
    
    const { row, col } = promotionPending;
    board[row][col] = pieceType.toUpperCase();
    
    const lastMoveEntry = moveHistory[moveHistory.length - 1];
    if (lastMoveEntry) lastMoveEntry.notation += '=' + pieceType.toUpperCase();
    
    promotionPending = null;
    hidePromotionModal();
    switchTurn();
}

// ============================================
// MOVE GENERATION
// ============================================

function getValidMoves(row, col, boardState, checkLegal = true) {
    const piece = boardState[row][col];
    if (!piece) return [];
    
    const color = isWhitePiece(piece) ? 'white' : 'black';
    let moves = [];
    
    switch (piece.toLowerCase()) {
        case 'p': moves = getPawnMoves(row, col, color, boardState); break;
        case 'r': moves = getRookMoves(row, col, color, boardState); break;
        case 'n': moves = getKnightMoves(row, col, color, boardState); break;
        case 'b': moves = getBishopMoves(row, col, color, boardState); break;
        case 'q': moves = getQueenMoves(row, col, color, boardState); break;
        case 'k': moves = getKingMoves(row, col, color, boardState); break;
    }
    
    if (checkLegal) {
        moves = moves.filter(move => {
            const testBoard = simulateMove(boardState, row, col, move.row, move.col, move);
            return !isInCheck(color, testBoard);
        });
    }
    
    return moves;
}

function getPawnMoves(row, col, color, boardState) {
    const moves = [];
    const direction = color === 'white' ? -1 : 1;
    const startRow = color === 'white' ? 6 : 1;
    
    if (isValidSquare(row + direction, col) && !boardState[row + direction][col]) {
        moves.push({ row: row + direction, col });
        if (row === startRow && !boardState[row + 2 * direction][col]) {
            moves.push({ row: row + 2 * direction, col });
        }
    }
    
    for (const dc of [-1, 1]) {
        const newRow = row + direction;
        const newCol = col + dc;
        
        if (isValidSquare(newRow, newCol)) {
            const target = boardState[newRow][newCol];
            if (target && isWhitePiece(target) !== (color === 'white')) {
                moves.push({ row: newRow, col: newCol });
            }
            if (enPassantTarget && enPassantTarget.row === newRow && enPassantTarget.col === newCol) {
                moves.push({ row: newRow, col: newCol, enPassant: true });
            }
        }
    }
    
    return moves;
}

function getRookMoves(row, col, color, boardState) {
    return getSlidingMoves(row, col, color, boardState, [[0, 1], [0, -1], [1, 0], [-1, 0]]);
}

function getBishopMoves(row, col, color, boardState) {
    return getSlidingMoves(row, col, color, boardState, [[1, 1], [1, -1], [-1, 1], [-1, -1]]);
}

function getQueenMoves(row, col, color, boardState) {
    return getSlidingMoves(row, col, color, boardState, [
        [0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]
    ]);
}

function getSlidingMoves(row, col, color, boardState, directions) {
    const moves = [];
    
    for (const [dr, dc] of directions) {
        let newRow = row + dr;
        let newCol = col + dc;
        
        while (isValidSquare(newRow, newCol)) {
            const target = boardState[newRow][newCol];
            if (!target) {
                moves.push({ row: newRow, col: newCol });
            } else {
                if (isWhitePiece(target) !== (color === 'white')) {
                    moves.push({ row: newRow, col: newCol });
                }
                break;
            }
            newRow += dr;
            newCol += dc;
        }
    }
    
    return moves;
}

function getKnightMoves(row, col, color, boardState) {
    const moves = [];
    const offsets = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
    
    for (const [dr, dc] of offsets) {
        const newRow = row + dr;
        const newCol = col + dc;
        
        if (isValidSquare(newRow, newCol)) {
            const target = boardState[newRow][newCol];
            if (!target || isWhitePiece(target) !== (color === 'white')) {
                moves.push({ row: newRow, col: newCol });
            }
        }
    }
    
    return moves;
}

function getKingMoves(row, col, color, boardState) {
    const moves = [];
    const offsets = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
    
    for (const [dr, dc] of offsets) {
        const newRow = row + dr;
        const newCol = col + dc;
        
        if (isValidSquare(newRow, newCol)) {
            const target = boardState[newRow][newCol];
            if (!target || isWhitePiece(target) !== (color === 'white')) {
                moves.push({ row: newRow, col: newCol });
            }
        }
    }
    
    // Castling
    const kingMoved = color === 'white' ? whiteKingMoved : blackKingMoved;
    const kingRow = color === 'white' ? 7 : 0;
    
    if (!kingMoved && row === kingRow && col === 4 && !isInCheck(color, boardState)) {
        const rookKingsideMoved = color === 'white' ? whiteRookKingsideMoved : blackRookKingsideMoved;
        if (!rookKingsideMoved && 
            !boardState[kingRow][5] && !boardState[kingRow][6] &&
            boardState[kingRow][7] && boardState[kingRow][7].toLowerCase() === 'r') {
            if (!isSquareAttacked(kingRow, 5, color === 'white' ? 'black' : 'white', boardState) &&
                !isSquareAttacked(kingRow, 6, color === 'white' ? 'black' : 'white', boardState)) {
                moves.push({ row: kingRow, col: 6, castling: 'kingside' });
            }
        }
        
        const rookQueensideMoved = color === 'white' ? whiteRookQueensideMoved : blackRookQueensideMoved;
        if (!rookQueensideMoved && 
            !boardState[kingRow][1] && !boardState[kingRow][2] && !boardState[kingRow][3] &&
            boardState[kingRow][0] && boardState[kingRow][0].toLowerCase() === 'r') {
            if (!isSquareAttacked(kingRow, 2, color === 'white' ? 'black' : 'white', boardState) &&
                !isSquareAttacked(kingRow, 3, color === 'white' ? 'black' : 'white', boardState)) {
                moves.push({ row: kingRow, col: 2, castling: 'queenside' });
            }
        }
    }
    
    return moves;
}

function isValidSquare(row, col) {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
}

function simulateMove(boardState, fromRow, fromCol, toRow, toCol, moveInfo) {
    const newBoard = boardState.map(row => [...row]);
    
    if (moveInfo && moveInfo.enPassant) {
        const capturedPawnRow = isWhitePiece(newBoard[fromRow][fromCol]) ? toRow + 1 : toRow - 1;
        newBoard[capturedPawnRow][toCol] = null;
    }
    
    if (moveInfo && moveInfo.castling) {
        if (moveInfo.castling === 'kingside') {
            newBoard[toRow][5] = newBoard[toRow][7];
            newBoard[toRow][7] = null;
        } else {
            newBoard[toRow][3] = newBoard[toRow][0];
            newBoard[toRow][0] = null;
        }
    }
    
    newBoard[toRow][toCol] = newBoard[fromRow][fromCol];
    newBoard[fromRow][fromCol] = null;
    
    return newBoard;
}

// ============================================
// CHECK AND CHECKMATE DETECTION
// ============================================

function findKing(color, boardState) {
    const kingPiece = color === 'white' ? 'K' : 'k';
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            if (boardState[row][col] === kingPiece) {
                return { row, col };
            }
        }
    }
    return null;
}

function isInCheck(color, boardState) {
    const king = findKing(color, boardState);
    if (!king) return false;
    const opponentColor = color === 'white' ? 'black' : 'white';
    return isSquareAttacked(king.row, king.col, opponentColor, boardState);
}

function isSquareAttacked(row, col, byColor, boardState) {
    // Check for pawn attacks
    const pawnDir = byColor === 'white' ? 1 : -1;
    const pawnPiece = byColor === 'white' ? 'P' : 'p';
    for (const dc of [-1, 1]) {
        const pr = row + pawnDir;
        const pc = col + dc;
        if (isValidSquare(pr, pc) && boardState[pr][pc] === pawnPiece) {
            return true;
        }
    }
    
    // Check for knight attacks
    const knightPiece = byColor === 'white' ? 'N' : 'n';
    const knightOffsets = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
    for (const [dr, dc] of knightOffsets) {
        const nr = row + dr;
        const nc = col + dc;
        if (isValidSquare(nr, nc) && boardState[nr][nc] === knightPiece) {
            return true;
        }
    }
    
    // Check for king attacks
    const kingPiece = byColor === 'white' ? 'K' : 'k';
    const kingOffsets = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
    for (const [dr, dc] of kingOffsets) {
        const kr = row + dr;
        const kc = col + dc;
        if (isValidSquare(kr, kc) && boardState[kr][kc] === kingPiece) {
            return true;
        }
    }
    
    // Check for rook/queen attacks (straight lines)
    const rookPiece = byColor === 'white' ? 'R' : 'r';
    const queenPiece = byColor === 'white' ? 'Q' : 'q';
    const straightDirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (const [dr, dc] of straightDirs) {
        let r = row + dr;
        let c = col + dc;
        while (isValidSquare(r, c)) {
            const piece = boardState[r][c];
            if (piece) {
                if (piece === rookPiece || piece === queenPiece) {
                    return true;
                }
                break;
            }
            r += dr;
            c += dc;
        }
    }
    
    // Check for bishop/queen attacks (diagonals)
    const bishopPiece = byColor === 'white' ? 'B' : 'b';
    const diagonalDirs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const [dr, dc] of diagonalDirs) {
        let r = row + dr;
        let c = col + dc;
        while (isValidSquare(r, c)) {
            const piece = boardState[r][c];
            if (piece) {
                if (piece === bishopPiece || piece === queenPiece) {
                    return true;
                }
                break;
            }
            r += dr;
            c += dc;
        }
    }
    
    return false;
}

function isCheckmate(color, boardState) {
    if (!isInCheck(color, boardState)) return false;
    return !hasLegalMoves(color, boardState);
}

function isStalemate(color, boardState) {
    if (isInCheck(color, boardState)) return false;
    return !hasLegalMoves(color, boardState);
}

function hasLegalMoves(color, boardState) {
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = boardState[row][col];
            if (!piece) continue;
            
            const pieceColor = isWhitePiece(piece) ? 'white' : 'black';
            if (pieceColor !== color) continue;
            
            const moves = getValidMoves(row, col, boardState, true);
            if (moves.length > 0) return true;
        }
    }
    return false;
}

// ============================================
// AI OPPONENT - MAXIMUM DIFFICULTY
// ============================================

function getBoardFEN(boardState) {
    let fen = '';
    for (let row = 0; row < 8; row++) {
        let empty = 0;
        for (let col = 0; col < 8; col++) {
            const piece = boardState[row][col];
            if (piece) {
                if (empty > 0) {
                    fen += empty;
                    empty = 0;
                }
                fen += piece;
            } else {
                empty++;
            }
        }
        if (empty > 0) fen += empty;
        if (row < 7) fen += '/';
    }
    return fen;
}

function getOpeningMove(boardState) {
    const fen = getBoardFEN(boardState);
    const bookMoves = OPENING_BOOK[fen];
    
    if (bookMoves && bookMoves.length > 0) {
        // Pick a random move from the book for variety
        const bookMove = bookMoves[Math.floor(Math.random() * bookMoves.length)];
        const [fromRow, fromCol] = bookMove.from;
        const [toRow, toCol] = bookMove.to;
        
        // Verify the move is legal
        const moves = getValidMoves(fromRow, fromCol, boardState, true);
        const validMove = moves.find(m => m.row === toRow && m.col === toCol);
        
        if (validMove) {
            return {
                fromRow, fromCol, toRow, toCol,
                moveInfo: validMove
            };
        }
    }
    return null;
}

async function makeAIMove() {
    if (gameOver || currentTurn !== 'black') return;
    
    boardElement.classList.add('ai-thinking');
    updateStatus('Stockfish is thinking...', '');
    
    nodesSearched = 0;
    searchStartTime = Date.now();
    searchAborted = false;
    
    let bestMove = null;
    
    // Try Stockfish first
    if (USE_STOCKFISH && stockfishReady) {
        try {
            bestMove = await getStockfishMove(board);
            if (bestMove) {
                console.log(`Stockfish found move in ${Date.now() - searchStartTime}ms`);
            }
        } catch (error) {
            console.error('Stockfish error:', error);
        }
    }
    
    // Fallback to opening book
    if (!bestMove) {
        bestMove = getOpeningMove(board);
    }
    
    // Fallback to built-in AI
    if (!bestMove) {
        updateStatus('AI is calculating...', '');
        
        if (transpositionTable.size > 500000) {
            transpositionTable.clear();
        }
        
        killerMoves = Array(AI_DEPTH + QUIESCENCE_DEPTH + 1).fill(null).map(() => [null, null]);
        
        if (USE_ITERATIVE_DEEPENING) {
            bestMove = iterativeDeepening(board, AI_DEPTH);
        } else {
            bestMove = findBestMove(board, AI_DEPTH);
        }
        
        console.log(`Built-in AI searched ${nodesSearched} nodes in ${Date.now() - searchStartTime}ms`);
    }
    
    boardElement.classList.remove('ai-thinking');
    
    if (bestMove) {
        selectedCell = { row: bestMove.fromRow, col: bestMove.fromCol };
        makeMove(bestMove.fromRow, bestMove.fromCol, bestMove.toRow, bestMove.toCol, bestMove.moveInfo);
    }
}

function iterativeDeepening(boardState, maxDepth) {
    let bestMove = null;
    let previousScore = 0;
    searchAborted = false;
    
    for (let depth = 1; depth <= maxDepth; depth++) {
        // Check time before starting new depth
        if (Date.now() - searchStartTime > AI_TIME_LIMIT) {
            break;
        }
        
        let move;
        
        if (USE_ASPIRATION_WINDOWS && depth > 3 && bestMove) {
            const delta = 50;
            let alpha = previousScore - delta;
            let beta = previousScore + delta;
            
            move = findBestMoveWithWindow(boardState, depth, alpha, beta);
            
            if (searchAborted) break;
            
            if (!move || move.score <= alpha || move.score >= beta) {
                move = findBestMove(boardState, depth);
            }
        } else {
            move = findBestMove(boardState, depth);
        }
        
        if (searchAborted) break;
        
        if (move) {
            bestMove = move;
            previousScore = move.score || 0;
        }
    }
    
    return bestMove;
}

function findBestMoveWithWindow(boardState, depth, alpha, beta) {
    let bestMove = null;
    let bestValue = Infinity;
    
    const moves = getAllMoves('black', boardState);
    orderMoves(moves, boardState, 0);
    
    for (const move of moves) {
        if (Date.now() - searchStartTime > AI_TIME_LIMIT) {
            searchAborted = true;
            break;
        }
        
        const newBoard = simulateMove(boardState, move.fromRow, move.fromCol, move.toRow, move.toCol, move.moveInfo);
        const value = minimax(newBoard, depth - 1, alpha, beta, true, 1);
        
        if (searchAborted) break;
        
        if (value < bestValue) {
            bestValue = value;
            bestMove = move;
            bestMove.score = value;
        }
        
        if (value < beta) beta = value;
        if (alpha >= beta) break;
    }
    
    return bestMove;
}

function findBestMove(boardState, depth) {
    let bestMove = null;
    let bestValue = Infinity;
    
    const moves = getAllMoves('black', boardState);
    orderMoves(moves, boardState, 0);
    
    for (const move of moves) {
        if (Date.now() - searchStartTime > AI_TIME_LIMIT) {
            searchAborted = true;
            break;
        }
        
        const newBoard = simulateMove(boardState, move.fromRow, move.fromCol, move.toRow, move.toCol, move.moveInfo);
        const value = minimax(newBoard, depth - 1, -Infinity, Infinity, true, 1);
        
        if (searchAborted) break;
        
        if (value < bestValue) {
            bestValue = value;
            bestMove = move;
            bestMove.score = value;
        }
    }
    
    return bestMove;
}

function minimax(boardState, depth, alpha, beta, isMaximizing, ply) {
    nodesSearched++;
    
    // Time check every 1000 nodes
    if (nodesSearched % 1000 === 0 && Date.now() - searchStartTime > AI_TIME_LIMIT) {
        searchAborted = true;
        return 0;
    }
    
    if (searchAborted) return 0;
    
    const color = isMaximizing ? 'white' : 'black';
    const posKey = getBoardHash(boardState);
    
    if (USE_TRANSPOSITION_TABLE) {
        const cached = transpositionTable.get(posKey);
        if (cached && cached.depth >= depth) {
            if (cached.flag === 'exact') return cached.value;
            if (cached.flag === 'lower' && cached.value > alpha) alpha = cached.value;
            if (cached.flag === 'upper' && cached.value < beta) beta = cached.value;
            if (alpha >= beta) return cached.value;
        }
    }
    
    if (isCheckmate(color, boardState)) {
        return isMaximizing ? (-100000 + ply) : (100000 - ply);
    }
    
    if (isStalemate(color, boardState)) return 0;
    
    if (depth <= 0) {
        return quiescenceSearch(boardState, alpha, beta, isMaximizing, QUIESCENCE_DEPTH);
    }
    
    // Null move pruning - skip a turn to see if position is still good
    if (USE_NULL_MOVE_PRUNING && depth >= 3 && !isInCheck(color, boardState)) {
        const nullMoveReduction = 2 + Math.floor(depth / 4);
        const nullScore = minimax(boardState, depth - 1 - nullMoveReduction, alpha, beta, !isMaximizing, ply + 1);
        
        if (searchAborted) return 0;
        
        if (isMaximizing && nullScore >= beta) return beta;
        if (!isMaximizing && nullScore <= alpha) return alpha;
    }
    
    const moves = getAllMoves(color, boardState);
    orderMoves(moves, boardState, ply);
    
    let bestValue = isMaximizing ? -Infinity : Infinity;
    let flag = 'upper';
    
    for (let i = 0; i < moves.length; i++) {
        if (searchAborted) break;
        
        const move = moves[i];
        const newBoard = simulateMove(boardState, move.fromRow, move.fromCol, move.toRow, move.toCol, move.moveInfo);
        
        let evalScore;
        
        // Late move reduction - search later moves with reduced depth
        if (i >= 4 && depth >= 3 && !boardState[move.toRow][move.toCol] && !isInCheck(color, newBoard)) {
            const reduction = i >= 8 ? 2 : 1;
            evalScore = minimax(newBoard, depth - 1 - reduction, alpha, beta, !isMaximizing, ply + 1);
            
            if (searchAborted) break;
            
            // Re-search with full depth if move looks promising
            if ((isMaximizing && evalScore > alpha) || (!isMaximizing && evalScore < beta)) {
                evalScore = minimax(newBoard, depth - 1, alpha, beta, !isMaximizing, ply + 1);
            }
        } else {
            evalScore = minimax(newBoard, depth - 1, alpha, beta, !isMaximizing, ply + 1);
        }
        
        if (searchAborted) break;
        
        if (isMaximizing) {
            if (evalScore > bestValue) bestValue = evalScore;
            if (evalScore > alpha) { alpha = evalScore; flag = 'exact'; }
        } else {
            if (evalScore < bestValue) bestValue = evalScore;
            if (evalScore < beta) { beta = evalScore; flag = 'exact'; }
        }
        
        if (alpha >= beta) {
            if (USE_KILLER_MOVES && !boardState[move.toRow][move.toCol]) {
                killerMoves[ply][1] = killerMoves[ply][0];
                killerMoves[ply][0] = move;
            }
            const histKey = `${move.fromRow}${move.fromCol}${move.toRow}${move.toCol}`;
            historyTable[histKey] = (historyTable[histKey] || 0) + depth * depth;
            flag = isMaximizing ? 'lower' : 'upper';
            break;
        }
    }
    
    if (USE_TRANSPOSITION_TABLE && !searchAborted) {
        transpositionTable.set(posKey, { value: bestValue, depth, flag });
    }
    
    return bestValue;
}

function quiescenceSearch(boardState, alpha, beta, isMaximizing, depth) {
    nodesSearched++;
    
    if (searchAborted) return 0;
    
    const standPat = evaluateBoard(boardState);
    
    if (depth <= 0) return standPat;
    
    if (isMaximizing) {
        if (standPat >= beta) return beta;
        if (standPat > alpha) alpha = standPat;
    } else {
        if (standPat <= alpha) return alpha;
        if (standPat < beta) beta = standPat;
    }
    
    const color = isMaximizing ? 'white' : 'black';
    const moves = getAllMoves(color, boardState);
    
    const captureMoves = moves.filter(move => boardState[move.toRow][move.toCol] !== null);
    
    captureMoves.sort((a, b) => {
        const victimA = boardState[a.toRow][a.toCol];
        const victimB = boardState[b.toRow][b.toCol];
        const scoreA = victimA ? PIECE_VALUES[victimA.toLowerCase()] : 0;
        const scoreB = victimB ? PIECE_VALUES[victimB.toLowerCase()] : 0;
        return scoreB - scoreA;
    });
    
    for (const move of captureMoves) {
        if (searchAborted) break;
        
        const newBoard = simulateMove(boardState, move.fromRow, move.fromCol, move.toRow, move.toCol, move.moveInfo);
        const evalScore = quiescenceSearch(newBoard, alpha, beta, !isMaximizing, depth - 1);
        
        if (searchAborted) break;
        
        if (isMaximizing) {
            if (evalScore >= beta) return beta;
            if (evalScore > alpha) alpha = evalScore;
        } else {
            if (evalScore <= alpha) return alpha;
            if (evalScore < beta) beta = evalScore;
        }
    }
    
    return isMaximizing ? alpha : beta;
}

function orderMoves(moves, boardState, ply) {
    moves.forEach(move => {
        move.score = 0;
        const targetPiece = boardState[move.toRow][move.toCol];
        const movingPiece = boardState[move.fromRow][move.fromCol];
        
        if (targetPiece) {
            move.score += 10000 + PIECE_VALUES[targetPiece.toLowerCase()] - (PIECE_VALUES[movingPiece.toLowerCase()] / 100);
        }
        
        if (USE_KILLER_MOVES && killerMoves[ply]) {
            if (isSameMove(move, killerMoves[ply][0])) move.score += 9000;
            else if (isSameMove(move, killerMoves[ply][1])) move.score += 8000;
        }
        
        const histKey = `${move.fromRow}${move.fromCol}${move.toRow}${move.toCol}`;
        move.score += (historyTable[histKey] || 0);
        
        if (movingPiece.toLowerCase() === 'p' && (move.toRow === 0 || move.toRow === 7)) move.score += 8500;
        if (move.moveInfo.castling) move.score += 500;
        
        if ((movingPiece.toLowerCase() === 'p' || movingPiece.toLowerCase() === 'n') &&
            move.toRow >= 3 && move.toRow <= 4 && move.toCol >= 3 && move.toCol <= 4) {
            move.score += 50;
        }
    });
    
    moves.sort((a, b) => b.score - a.score);
}

function isSameMove(move1, move2) {
    if (!move1 || !move2) return false;
    return move1.fromRow === move2.fromRow && move1.fromCol === move2.fromCol &&
           move1.toRow === move2.toRow && move1.toCol === move2.toCol;
}

function getBoardHash(boardState) {
    let hash = '';
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            hash += boardState[row][col] || '.';
        }
    }
    return hash;
}

function getAllMoves(color, boardState) {
    const moves = [];
    
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = boardState[row][col];
            if (!piece) continue;
            
            const pieceColor = isWhitePiece(piece) ? 'white' : 'black';
            if (pieceColor !== color) continue;
            
            const pieceMoves = getValidMoves(row, col, boardState, true);
            for (const move of pieceMoves) {
                moves.push({
                    fromRow: row, fromCol: col,
                    toRow: move.row, toCol: move.col,
                    moveInfo: move
                });
            }
        }
    }
    
    return moves;
}

function evaluateBoard(boardState) {
    let score = 0;
    let whiteMaterial = 0;
    let blackMaterial = 0;
    let whitePawns = [];
    let blackPawns = [];
    let whiteKnights = 0, blackKnights = 0;
    let whiteBishops = 0, blackBishops = 0;
    let whiteRooks = 0, blackRooks = 0;
    let whiteQueens = 0, blackQueens = 0;
    
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = boardState[row][col];
            if (!piece) continue;
            
            const value = PIECE_VALUES[piece.toLowerCase()];
            if (isWhitePiece(piece)) {
                whiteMaterial += value;
                if (piece === 'P') whitePawns.push({ row, col });
                else if (piece === 'N') whiteKnights++;
                else if (piece === 'B') whiteBishops++;
                else if (piece === 'R') whiteRooks++;
                else if (piece === 'Q') whiteQueens++;
            } else {
                blackMaterial += value;
                if (piece === 'p') blackPawns.push({ row, col });
                else if (piece === 'n') blackKnights++;
                else if (piece === 'b') blackBishops++;
                else if (piece === 'r') blackRooks++;
                else if (piece === 'q') blackQueens++;
            }
        }
    }
    
    const totalMaterial = whiteMaterial + blackMaterial;
    const isEndgame = totalMaterial < 2600;
    const isMidgame = totalMaterial >= 2600 && totalMaterial < 6000;
    
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = boardState[row][col];
            if (!piece) continue;
            
            const pieceValue = getPieceValue(piece, row, col, isEndgame);
            if (isWhitePiece(piece)) score += pieceValue;
            else score -= pieceValue;
        }
    }
    
    // King safety (more important in middlegame)
    const kingSafetyWeight = isEndgame ? 0.5 : 1.5;
    score += (evaluateKingSafety('white', boardState) - evaluateKingSafety('black', boardState)) * kingSafetyWeight;
    
    // Mobility bonus
    const whiteMoves = getAllMoves('white', boardState).length;
    const blackMoves = getAllMoves('black', boardState).length;
    score += (whiteMoves - blackMoves) * 5;
    
    // Pawn structure evaluation
    score += evaluatePawnStructure(whitePawns, 'white') - evaluatePawnStructure(blackPawns, 'black');
    
    // Passed pawn bonus (more important in endgame)
    const passedPawnWeight = isEndgame ? 1.5 : 1.0;
    score += (evaluatePassedPawns(whitePawns, blackPawns, 'white', boardState) -
              evaluatePassedPawns(blackPawns, whitePawns, 'black', boardState)) * passedPawnWeight;
    
    // Bishop pair bonus
    if (whiteBishops >= 2) score += 50;
    if (blackBishops >= 2) score -= 50;
    
    // Rook on open file bonus
    score += evaluateRooks(boardState, whitePawns, blackPawns);
    
    // Knight outpost bonus (knights on protected squares in enemy territory)
    score += evaluateKnightOutposts(boardState, whitePawns, blackPawns);
    
    // Connected rooks bonus
    score += evaluateConnectedRooks(boardState);
    
    // Center control bonus
    score += evaluateCenterControl(boardState);
    
    // Tempo bonus for development in opening
    if (moveHistory.length < 20) {
        score += evaluateDevelopment(boardState);
    }
    
    return score;
}

function evaluateKnightOutposts(boardState, whitePawns, blackPawns) {
    let score = 0;
    
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = boardState[row][col];
            if (piece === 'N' && row <= 4) {
                // White knight in black's territory
                const protectedByPawn = whitePawns.some(p =>
                    p.row === row + 1 && Math.abs(p.col - col) === 1
                );
                const canBeAttackedByPawn = blackPawns.some(p =>
                    p.col === col - 1 || p.col === col + 1
                );
                if (protectedByPawn && !canBeAttackedByPawn) {
                    score += 30;
                }
            }
            if (piece === 'n' && row >= 3) {
                // Black knight in white's territory
                const protectedByPawn = blackPawns.some(p =>
                    p.row === row - 1 && Math.abs(p.col - col) === 1
                );
                const canBeAttackedByPawn = whitePawns.some(p =>
                    p.col === col - 1 || p.col === col + 1
                );
                if (protectedByPawn && !canBeAttackedByPawn) {
                    score -= 30;
                }
            }
        }
    }
    
    return score;
}

function evaluateConnectedRooks(boardState) {
    let score = 0;
    let whiteRooks = [];
    let blackRooks = [];
    
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            if (boardState[row][col] === 'R') whiteRooks.push({ row, col });
            if (boardState[row][col] === 'r') blackRooks.push({ row, col });
        }
    }
    
    // Check if white rooks are connected (same row or column with no pieces between)
    if (whiteRooks.length === 2) {
        if (whiteRooks[0].row === whiteRooks[1].row) {
            const row = whiteRooks[0].row;
            const minCol = Math.min(whiteRooks[0].col, whiteRooks[1].col);
            const maxCol = Math.max(whiteRooks[0].col, whiteRooks[1].col);
            let connected = true;
            for (let col = minCol + 1; col < maxCol; col++) {
                if (boardState[row][col]) { connected = false; break; }
            }
            if (connected) score += 20;
        }
    }
    
    if (blackRooks.length === 2) {
        if (blackRooks[0].row === blackRooks[1].row) {
            const row = blackRooks[0].row;
            const minCol = Math.min(blackRooks[0].col, blackRooks[1].col);
            const maxCol = Math.max(blackRooks[0].col, blackRooks[1].col);
            let connected = true;
            for (let col = minCol + 1; col < maxCol; col++) {
                if (boardState[row][col]) { connected = false; break; }
            }
            if (connected) score -= 20;
        }
    }
    
    return score;
}

function evaluateCenterControl(boardState) {
    let score = 0;
    const centerSquares = [[3, 3], [3, 4], [4, 3], [4, 4]];
    const extendedCenter = [[2, 2], [2, 3], [2, 4], [2, 5], [3, 2], [3, 5], [4, 2], [4, 5], [5, 2], [5, 3], [5, 4], [5, 5]];
    
    for (const [row, col] of centerSquares) {
        const piece = boardState[row][col];
        if (piece) {
            if (isWhitePiece(piece)) score += 10;
            else score -= 10;
        }
    }
    
    for (const [row, col] of extendedCenter) {
        const piece = boardState[row][col];
        if (piece) {
            if (isWhitePiece(piece)) score += 3;
            else score -= 3;
        }
    }
    
    return score;
}

function evaluateDevelopment(boardState) {
    let score = 0;
    
    // Penalize undeveloped minor pieces
    // White back rank pieces that haven't moved
    if (boardState[7][1] === 'N') score -= 15; // b1 knight
    if (boardState[7][6] === 'N') score -= 15; // g1 knight
    if (boardState[7][2] === 'B') score -= 15; // c1 bishop
    if (boardState[7][5] === 'B') score -= 15; // f1 bishop
    
    // Black back rank pieces that haven't moved
    if (boardState[0][1] === 'n') score += 15; // b8 knight
    if (boardState[0][6] === 'n') score += 15; // g8 knight
    if (boardState[0][2] === 'b') score += 15; // c8 bishop
    if (boardState[0][5] === 'b') score += 15; // f8 bishop
    
    // Bonus for castled king
    if (boardState[7][6] === 'K' || boardState[7][2] === 'K') score += 30;
    if (boardState[0][6] === 'k' || boardState[0][2] === 'k') score -= 30;
    
    return score;
}

function evaluatePawnStructure(pawns, color) {
    let score = 0;
    const files = new Array(8).fill(0);
    
    for (const pawn of pawns) {
        files[pawn.col]++;
    }
    
    // Doubled pawns penalty
    for (let col = 0; col < 8; col++) {
        if (files[col] > 1) {
            score -= (files[col] - 1) * 20;
        }
    }
    
    // Isolated pawns penalty
    for (const pawn of pawns) {
        const hasNeighbor = (pawn.col > 0 && files[pawn.col - 1] > 0) ||
                           (pawn.col < 7 && files[pawn.col + 1] > 0);
        if (!hasNeighbor) {
            score -= 15;
        }
    }
    
    return score;
}

function evaluatePassedPawns(friendlyPawns, enemyPawns, color, boardState) {
    let score = 0;
    
    for (const pawn of friendlyPawns) {
        let isPassed = true;
        const direction = color === 'white' ? -1 : 1;
        const promotionRow = color === 'white' ? 0 : 7;
        
        // Check if any enemy pawn can block or capture
        for (const enemyPawn of enemyPawns) {
            if (Math.abs(enemyPawn.col - pawn.col) <= 1) {
                if (color === 'white' && enemyPawn.row < pawn.row) {
                    isPassed = false;
                    break;
                }
                if (color === 'black' && enemyPawn.row > pawn.row) {
                    isPassed = false;
                    break;
                }
            }
        }
        
        if (isPassed) {
            const distanceToPromotion = Math.abs(pawn.row - promotionRow);
            score += PASSED_PAWN_BONUS[distanceToPromotion];
        }
    }
    
    return score;
}

function evaluateRooks(boardState, whitePawns, blackPawns) {
    let score = 0;
    
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = boardState[row][col];
            if (piece === 'R' || piece === 'r') {
                const isWhite = piece === 'R';
                let hasWhitePawn = whitePawns.some(p => p.col === col);
                let hasBlackPawn = blackPawns.some(p => p.col === col);
                
                // Open file (no pawns)
                if (!hasWhitePawn && !hasBlackPawn) {
                    score += isWhite ? 25 : -25;
                }
                // Semi-open file (only enemy pawns)
                else if (isWhite && !hasWhitePawn && hasBlackPawn) {
                    score += 15;
                }
                else if (!isWhite && hasWhitePawn && !hasBlackPawn) {
                    score -= 15;
                }
            }
        }
    }
    
    return score;
}

function getPieceValue(piece, row, col, isEndgame) {
    const type = piece.toLowerCase();
    const isWhite = isWhitePiece(piece);
    let value = PIECE_VALUES[type] || 0;
    
    const tableRow = isWhite ? row : 7 - row;
    
    switch (type) {
        case 'p': value += PAWN_TABLE[tableRow][col]; break;
        case 'n': value += KNIGHT_TABLE[tableRow][col]; if (isEndgame) value -= 10; break;
        case 'b': value += BISHOP_TABLE[tableRow][col]; if (isEndgame) value += 15; break;
        case 'r': value += ROOK_TABLE[tableRow][col]; if (isEndgame) value += 20; break;
        case 'q': value += QUEEN_TABLE[tableRow][col]; break;
        case 'k': value += isEndgame ? KING_ENDGAME_TABLE[tableRow][col] : KING_TABLE[tableRow][col]; break;
    }
    
    return value;
}

function evaluateKingSafety(color, boardState) {
    let score = 0;
    const king = findKing(color, boardState);
    if (!king) return 0;
    
    const isWhite = color === 'white';
    const pawnShieldRow = isWhite ? king.row - 1 : king.row + 1;
    const friendlyPawn = isWhite ? 'P' : 'p';
    
    if (pawnShieldRow >= 0 && pawnShieldRow <= 7) {
        for (let col = Math.max(0, king.col - 1); col <= Math.min(7, king.col + 1); col++) {
            if (boardState[pawnShieldRow][col] === friendlyPawn) score += 15;
        }
    }
    
    if (king.col >= 2 && king.col <= 5) {
        if ((isWhite && king.row >= 5) || (!isWhite && king.row <= 2)) {
            score -= 30;
        }
    }
    
    return score;
}

// ============================================
// UI UPDATES
// ============================================

function updateStatus(message, className = '') {
    statusText.textContent = message;
    statusText.className = className;
}

function updateTurnIndicator() {
    currentTurnElement.textContent = currentTurn === 'white' ? 'White (You)' : 'Black (AI)';
}

function updateCapturedPieces() {
    whiteCapturedElement.textContent = capturedWhite.map(p => getPieceSymbol(p)).join(' ');
    blackCapturedElement.textContent = capturedBlack.map(p => getPieceSymbol(p)).join(' ');
}

function updateMoveHistory() {
    movesListElement.innerHTML = '';
    
    for (let i = 0; i < moveHistory.length; i += 2) {
        const moveNum = Math.floor(i / 2) + 1;
        const whiteMove = moveHistory[i];
        const blackMove = moveHistory[i + 1];
        
        const entry = document.createElement('span');
        entry.className = 'move-entry';
        entry.textContent = `${moveNum}. ${whiteMove.notation}`;
        if (blackMove) entry.textContent += ` ${blackMove.notation}`;
        movesListElement.appendChild(entry);
    }
    
    movesListElement.scrollTop = movesListElement.scrollHeight;
}

// ============================================
// KEY GENERATION AND DISPLAY
// ============================================

async function generateKey() {
    try {
        const response = await fetch('/api/chess-win', { method: 'POST' });
        if (response.ok) {
            const data = await response.json();
            if (data.key) showKeyDisplay(data.key);
        } else {
            showKeyDisplay(generateLocalKey());
        }
    } catch (error) {
        showKeyDisplay(generateLocalKey());
    }
}

function generateLocalKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let key = 'CHESS-';
    for (let i = 0; i < 4; i++) {
        if (i > 0) key += '-';
        for (let j = 0; j < 4; j++) {
            key += chars.charAt(Math.floor(Math.random() * chars.length));
        }
    }
    return key;
}

function showKeyDisplay(key) {
    keyValue.textContent = key;
    keyDisplay.style.display = 'block';
    if (proxyLink) proxyLink.href = `https://lmarena.ai/?key=${encodeURIComponent(key)}`;
}

function hideKeyDisplay() {
    keyDisplay.style.display = 'none';
    keyValue.textContent = '';
}

function copyKey() {
    if (!keyValue || !keyValue.textContent) return;
    
    navigator.clipboard.writeText(keyValue.textContent)
        .then(() => {
            copyBtn.textContent = '✅ Copied!';
            setTimeout(() => { copyBtn.textContent = '📋 Copy'; }, 2000);
        })
        .catch(err => console.error('Failed to copy:', err));
}