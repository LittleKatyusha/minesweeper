// Chess Game - JavaScript Logic
// Stockfish 16 NNUE Powered Chess AI (Maximum Difficulty)

const BOARD_SIZE = 8;
const PIECES = {
    WHITE_KING: '♔', WHITE_QUEEN: '♕', WHITE_ROOK: '♖',
    WHITE_BISHOP: '♗', WHITE_KNIGHT: '♘', WHITE_PAWN: '♙',
    BLACK_KING: '♚', BLACK_QUEEN: '♛', BLACK_ROOK: '♜',
    BLACK_BISHOP: '♝', BLACK_KNIGHT: '♞', BLACK_PAWN: '♟'
};

const STOCKFISH_DEPTH = 20;
const STOCKFISH_TIME = 1000;

let stockfish = null;
let stockfishReady = false;
let stockfishResolve = null;
let recentAIMoves = [];
const MAX_RECENT_MOVES = 4;

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
const loadingOverlay = document.getElementById('loading-overlay');

function showLoading() {
    if (loadingOverlay) loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
    if (loadingOverlay) loadingOverlay.classList.add('hidden');
}

function initStockfish() {
    try {
        stockfish = new Worker('/static/js/stockfish-16-single.js');
        stockfish.onmessage = function(event) {
            const message = event.data;
            if (message === 'uciok') {
                stockfish.postMessage('setoption name Skill Level value 20');
                stockfish.postMessage('setoption name MultiPV value 1');
                stockfish.postMessage('setoption name Hash value 128');
                stockfish.postMessage('setoption name Threads value 1');
                stockfish.postMessage('setoption name Use NNUE value true');
                stockfish.postMessage('setoption name EvalFile value /static/js/nn-5af11540bbfe.nnue');
                stockfish.postMessage('isready');
            } else if (message === 'readyok') {
                stockfishReady = true;
                hideLoading();
                stockfish.postMessage('eval');
            } else if (message.startsWith('bestmove')) {
                const bestMove = message.split(' ')[1];
                if (stockfishResolve && bestMove && bestMove !== '(none)') {
                    stockfishResolve(bestMove);
                    stockfishResolve = null;
                }
            }
        };
        stockfish.onerror = function(e) {
            stockfishReady = false;
            hideLoading();
        };
        stockfish.postMessage('uci');
    } catch (e) {
        stockfishReady = false;
        hideLoading();
    }
}

function boardToFEN(boardState) {
    let fen = '';
    for (let row = 0; row < 8; row++) {
        let empty = 0;
        for (let col = 0; col < 8; col++) {
            const piece = boardState[row][col];
            if (piece) { if (empty > 0) { fen += empty; empty = 0; } fen += piece; }
            else { empty++; }
        }
        if (empty > 0) fen += empty;
        if (row < 7) fen += '/';
    }
    fen += ' ' + (currentTurn === 'white' ? 'w' : 'b');
    let castling = '';
    if (!whiteKingMoved) { if (!whiteRookKingsideMoved) castling += 'K'; if (!whiteRookQueensideMoved) castling += 'Q'; }
    if (!blackKingMoved) { if (!blackRookKingsideMoved) castling += 'k'; if (!blackRookQueensideMoved) castling += 'q'; }
    fen += ' ' + (castling || '-');
    if (enPassantTarget) { fen += ' ' + 'abcdefgh'[enPassantTarget.col] + '87654321'[enPassantTarget.row]; }
    else { fen += ' -'; }
    fen += ' 0 ' + Math.floor(moveHistory.length / 2 + 1);
    return fen;
}

