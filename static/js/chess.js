
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

// AI Configuration - EXTREME DIFFICULTY
const AI_DEPTH = 7;
const QUIESCENCE_DEPTH = 6;
const USE_ITERATIVE_DEEPENING = true;
const USE_TRANSPOSITION_TABLE = true;
const USE_KILLER_MOVES = true;
const USE_NULL_MOVE_PRUNING = true;
const USE_ASPIRATION_WINDOWS = true;

// Transposition table and search helpers
let transpositionTable = new Map();
let killerMoves = [];
let historyTable = {};
let nodesSearched = 0;
let searchStartTime = 0;

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

function makeAIMove() {
    if (gameOver || currentTurn !== 'black') return;
    
    boardElement.classList.add('ai-thinking');
    updateStatus('AI is calculating deeply...', '');
    
    setTimeout(() => {
        nodesSearched = 0;
        searchStartTime = Date.now();
        
        if (transpositionTable.size > 500000) {
            transpositionTable.clear();
        }
        
        killerMoves = Array(AI_DEPTH + QUIESCENCE_DEPTH + 1).fill(null).map(() => [null, null]);
        
        let bestMove;
        if (USE_ITERATIVE_DEEPENING) {
            bestMove = iterativeDeepening(board, AI_DEPTH);
        } else {
            bestMove = findBestMove(board, AI_DEPTH);
        }
        
        boardElement.classList.remove('ai-thinking');
        console.log(`AI searched ${nodesSearched} nodes in ${Date.now() - searchStartTime}ms`);
        
        if (bestMove) {
            selectedCell = { row: bestMove.fromRow, col: bestMove.fromCol };
            makeMove(bestMove.fromRow, bestMove.fromCol, bestMove.toRow, bestMove.toCol, bestMove.moveInfo);
        }
    }, 50);
}

function iterativeDeepening(boardState, maxDepth) {
    let bestMove = null;
    let previousScore = 0;
    
    for (let depth = 1; depth <= maxDepth; depth++) {
        let move;
        
        if (USE_ASPIRATION_WINDOWS && depth > 3 && bestMove) {
            // Use aspiration windows for faster search
            const delta = 50;
            let alpha = previousScore - delta;
            let beta = previousScore + delta;
            
            move = findBestMoveWithWindow(boardState, depth, alpha, beta);
            
            // If search failed, do a full window search
            if (!move || move.score <= alpha || move.score >= beta) {
                move = findBestMove(boardState, depth);
            }
        } else {
            move = findBestMove(boardState, depth);
        }
        
        if (move) {
            bestMove = move;
            previousScore = move.score || 0;
        }
        
        // Reduced time limit for faster response
        if (Date.now() - searchStartTime > 3000) break;
    }
    
    return bestMove;
}

function findBestMoveWithWindow(boardState, depth, alpha, beta) {
    let bestMove = null;
    let bestValue = Infinity;
    
    const moves = getAllMoves('black', boardState);
    orderMoves(moves, boardState, 0);
    
    for (const move of moves) {
        const newBoard = simulateMove(boardState, move.fromRow, move.fromCol, move.toRow, move.toCol, move.moveInfo);
        const value = minimax(newBoard, depth - 1, alpha, beta, true, 1);
        
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
        const newBoard = simulateMove(boardState, move.fromRow, move.fromCol, move.toRow, move.toCol, move.moveInfo);
        const value = minimax(newBoard, depth - 1, -Infinity, Infinity, true, 1);
        
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
        
        if (isMaximizing && nullScore >= beta) return beta;
        if (!isMaximizing && nullScore <= alpha) return alpha;
    }
    
    const moves = getAllMoves(color, boardState);
    orderMoves(moves, boardState, ply);
    
    let bestValue = isMaximizing ? -Infinity : Infinity;
    let flag = 'upper';
    
    for (let i = 0; i < moves.length; i++) {
        const move = moves[i];
        const newBoard = simulateMove(boardState, move.fromRow, move.fromCol, move.toRow, move.toCol, move.moveInfo);
        
        let evalScore;
        
        // Late move reduction - search later moves with reduced depth
        if (i >= 4 && depth >= 3 && !boardState[move.toRow][move.toCol] && !isInCheck(color, newBoard)) {
            const reduction = i >= 8 ? 2 : 1;
            evalScore = minimax(newBoard, depth - 1 - reduction, alpha, beta, !isMaximizing, ply + 1);
            
            // Re-search with full depth if move looks promising
            if ((isMaximizing && evalScore > alpha) || (!isMaximizing && evalScore < beta)) {
                evalScore = minimax(newBoard, depth - 1, alpha, beta, !isMaximizing, ply + 1);
            }
        } else {
            evalScore = minimax(newBoard, depth - 1, alpha, beta, !isMaximizing, ply + 1);
        }
        
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
    
    if (USE_TRANSPOSITION_TABLE) {
        transpositionTable.set(posKey, { value: bestValue, depth, flag });
    }
    
    return bestValue;
}

function quiescenceSearch(boardState, alpha, beta, isMaximizing, depth) {
    nodesSearched++;
    
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
        const newBoard = simulateMove(boardState, move.fromRow, move.fromCol, move.toRow, move.toCol, move.moveInfo);
        const evalScore = quiescenceSearch(newBoard, alpha, beta, !isMaximizing, depth - 1);
        
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
    
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = boardState[row][col];
            if (!piece) continue;
            
            const value = PIECE_VALUES[piece.toLowerCase()];
            if (isWhitePiece(piece)) {
                whiteMaterial += value;
                if (piece === 'P') whitePawns.push({ row, col });
            } else {
                blackMaterial += value;
                if (piece === 'p') blackPawns.push({ row, col });
            }
        }
    }
    
    const isEndgame = (whiteMaterial + blackMaterial) < 2600;
    
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = boardState[row][col];
            if (!piece) continue;
            
            const pieceValue = getPieceValue(piece, row, col, isEndgame);
            if (isWhitePiece(piece)) score += pieceValue;
            else score -= pieceValue;
        }
    }
    
    // King safety
    score += evaluateKingSafety('white', boardState) - evaluateKingSafety('black', boardState);
    
    // Mobility bonus
    const whiteMoves = getAllMoves('white', boardState).length;
    const blackMoves = getAllMoves('black', boardState).length;
    score += (whiteMoves - blackMoves) * 5;
    
    // Pawn structure evaluation
    score += evaluatePawnStructure(whitePawns, 'white') - evaluatePawnStructure(blackPawns, 'black');
    
    // Passed pawn bonus
    score += evaluatePassedPawns(whitePawns, blackPawns, 'white', boardState);
    score -= evaluatePassedPawns(blackPawns, whitePawns, 'black', boardState);
    
    // Bishop pair bonus
    let whiteBishops = 0, blackBishops = 0;
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            if (boardState[row][col] === 'B') whiteBishops++;
            if (boardState[row][col] === 'b') blackBishops++;
        }
    }
    if (whiteBishops >= 2) score += 50;
    if (blackBishops >= 2) score -= 50;
    
    // Rook on open file bonus
    score += evaluateRooks(boardState, whitePawns, blackPawns);
    
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