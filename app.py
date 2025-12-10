from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import uuid
import random
import string
import os
import json

# Get port from environment variable (for Cloud Run)
PORT = int(os.environ.get('PORT', 5000))

# Database path (configurable for production)
DATABASE_PATH = os.environ.get('DATABASE_PATH', 'minesweeper.db')

from database import (
    init_db,
    create_game_session,
    get_game_session,
    update_game_session,
    mark_game_completed,
    create_key,
    verify_key,
    revoke_key,
    get_all_keys,
    get_key_stats
)

app = Flask(__name__, static_folder='static')
CORS(app)

@app.after_request
def add_header(response):
    response.headers['Cross-Origin-Opener-Policy'] = 'same-origin'
    response.headers['Cross-Origin-Embedder-Policy'] = 'require-corp'
    return response

# Game configuration
BOARD_SIZE = 25
TOTAL_MINES = 120

def generate_key():
    """Generate a key in format MINE-XXXX-XXXX-XXXX-XXXX"""
    segments = []
    for _ in range(4):
        segment = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
        segments.append(segment)
    return 'MINE-' + '-'.join(segments)

def generate_mines(board_size, total_mines):
    """Generate random mine positions."""
    positions = set()
    while len(positions) < total_mines:
        x = random.randint(0, board_size - 1)
        y = random.randint(0, board_size - 1)
        positions.add((x, y))
    return [[x, y] for x, y in positions]

def count_adjacent_mines(x, y, mines):
    """Count the number of mines adjacent to a cell."""
    mines_set = {tuple(m) for m in mines}
    count = 0
    for dx in [-1, 0, 1]:
        for dy in [-1, 0, 1]:
            if dx == 0 and dy == 0:
                continue
            nx, ny = x + dx, y + dy
            if (nx, ny) in mines_set:
                count += 1
    return count

def flood_fill(x, y, mines, revealed, board_size):
    """
    Perform flood fill to reveal all connected cells with 0 adjacent mines.
    Returns list of newly revealed cells with their adjacent mine counts.
    """
    mines_set = {tuple(m) for m in mines}
    revealed_set = {tuple(r) for r in revealed}
    to_reveal = []
    stack = [(x, y)]
    visited = set()
    
    while stack:
        cx, cy = stack.pop()
        
        if (cx, cy) in visited:
            continue
        if cx < 0 or cx >= board_size or cy < 0 or cy >= board_size:
            continue
        if (cx, cy) in mines_set:
            continue
        if (cx, cy) in revealed_set:
            continue
            
        visited.add((cx, cy))
        adjacent = count_adjacent_mines(cx, cy, mines)
        to_reveal.append({'x': cx, 'y': cy, 'adjacent': adjacent})
        revealed_set.add((cx, cy))
        
        # If this cell has 0 adjacent mines, continue flood fill
        if adjacent == 0:
            for dx in [-1, 0, 1]:
                for dy in [-1, 0, 1]:
                    if dx == 0 and dy == 0:
                        continue
                    stack.append((cx + dx, cy + dy))
    
    return to_reveal

@app.route('/')
def index():
    """Serve the main game page."""
    return send_from_directory('static', 'index.html')

@app.route('/chess')
def chess_page():
    """Serve the chess game page."""
    return send_from_directory('static', 'chess.html')

@app.route('/admin')
def admin_page():
    """Serve the admin panel page."""
    return send_from_directory('static', 'admin.html')

@app.route('/api/new-game', methods=['POST'])
def new_game():
    """Create a new game session."""
    session_id = str(uuid.uuid4())
    mines = generate_mines(BOARD_SIZE, TOTAL_MINES)
    
    create_game_session(session_id, mines)
    
    return jsonify({
        'session_id': session_id,
        'board_size': BOARD_SIZE,
        'total_mines': TOTAL_MINES
    })