function parseStockfishMove(moveStr, boardState) {
    if (!moveStr || moveStr.length < 4) return null;
    const files = 'abcdefgh', ranks = '87654321';
    const fromCol = files.indexOf(moveStr[0]), fromRow = ranks.indexOf(moveStr[1]);
    const toCol = files.indexOf(moveStr[2]), toRow = ranks.indexOf(moveStr[3]);
    if (fromCol < 0 || fromRow < 0 || toCol < 0 || toRow < 0) return null;
    const piece = boardState[fromRow][fromCol];
    if (!piece) return null;
    const moves = getValidMoves(fromRow, fromCol, boardState, true);
    const moveInfo = moves.find(m => m.row === toRow && m.col === toCol);
    if (!moveInfo) return { fromRow, fromCol, toRow, toCol, moveInfo: { row: toRow, col: toCol } };
    if (moveStr.length === 5) moveInfo.promotion = moveStr[4];
    return { fromRow, fromCol, toRow, toCol, moveInfo };
}

async function getStockfishMove(boardState) {
    if (!stockfishReady || !stockfish) {
        return null;
    }
    const fen = boardToFEN(boardState);
    return new Promise((resolve) => {
        const isOpening = moveHistory.length < 6;
        let candidates = new Map();
        let resolved = false;
        
        if (isOpening) stockfish.postMessage('setoption name MultiPV value 3');
        else stockfish.postMessage('setoption name MultiPV value 1');

        stockfish.onmessage = function(event) {
            const msg = event.data;
            if (isOpening && msg.startsWith('info') && msg.includes(' pv ') && msg.includes('score')) {
                try {
                    const pvMatch = msg.match(/ pv ([a-h][1-8][a-h][1-8][qrbn]?)/);
                    const scoreMatch = msg.match(/score (cp|mate) (-?\d+)/);
                    if (pvMatch && scoreMatch) {
                        const move = pvMatch[1];
                        const type = scoreMatch[1];
                        const val = parseInt(scoreMatch[2]);
                        const score = type === 'mate' ? (val > 0 ? 100000 - val : -100000 - val) : val;
                        candidates.set(move, score);
                    }
                } catch (e) {}
            }
            if (msg.startsWith('bestmove') && !resolved) {
                resolved = true;
                let best = msg.split(' ')[1];
                if (isOpening && candidates.size > 1) {
                    let maxScore = -Infinity;
                    candidates.forEach(s => { if (s > maxScore) maxScore = s; });
                    const validOptions = [];
                    candidates.forEach((score, move) => {
                        if (score >= maxScore - 20) validOptions.push(move);
                    });
                    if (validOptions.length > 0) {
                        best = validOptions[Math.floor(Math.random() * validOptions.length)];
                    }
                }
                resolve(parseStockfishMove(best, boardState));
            }
        };
        
        setTimeout(() => { if (!resolved) { resolved = true; resolve(null); } }, STOCKFISH_TIME + 1000);
        stockfish.postMessage('position fen ' + fen);
        stockfish.postMessage('go depth ' + STOCKFISH_DEPTH + ' movetime ' + STOCKFISH_TIME);
    });
}


document.addEventListener('DOMContentLoaded', () => { initGame(); setupEventListeners(); });

function setupEventListeners() {
    newGameBtn.addEventListener('click', initGame);
    copyBtn.addEventListener('click', copyKey);
    document.querySelectorAll('.promotion-btn').forEach(btn => btn.addEventListener('click', () => handlePromotion(btn.dataset.piece)));
}

function initGame() {
    board = [['r','n','b','q','k','b','n','r'],['p','p','p','p','p','p','p','p'],[null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null],['P','P','P','P','P','P','P','P'],['R','N','B','Q','K','B','N','R']];
    currentTurn = 'white'; selectedCell = null; validMoves = []; moveHistory = []; capturedWhite = []; capturedBlack = [];
    gameOver = false; lastMove = null; whiteKingMoved = false; blackKingMoved = false;
    whiteRookKingsideMoved = false; whiteRookQueensideMoved = false; blackRookKingsideMoved = false; blackRookQueensideMoved = false;
    enPassantTarget = null; promotionPending = null; recentAIMoves = [];
    if (!stockfish) initStockfish();
    hideKeyDisplay(); updateStatus('Your turn - Select a piece to move'); updateTurnIndicator(); updateCapturedPieces(); updateMoveHistory(); renderBoard();
}

