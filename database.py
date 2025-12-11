import sqlite3
import json
import os
from datetime import datetime
from contextlib import contextmanager

DATABASE_PATH = os.environ.get('DATABASE_PATH', 'minesweeper.db')

@contextmanager
def get_db_connection():
    """Context manager for database connections."""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

def init_db():
    """Initialize the database with required tables."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        
        # Create game_sessions table (for Minesweeper)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS game_sessions (
                session_id TEXT PRIMARY KEY,
                mines_json TEXT NOT NULL,
                revealed_json TEXT DEFAULT '[]',
                flagged_json TEXT DEFAULT '[]',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed BOOLEAN DEFAULT 0
            )
        ''')
        
        # Create blackjack_sessions table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS blackjack_sessions (
                session_id TEXT PRIMARY KEY,
                deck_json TEXT NOT NULL,
                player_hand_json TEXT DEFAULT '[]',
                dealer_hand_json TEXT DEFAULT '[]',
                win_streak INTEGER DEFAULT 0,
                game_state TEXT DEFAULT 'waiting',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                ip_address TEXT
            )
        ''')
        
        # Create keys table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS keys (
                key_value TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT 1,
                ip_address TEXT,
                FOREIGN KEY (session_id) REFERENCES game_sessions(session_id)
            )
        ''')

        # Create settings table for dynamic configuration
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        ''')
        
        conn.commit()

def create_game_session(session_id, mines_data):
    """
    Create a new game session with mine positions.
    
    Args:
        session_id: Unique identifier for the game session
        mines_data: List of [x, y] positions for mines
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO game_sessions (session_id, mines_json, revealed_json, flagged_json)
            VALUES (?, ?, '[]', '[]')
        ''', (session_id, json.dumps(mines_data)))
        conn.commit()

def get_game_session(session_id):
    """
    Retrieve a game session by its ID.
    
    Args:
        session_id: The session ID to look up
        
    Returns:
        Dictionary with session data or None if not found
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT session_id, mines_json, revealed_json, flagged_json, created_at, completed
            FROM game_sessions
            WHERE session_id = ?
        ''', (session_id,))
        row = cursor.fetchone()
        
        if row:
            return {
                'session_id': row['session_id'],
                'mines': json.loads(row['mines_json']),
                'revealed': json.loads(row['revealed_json']),
                'flagged': json.loads(row['flagged_json']),
                'created_at': row['created_at'],
                'completed': bool(row['completed'])
            }
        return None

def update_game_session(session_id, revealed, flagged):
    """
    Update the revealed and flagged cells for a game session.
    
    Args:
        session_id: The session ID to update
        revealed: List of [x, y] positions that have been revealed
        flagged: List of [x, y] positions that have been flagged
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE game_sessions
            SET revealed_json = ?, flagged_json = ?
            WHERE session_id = ?
        ''', (json.dumps(revealed), json.dumps(flagged), session_id))
        conn.commit()

def mark_game_completed(session_id):
    """
    Mark a game session as completed.
    
    Args:
        session_id: The session ID to mark as completed
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE game_sessions
            SET completed = 1
            WHERE session_id = ?
        ''', (session_id,))
        conn.commit()

def create_key(key_value, session_id, ip_address=None):
    """
    Create a new key in the database.
    
    Args:
        key_value: The key string (format: MINE-XXXX-XXXX-XXXX-XXXX)
        session_id: The game session that generated this key
        ip_address: Optional IP address of the client
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO keys (key_value, session_id, ip_address)
            VALUES (?, ?, ?)
            ON CONFLICT(key_value) DO UPDATE SET
            created_at = CURRENT_TIMESTAMP,
            is_active = 1,
            session_id = excluded.session_id,
            ip_address = excluded.ip_address
        ''', (key_value, session_id, ip_address))
        conn.commit()

def verify_key(key_value):
    """
    Verify if a key is valid and active.
    
    Args:
        key_value: The key to verify
        
    Returns:
        True if key exists and is active, False otherwise
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT is_active FROM keys WHERE key_value = ?
        ''', (key_value,))
        row = cursor.fetchone()
        
        if row:
            return bool(row['is_active'])
        return False

def revoke_key(key_value):
    """
    Revoke (deactivate) a key.
    
    Args:
        key_value: The key to revoke
        
    Returns:
        True if key was found and revoked, False if key not found
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE keys SET is_active = 0 WHERE key_value = ?
        ''', (key_value,))
        conn.commit()
        return cursor.rowcount > 0

def get_all_keys():
    """
    Get all keys from database.
    
    Returns:
        List of dictionaries containing key information
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT key_value, session_id, created_at, is_active, ip_address
            FROM keys
            ORDER BY created_at DESC
        ''')
        keys = []
        for row in cursor.fetchall():
            keys.append({
                'key_value': row['key_value'],
                'session_id': row['session_id'],
                'created_at': row['created_at'],
                'is_active': bool(row['is_active']),
                'ip_address': row['ip_address']
            })
        return keys