@app.route('/api/click', methods=['POST'])
def click():
    """Handle a cell click."""
    data = request.get_json()
    session_id = data.get('session_id')
    x = data.get('x')
    y = data.get('y')
    
    if session_id is None or x is None or y is None:
        return jsonify({'error': 'Missing required parameters'}), 400
    
    session = get_game_session(session_id)
    if not session:
        return jsonify({'error': 'Invalid session'}), 404
    
    if session['completed']:
        return jsonify({'error': 'Game already completed'}), 400
    
    mines = session['mines']
    revealed = session['revealed']
    
    # Check if cell is already revealed
    if [x, y] in revealed:
        return jsonify({'error': 'Cell already revealed'}), 400
    
    # Check if clicked on a mine
    if [x, y] in mines:
        mark_game_completed(session_id)
        return jsonify({
            'result': 'boom',
            'mines': mines  # Reveal all mines on game over
        })
    
    # Safe cell - perform flood fill
    newly_revealed = flood_fill(x, y, mines, revealed, BOARD_SIZE)
    
    # Update revealed cells in database
    for cell in newly_revealed:
        if [cell['x'], cell['y']] not in revealed:
            revealed.append([cell['x'], cell['y']])
    
    update_game_session(session_id, revealed, session['flagged'])
    
    return jsonify({
        'result': 'safe',
        'revealed': newly_revealed
    })

@app.route('/api/flag', methods=['POST'])
def flag():
    """Toggle flag on a cell."""
    data = request.get_json()
    session_id = data.get('session_id')
    x = data.get('x')
    y = data.get('y')
    
    if session_id is None or x is None or y is None:
        return jsonify({'error': 'Missing required parameters'}), 400
    
    session = get_game_session(session_id)
    if not session:
        return jsonify({'error': 'Invalid session'}), 404
    
    if session['completed']:
        return jsonify({'error': 'Game already completed'}), 400
    
    revealed = session['revealed']
    flagged = session['flagged']
    
    # Can't flag revealed cells
    if [x, y] in revealed:
        return jsonify({'error': 'Cannot flag revealed cell'}), 400
    
    # Toggle flag
    is_flagged = False
    if [x, y] in flagged:
        flagged.remove([x, y])
        is_flagged = False
    else:
        flagged.append([x, y])
        is_flagged = True
    
    update_game_session(session_id, revealed, flagged)
    
    return jsonify({
        'success': True,
        'flagged': is_flagged
    })

@app.route('/api/check-win', methods=['GET'])
def check_win():
    """Check if the player has won the game."""
    session_id = request.args.get('session_id')
    
    if not session_id:
        return jsonify({'error': 'Missing session_id'}), 400
    
    session = get_game_session(session_id)
    if not session:
        return jsonify({'error': 'Invalid session'}), 404
    
    mines = session['mines']
    revealed = session['revealed']
    
    # Total cells minus mines = cells that need to be revealed to win
    total_cells = BOARD_SIZE * BOARD_SIZE
    safe_cells = total_cells - TOTAL_MINES
    
    if len(revealed) >= safe_cells:
        # Player has won!
        mark_game_completed(session_id)
        
        # Generate and save key
        key = generate_key()
        ip_address = request.remote_addr
        create_key(key, session_id, ip_address)
        
        return jsonify({
            'won': True,
            'key': key
        })
    
    return jsonify({
        'won': False,
        'revealed_count': len(revealed),
        'required_count': safe_cells
    })

@app.route('/api/verify-key', methods=['GET'])
def verify_key_endpoint():
    """Verify if a key is valid."""
    key = request.args.get('key')
    
    if not key:
        return jsonify({'error': 'Missing key parameter'}), 400
    
    is_valid = verify_key(key)
    
    return jsonify({
        'valid': is_valid
    })

@app.route('/api/revoke-key', methods=['POST'])
def revoke_key_endpoint():
    """Revoke a key."""
    data = request.get_json()
    key = data.get('key')
    
    if not key:
        return jsonify({'error': 'Missing key parameter'}), 400
    
    success = revoke_key(key)
    
    return jsonify({
        'success': success
    })

@app.route('/api/admin/keys', methods=['GET'])
def get_all_keys_endpoint():
    """Get all keys (admin endpoint)."""
    keys = get_all_keys()
    return jsonify({'keys': keys})

@app.route('/api/admin/stats', methods=['GET'])
def get_stats_endpoint():
    """Get key statistics (admin endpoint)."""
    stats = get_key_stats()
    return jsonify(stats)

@app.route('/api/chess-win', methods=['POST'])
def chess_win():
    """Generate a key when player wins chess game."""
    key = generate_key().replace('MINE-', 'CHESS-')
    ip_address = request.remote_addr
    create_key(key, 'chess-game', ip_address)
    
    return jsonify({
        'success': True,
        'key': key
    })

if __name__ == '__main__':
    # Initialize database on startup
    init_db()
    
    # Create static folder if it doesn't exist
    os.makedirs('static', exist_ok=True)
    
    # Run the app
    app.run(host='0.0.0.0', port=PORT, debug=False)