function renderBoard() {
    boardElement.innerHTML = '';
    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            const cell = document.createElement('div');
            cell.className = 'cell ' + ((row + col) % 2 === 0 ? 'light' : 'dark');
            if (lastMove && ((lastMove.fromRow === row && lastMove.fromCol === col) || (lastMove.toRow === row && lastMove.toCol === col))) cell.classList.add('last-move');
            const piece = board[row][col];
            if (piece) {
                const pe = document.createElement('span');
                pe.className = 'piece ' + (isWhitePiece(piece) ? 'white' : 'black');
                pe.textContent = getPieceSymbol(piece);
                cell.appendChild(pe);
                if (piece.toLowerCase() === 'k' && isInCheck(isWhitePiece(piece) ? 'white' : 'black', board)) cell.classList.add('check');
            }
            if (selectedCell && selectedCell.row === row && selectedCell.col === col) cell.classList.add('selected');
            if (validMoves.some(m => m.row === row && m.col === col)) { cell.classList.add('valid-move'); if (board[row][col]) cell.classList.add('has-piece'); }
            cell.addEventListener('click', () => handleCellClick(row, col));
            boardElement.appendChild(cell);
        }
    }
}

function getPieceSymbol(p) { return { K: PIECES.WHITE_KING, Q: PIECES.WHITE_QUEEN, R: PIECES.WHITE_ROOK, B: PIECES.WHITE_BISHOP, N: PIECES.WHITE_KNIGHT, P: PIECES.WHITE_PAWN, k: PIECES.BLACK_KING, q: PIECES.BLACK_QUEEN, r: PIECES.BLACK_ROOK, b: PIECES.BLACK_BISHOP, n: PIECES.BLACK_KNIGHT, p: PIECES.BLACK_PAWN }[p] || ''; }
function isWhitePiece(p) { return p === p.toUpperCase(); }

function handleCellClick(row, col) {
    if (gameOver || currentTurn !== 'white') return;
    const piece = board[row][col];
    if (selectedCell) {
        const move = validMoves.find(m => m.row === row && m.col === col);
        if (move) { makeMove(selectedCell.row, selectedCell.col, row, col, move); return; }
        if (piece && isWhitePiece(piece)) { selectPiece(row, col); return; }
        deselectPiece(); return;
    }
    if (piece && isWhitePiece(piece)) selectPiece(row, col);
}

function selectPiece(row, col) { selectedCell = { row, col }; validMoves = getValidMoves(row, col, board, true); renderBoard(); }
function deselectPiece() { selectedCell = null; validMoves = []; renderBoard(); }

function makeMove(fromRow, fromCol, toRow, toCol, moveInfo) {
    const piece = board[fromRow][fromCol], captured = board[toRow][toCol];
    if (moveInfo && moveInfo.enPassant) { const cpRow = currentTurn === 'white' ? toRow + 1 : toRow - 1; (currentTurn === 'white' ? capturedBlack : capturedWhite).push(board[cpRow][toCol]); board[cpRow][toCol] = null; }
    if (moveInfo && moveInfo.castling) { if (moveInfo.castling === 'kingside') { board[toRow][5] = board[toRow][7]; board[toRow][7] = null; } else { board[toRow][3] = board[toRow][0]; board[toRow][0] = null; } }
    if (captured) (isWhitePiece(captured) ? capturedWhite : capturedBlack).push(captured);
    board[toRow][toCol] = piece; board[fromRow][fromCol] = null;
    if (piece === 'K') whiteKingMoved = true; else if (piece === 'k') blackKingMoved = true;
    else if (piece === 'R') { if (fromRow === 7 && fromCol === 0) whiteRookQueensideMoved = true; if (fromRow === 7 && fromCol === 7) whiteRookKingsideMoved = true; }
    else if (piece === 'r') { if (fromRow === 0 && fromCol === 0) blackRookQueensideMoved = true; if (fromRow === 0 && fromCol === 7) blackRookKingsideMoved = true; }
    enPassantTarget = null;
    if (piece.toLowerCase() === 'p' && Math.abs(toRow - fromRow) === 2) enPassantTarget = { row: (fromRow + toRow) / 2, col: fromCol };
    if (piece.toLowerCase() === 'p' && (toRow === 0 || toRow === 7)) {
        if (currentTurn === 'white') { promotionPending = { row: toRow, col: toCol }; showPromotionModal(); return; }
        else board[toRow][toCol] = 'q';
    }
    recordMove(piece, fromRow, fromCol, toRow, toCol, captured, moveInfo);
    lastMove = { fromRow, fromCol, toRow, toCol }; selectedCell = null; validMoves = []; switchTurn();
}