def get_key_stats():
    """
    Get key statistics.
    
    Returns:
        Dictionary with total, active, and revoked key counts
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT COUNT(*) as count FROM keys')
        total = cursor.fetchone()['count']
        
        cursor.execute('SELECT COUNT(*) as count FROM keys WHERE is_active = 1')
        active = cursor.fetchone()['count']
        
        revoked = total - active
        
        return {
            'total': total,
            'active': active,
            'revoked': revoked
        }

# ==================== BLACKJACK FUNCTIONS ====================

def create_blackjack_session(session_id, deck, ip_address=None):
    """
    Create a new blackjack session.
    
    Args:
        session_id: Unique identifier for the session
        deck: List of card dictionaries
        ip_address: Client IP address
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO blackjack_sessions (session_id, deck_json, player_hand_json, dealer_hand_json, win_streak, game_state, ip_address)
            VALUES (?, ?, '[]', '[]', 0, 'waiting', ?)
        ''', (session_id, json.dumps(deck), ip_address))
        conn.commit()

def get_blackjack_session(session_id):
    """
    Retrieve a blackjack session by its ID.
    
    Args:
        session_id: The session ID to look up
        
    Returns:
        Dictionary with session data or None if not found
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT session_id, deck_json, player_hand_json, dealer_hand_json, win_streak, game_state, created_at, ip_address
            FROM blackjack_sessions
            WHERE session_id = ?
        ''', (session_id,))
        row = cursor.fetchone()
        
        if row:
            return {
                'session_id': row['session_id'],
                'deck': json.loads(row['deck_json']),
                'player_hand': json.loads(row['player_hand_json']),
                'dealer_hand': json.loads(row['dealer_hand_json']),
                'win_streak': row['win_streak'],
                'game_state': row['game_state'],
                'created_at': row['created_at'],
                'ip_address': row['ip_address']
            }
        return None

def update_blackjack_session(session_id, deck=None, player_hand=None, dealer_hand=None, win_streak=None, game_state=None):
    """
    Update a blackjack session.
    
    Args:
        session_id: The session ID to update
        deck: Updated deck (optional)
        player_hand: Updated player hand (optional)
        dealer_hand: Updated dealer hand (optional)
        win_streak: Updated win streak (optional)
        game_state: Updated game state (optional)
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        
        # Build dynamic update query
        updates = []
        params = []
        
        if deck is not None:
            updates.append('deck_json = ?')
            params.append(json.dumps(deck))
        if player_hand is not None:
            updates.append('player_hand_json = ?')
            params.append(json.dumps(player_hand))
        if dealer_hand is not None:
            updates.append('dealer_hand_json = ?')
            params.append(json.dumps(dealer_hand))
        if win_streak is not None:
            updates.append('win_streak = ?')
            params.append(win_streak)
        if game_state is not None:
            updates.append('game_state = ?')
            params.append(game_state)
        
        if updates:
            params.append(session_id)
            query = f"UPDATE blackjack_sessions SET {', '.join(updates)} WHERE session_id = ?"
            cursor.execute(query, params)
            conn.commit()

def get_or_create_blackjack_session_by_ip(ip_address):
    """
    Get existing blackjack session for IP or return None.
    
    Args:
        ip_address: Client IP address
        
    Returns:
        Session data or None
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT session_id, deck_json, player_hand_json, dealer_hand_json, win_streak, game_state, created_at, ip_address
            FROM blackjack_sessions
            WHERE ip_address = ?
            ORDER BY created_at DESC
            LIMIT 1
        ''', (ip_address,))
        row = cursor.fetchone()
        
        if row:
            return {
                'session_id': row['session_id'],
                'deck': json.loads(row['deck_json']),
                'player_hand': json.loads(row['player_hand_json']),
                'dealer_hand': json.loads(row['dealer_hand_json']),
                'win_streak': row['win_streak'],
                'game_state': row['game_state'],
                'created_at': row['created_at'],
                'ip_address': row['ip_address']
            }
        return None

def delete_blackjack_session(session_id):
    """
    Delete a blackjack session.
    
    Args:
        session_id: The session ID to delete
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM blackjack_sessions WHERE session_id = ?', (session_id,))
        conn.commit()

def get_setting(key, default=None):
    """Get a setting value."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT value FROM settings WHERE key = ?', (key,))
        row = cursor.fetchone()
        return row['value'] if row else default

def set_setting(key, value):
    """Set a setting value."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', (key, value))
        conn.commit()