function recordMove(piece, fromRow, fromCol, toRow, toCol, captured, moveInfo) {
    const files = 'abcdefgh', ranks = '87654321';
    let notation = '';
    if (moveInfo && moveInfo.castling) notation = moveInfo.castling === 'kingside' ? 'O-O' : 'O-O-O';
    else {
        if (piece.toLowerCase() !== 'p') notation += piece.toUpperCase();
        if (captured || (moveInfo && moveInfo.enPassant)) { if (piece.toLowerCase() === 'p') notation += files[fromCol]; notation += 'x'; }
        notation += files[toCol] + ranks[toRow];
        if (moveInfo && moveInfo.promotion) notation += '=' + moveInfo.promotion.toUpperCase();
    }
    const opp = currentTurn === 'white' ? 'black' : 'white';
    if (isInCheck(opp, board)) notation += isCheckmate(opp, board) ? '#' : '+';
    moveHistory.push({ notation, color: currentTurn }); updateMoveHistory();
}

function switchTurn() {
    currentTurn = currentTurn === 'white' ? 'black' : 'white';
    updateTurnIndicator(); updateCapturedPieces(); renderBoard();
    if (isCheckmate(currentTurn, board)) { gameOver = true; updateStatus(currentTurn === 'black' ? 'Checkmate! You win!' : 'Checkmate! AI wins!', currentTurn === 'black' ? 'win' : 'checkmate'); if (currentTurn === 'black') generateKey(); return; }
    if (isStalemate(currentTurn, board)) { gameOver = true; updateStatus('Stalemate! Draw!', ''); return; }
    if (isInCheck(currentTurn, board)) updateStatus(currentTurn === 'white' ? 'You are in check!' : 'AI is in check!', 'check');
    else updateStatus(currentTurn === 'white' ? 'Your turn - Select a piece to move' : 'Stockfish is thinking...');
    if (currentTurn === 'black' && !gameOver) setTimeout(makeAIMove, 100);
}

function showPromotionModal() { promotionModal.style.display = 'flex'; }
function hidePromotionModal() { promotionModal.style.display = 'none'; }
function handlePromotion(pieceType) { if (!promotionPending) return; board[promotionPending.row][promotionPending.col] = pieceType.toUpperCase(); promotionPending = null; hidePromotionModal(); switchTurn(); }

function getValidMoves(row, col, boardState, checkLegal = true) {
    const piece = boardState[row][col]; if (!piece) return [];
    const color = isWhitePiece(piece) ? 'white' : 'black';
    let moves = [];
    switch (piece.toLowerCase()) {
        case 'p': moves = getPawnMoves(row, col, color, boardState); break;
        case 'r': moves = getSlidingMoves(row, col, color, boardState, [[0,1],[0,-1],[1,0],[-1,0]]); break;
        case 'n': moves = getKnightMoves(row, col, color, boardState); break;
        case 'b': moves = getSlidingMoves(row, col, color, boardState, [[1,1],[1,-1],[-1,1],[-1,-1]]); break;
        case 'q': moves = getSlidingMoves(row, col, color, boardState, [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]); break;
        case 'k': moves = getKingMoves(row, col, color, boardState); break;
    }
    if (checkLegal) moves = moves.filter(m => !isInCheck(color, simulateMove(boardState, row, col, m.row, m.col, m)));
    return moves;
}

function getPawnMoves(row, col, color, bs) {
    const moves = [], dir = color === 'white' ? -1 : 1, start = color === 'white' ? 6 : 1;
    if (isValid(row + dir, col) && !bs[row + dir][col]) { moves.push({ row: row + dir, col }); if (row === start && !bs[row + 2 * dir][col]) moves.push({ row: row + 2 * dir, col }); }
    for (const dc of [-1, 1]) { const nr = row + dir, nc = col + dc; if (isValid(nr, nc)) { const t = bs[nr][nc]; if (t && isWhitePiece(t) !== (color === 'white')) moves.push({ row: nr, col: nc }); if (enPassantTarget && enPassantTarget.row === nr && enPassantTarget.col === nc) moves.push({ row: nr, col: nc, enPassant: true }); } }
    return moves;
}

function getSlidingMoves(row, col, color, bs, dirs) {
    const moves = [];
    for (const [dr, dc] of dirs) { let r = row + dr, c = col + dc; while (isValid(r, c)) { const t = bs[r][c]; if (!t) moves.push({ row: r, col: c }); else { if (isWhitePiece(t) !== (color === 'white')) moves.push({ row: r, col: c }); break; } r += dr; c += dc; } }
    return moves;
}

function getKnightMoves(row, col, color, bs) {
    const moves = [];
    for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) { const r = row + dr, c = col + dc; if (isValid(r, c)) { const t = bs[r][c]; if (!t || isWhitePiece(t) !== (color === 'white')) moves.push({ row: r, col: c }); } }
    return moves;
}

function getKingMoves(row, col, color, bs) {
    const moves = [];
    for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) { const r = row + dr, c = col + dc; if (isValid(r, c)) { const t = bs[r][c]; if (!t || isWhitePiece(t) !== (color === 'white')) moves.push({ row: r, col: c }); } }
    const km = color === 'white' ? whiteKingMoved : blackKingMoved, kr = color === 'white' ? 7 : 0;
    if (!km && row === kr && col === 4 && !isInCheck(color, bs)) {
        const rks = color === 'white' ? whiteRookKingsideMoved : blackRookKingsideMoved;
        if (!rks && !bs[kr][5] && !bs[kr][6] && bs[kr][7]?.toLowerCase() === 'r' && !isSquareAttacked(kr, 5, color === 'white' ? 'black' : 'white', bs) && !isSquareAttacked(kr, 6, color === 'white' ? 'black' : 'white', bs)) moves.push({ row: kr, col: 6, castling: 'kingside' });
        const rqs = color === 'white' ? whiteRookQueensideMoved : blackRookQueensideMoved;
        if (!rqs && !bs[kr][1] && !bs[kr][2] && !bs[kr][3] && bs[kr][0]?.toLowerCase() === 'r' && !isSquareAttacked(kr, 2, color === 'white' ? 'black' : 'white', bs) && !isSquareAttacked(kr, 3, color === 'white' ? 'black' : 'white', bs)) moves.push({ row: kr, col: 2, castling: 'queenside' });
    }
    return moves;
}

function isValid(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

function simulateMove(bs, fr, fc, tr, tc, mi) {
    const nb = bs.map(r => [...r]);
    if (mi?.enPassant) nb[isWhitePiece(nb[fr][fc]) ? tr + 1 : tr - 1][tc] = null;
    if (mi?.castling) { if (mi.castling === 'kingside') { nb[tr][5] = nb[tr][7]; nb[tr][7] = null; } else { nb[tr][3] = nb[tr][0]; nb[tr][0] = null; } }
    nb[tr][tc] = nb[fr][fc]; nb[fr][fc] = null;
    return nb;
}

function findKing(color, bs) { const k = color === 'white' ? 'K' : 'k'; for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (bs[r][c] === k) return { row: r, col: c }; return null; }
function isInCheck(color, bs) { const k = findKing(color, bs); return k ? isSquareAttacked(k.row, k.col, color === 'white' ? 'black' : 'white', bs) : false; }

function isSquareAttacked(row, col, by, bs) {
    const pd = by === 'white' ? 1 : -1, pp = by === 'white' ? 'P' : 'p';
    for (const dc of [-1, 1]) { const r = row + pd, c = col + dc; if (isValid(r, c) && bs[r][c] === pp) return true; }
    const np = by === 'white' ? 'N' : 'n';
    for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) { const r = row + dr, c = col + dc; if (isValid(r, c) && bs[r][c] === np) return true; }
    const kp = by === 'white' ? 'K' : 'k';
    for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) { const r = row + dr, c = col + dc; if (isValid(r, c) && bs[r][c] === kp) return true; }
    const rp = by === 'white' ? 'R' : 'r', qp = by === 'white' ? 'Q' : 'q';
    for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) { let r = row + dr, c = col + dc; while (isValid(r, c)) { const p = bs[r][c]; if (p) { if (p === rp || p === qp) return true; break; } r += dr; c += dc; } }
    const bp = by === 'white' ? 'B' : 'b';
    for (const [dr, dc] of [[1,1],[1,-1],[-1,1],[-1,-1]]) { let r = row + dr, c = col + dc; while (isValid(r, c)) { const p = bs[r][c]; if (p) { if (p === bp || p === qp) return true; break; } r += dr; c += dc; } }
    return false;
}

function isCheckmate(color, bs) { return isInCheck(color, bs) && !hasLegalMoves(color, bs); }
function isStalemate(color, bs) { return !isInCheck(color, bs) && !hasLegalMoves(color, bs); }
function hasLegalMoves(color, bs) { for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const p = bs[r][c]; if (p && (isWhitePiece(p) ? 'white' : 'black') === color && getValidMoves(r, c, bs, true).length > 0) return true; } return false; }

async function makeAIMove() {
    if (gameOver || currentTurn !== 'black') return;
    boardElement.classList.add('ai-thinking');
    const bestMove = await getStockfishMove(board);
    boardElement.classList.remove('ai-thinking');
    if (bestMove) {
        selectedCell = { row: bestMove.fromRow, col: bestMove.fromCol };
        makeMove(bestMove.fromRow, bestMove.fromCol, bestMove.toRow, bestMove.toCol, bestMove.moveInfo);
    }
}

function updateStatus(msg, cls = '') { statusText.textContent = msg; statusText.className = cls; }
function updateTurnIndicator() { currentTurnElement.textContent = currentTurn === 'white' ? 'White (You)' : 'Black (AI)'; }
function updateCapturedPieces() { whiteCapturedElement.textContent = capturedWhite.map(getPieceSymbol).join(' '); blackCapturedElement.textContent = capturedBlack.map(getPieceSymbol).join(' '); }
function updateMoveHistory() { movesListElement.innerHTML = ''; for (let i = 0; i < moveHistory.length; i += 2) { const e = document.createElement('span'); e.className = 'move-entry'; e.textContent = `${Math.floor(i/2)+1}. ${moveHistory[i].notation}${moveHistory[i+1] ? ' ' + moveHistory[i+1].notation : ''}`; movesListElement.appendChild(e); } movesListElement.scrollTop = movesListElement.scrollHeight; }

async function generateKey() { try { const r = await fetch('/api/chess-win', { method: 'POST' }); if (r.ok) { const d = await r.json(); if (d.key) showKeyDisplay(d.key); } else showKeyDisplay(genLocalKey()); } catch { showKeyDisplay(genLocalKey()); } }
function genLocalKey() { const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; let k = 'CHESS-'; for (let i = 0; i < 4; i++) { if (i > 0) k += '-'; for (let j = 0; j < 4; j++) k += c[Math.floor(Math.random() * c.length)]; } return k; }
function showKeyDisplay(key) { keyValue.textContent = key; keyDisplay.style.display = 'block'; if (proxyLink) proxyLink.href = `https://lmarena.ai/?key=${encodeURIComponent(key)}`; }
function hideKeyDisplay() { keyDisplay.style.display = 'none'; keyValue.textContent = ''; }
function copyKey() { if (!keyValue?.textContent) return; navigator.clipboard.writeText(keyValue.textContent).then(() => { copyBtn.textContent = '✅ Copied!'; setTimeout(() => copyBtn.textContent = '📋 Copy', 2000); }); }