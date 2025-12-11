// Casino Blackjack Game - Server-Controlled (Anti-Cheat)
class BlackjackGame {
    constructor() {
        this.sessionId = null;
        this.playerHand = [];
        this.dealerHand = [];
        this.winStreak = 0;
        this.totalWins = 0;
        this.totalLosses = 0;
        this.gameInProgress = false;
        this.targetWins = 10;
        
        // DOM Elements
        this.dealerCardsEl = document.getElementById('dealerCards');
        this.playerCardsEl = document.getElementById('playerCards');
        this.dealerScoreEl = document.getElementById('dealerScore');
        this.playerScoreEl = document.getElementById('playerScore');
        this.messageEl = document.getElementById('message');
        this.winStreakEl = document.getElementById('winStreak');
        this.totalWinsEl = document.getElementById('totalWins');
        this.totalLossesEl = document.getElementById('totalLosses');
        this.progressFillEl = document.getElementById('progressFill');
        this.victoryModal = document.getElementById('victoryModal');
        this.keyDisplayEl = document.getElementById('keyDisplay');
        this.keyValueEl = document.getElementById('keyValue');
        this.copyKeyBtn = document.getElementById('copyKeyBtn');
        
        // Buttons
        this.hitBtn = document.getElementById('hitBtn');
        this.standBtn = document.getElementById('standBtn');
        this.dealBtn = document.getElementById('dealBtn');
        this.resetBtn = document.getElementById('resetBtn');
        this.playAgainBtn = document.getElementById('playAgainBtn');
        
        this.initEventListeners();
        this.loadSession();
    }
    
    initEventListeners() {
        this.hitBtn.addEventListener('click', () => this.hit());
        this.standBtn.addEventListener('click', () => this.stand());
        this.dealBtn.addEventListener('click', () => this.deal());
        this.resetBtn.addEventListener('click', () => this.resetStreak());
        this.playAgainBtn.addEventListener('click', () => this.resetGame());
        
        if (this.copyKeyBtn) {
            this.copyKeyBtn.addEventListener('click', () => this.copyKey());
        }
    }
    
    async loadSession() {
        // Load existing session from server
        try {
            const response = await fetch('/api/blackjack/session');
            if (response.ok) {
                const data = await response.json();
                
                if (data.session_id) {
                    this.sessionId = data.session_id;
                    this.winStreak = data.win_streak || 0;
                    
                    // Load local stats
                    this.loadLocalStats();
                    
                    // If game was in progress, restore state
                    if (data.game_state === 'playing') {
                        this.playerHand = data.player_hand || [];
                        this.dealerHand = data.dealer_hand || [];
                        this.gameInProgress = true;
                        this.renderHands(false);
                        this.enableGameButtons(true);
                        this.dealBtn.disabled = true;
                    }
                    
                    this.updateStats();
                } else {
                    this.loadLocalStats();
                    this.updateStats();
                }
            }
        } catch (error) {
            console.error('Error loading session:', error);
            this.loadLocalStats();
            this.updateStats();
        }
    }
    
    loadLocalStats() {
        const saved = localStorage.getItem('blackjackLocalStats');
        if (saved) {
            const stats = JSON.parse(saved);
            this.totalWins = stats.totalWins || 0;
            this.totalLosses = stats.totalLosses || 0;
        }
    }
    
    saveLocalStats() {
        const stats = {
            totalWins: this.totalWins,
            totalLosses: this.totalLosses
        };
        localStorage.setItem('blackjackLocalStats', JSON.stringify(stats));
    }
    
    updateStats() {
        this.winStreakEl.textContent = this.winStreak;
        this.totalWinsEl.textContent = this.totalWins;
        this.totalLossesEl.textContent = this.totalLosses;
        this.progressFillEl.style.width = `${(this.winStreak / this.targetWins) * 100}%`;
    }
    
    createCardElement(card, hidden = false) {
        const cardEl = document.createElement('div');
        cardEl.className = `card ${card.isRed ? 'red' : 'black'} ${hidden ? 'hidden' : ''}`;
        
        cardEl.innerHTML = `
            <div class="top">
                <span class="value">${card.value}</span>
                <span class="suit">${card.suit}</span>
            </div>
            <div class="center">${card.suit}</div>
            <div class="bottom">
                <span class="value">${card.value}</span>
                <span class="suit">${card.suit}</span>
            </div>
        `;
        
        return cardEl;
    }
    
    renderHands(revealDealer = false) {
        // Clear hands
        this.dealerCardsEl.innerHTML = '';
        this.playerCardsEl.innerHTML = '';
        
        // Render dealer's hand
        if (this.dealerHand.length > 0) {
            if (revealDealer) {
                // Show all dealer cards
                this.dealerHand.forEach(card => {
                    this.dealerCardsEl.appendChild(this.createCardElement(card));
                });
            } else {
                // Show hidden card + visible cards
                // First card is hidden
                const hiddenCard = document.createElement('div');
                hiddenCard.className = 'card hidden';
                hiddenCard.innerHTML = '<div class="center">?</div>';
                this.dealerCardsEl.appendChild(hiddenCard);
                
                // Show remaining cards (from server, only visible ones are sent)
                this.dealerHand.forEach(card => {
                    this.dealerCardsEl.appendChild(this.createCardElement(card));
                });
            }
        }
        
        // Render player's hand
        this.playerHand.forEach(card => {
            this.playerCardsEl.appendChild(this.createCardElement(card));
        });
        
        // Update scores
        if (this.playerHand.length > 0) {
            const playerScore = this.calculateScore(this.playerHand);
            this.playerScoreEl.textContent = `(${playerScore})`;
        } else {
            this.playerScoreEl.textContent = '';
        }
        
        if (revealDealer && this.dealerHand.length > 0) {
            const dealerScore = this.calculateScore(this.dealerHand);
            this.dealerScoreEl.textContent = `(${dealerScore})`;
        } else if (this.dealerHand.length > 0) {
            this.dealerScoreEl.textContent = '(? + ?)';
        } else {
            this.dealerScoreEl.textContent = '';
        }
    }
    
    calculateScore(hand) {
        let score = 0;
        let aces = 0;
        
        for (const card of hand) {
            if (card.value === 'A') {
                aces++;
                score += 11;
            } else if (['K', 'Q', 'J'].includes(card.value)) {
                score += 10;
            } else {
                score += parseInt(card.value);
            }
        }
        
        while (score > 21 && aces > 0) {
            score -= 10;
            aces--;
        }
        
        return score;
    }
    
    async deal() {
        if (this.winStreak >= this.targetWins) {
            return;
        }
        
        // Hide key display
        if (this.keyDisplayEl) {
            this.keyDisplayEl.style.display = 'none';
        }
        
        this.messageEl.textContent = 'Dealing...';
        this.messageEl.className = 'message';
        this.enableGameButtons(false);
        this.dealBtn.disabled = true;
        
        try {
            const response = await fetch('/api/blackjack/deal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                throw new Error('Failed to deal');
            }
            
            const data = await response.json();
            
            this.sessionId = data.session_id;
            this.playerHand = data.player_hand;
            this.dealerHand = data.dealer_hand;
            this.winStreak = data.win_streak;
            
            // Check if game ended immediately (blackjack)
            if (data.result) {
                this.handleGameResult(data);
            } else {
                // Normal game - enable buttons
                this.gameInProgress = true;
                this.renderHands(false);
                this.enableGameButtons(true);
                this.messageEl.textContent = 'Your turn - Hit or Stand?';
            }
            
            this.updateStats();
            
        } catch (error) {
            console.error('Error dealing:', error);
            this.messageEl.textContent = 'Error dealing cards. Try again.';
            this.messageEl.className = 'message lose';
            this.dealBtn.disabled = false;
        }
    }
    
    async hit() {
        if (!this.gameInProgress || !this.sessionId) return;
        
        this.enableGameButtons(false);
        
        try {
            const response = await fetch('/api/blackjack/hit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: this.sessionId })
            });
            
            if (!response.ok) {
                throw new Error('Failed to hit');
            }
            
            const data = await response.json();
            
            this.playerHand = data.player_hand;
            this.winStreak = data.win_streak;
            
            if (data.dealer_hand) {
                this.dealerHand = data.dealer_hand;
            }
            
            // Check if game ended (bust or auto-stand at 21)
            if (data.result) {
                this.handleGameResult(data);
            } else {
                this.renderHands(false);
                this.enableGameButtons(true);
            }
            
            this.updateStats();
            
        } catch (error) {
            console.error('Error hitting:', error);
            this.messageEl.textContent = 'Error. Try again.';
            this.enableGameButtons(true);
        }
    }
    
    async stand() {
        if (!this.gameInProgress || !this.sessionId) return;
        
        this.enableGameButtons(false);
        this.messageEl.textContent = 'Dealer\'s turn...';
        
        try {
            const response = await fetch('/api/blackjack/stand', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: this.sessionId })
            });
            
            if (!response.ok) {
                throw new Error('Failed to stand');
            }
            
            const data = await response.json();
            
            this.playerHand = data.player_hand;
            this.dealerHand = data.dealer_hand;
            this.winStreak = data.win_streak;
            
            // Animate dealer cards
            await this.animateDealerReveal(data);
            
            this.handleGameResult(data);
            this.updateStats();
            
        } catch (error) {
            console.error('Error standing:', error);
            this.messageEl.textContent = 'Error. Try again.';
            this.dealBtn.disabled = false;
        }
    }
    
    async animateDealerReveal(data) {
        // Show dealer's full hand with animation
        this.dealerCardsEl.innerHTML = '';
        
        for (let i = 0; i < this.dealerHand.length; i++) {
            await this.delay(300);
            this.dealerCardsEl.appendChild(this.createCardElement(this.dealerHand[i]));
            
            // Update score progressively
            const currentHand = this.dealerHand.slice(0, i + 1);
            const score = this.calculateScore(currentHand);
            this.dealerScoreEl.textContent = `(${score})`;
        }
    }
    
    handleGameResult(data) {
        this.gameInProgress = false;
        this.renderHands(true);
        this.dealBtn.disabled = false;
        
        // Update scores from server
        if (data.player_score) {
            this.playerScoreEl.textContent = `(${data.player_score})`;
        }
        if (data.dealer_score) {
            this.dealerScoreEl.textContent = `(${data.dealer_score})`;
        }
        
        // Show message
        this.messageEl.textContent = data.message || 'Game over';
        
        // Set message style based on result
        switch (data.result) {
            case 'blackjack':
                this.messageEl.className = 'message blackjack';
                this.totalWins++;
                break;
            case 'win':
            case 'dealer_bust':
                this.messageEl.className = 'message win';
                this.totalWins++;
                break;
            case 'lose':
            case 'bust':
            case 'dealer_blackjack':
                this.messageEl.className = 'message lose';
                this.totalLosses++;
                break;
            case 'push':
                this.messageEl.className = 'message push';
                this.totalLosses++; // Push counts as loss for streak
                break;
        }
        
        this.saveLocalStats();
        
        // Check for victory
        if (data.victory && data.key) {
            this.showVictory(data.key);
        }
    }
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    showVictory(key) {
        this.victoryModal.classList.add('show');
        this.dealBtn.disabled = true;
        
        if (key) {
            this.displayKey(key);
        }
    }
    
    displayKey(key) {
        if (this.keyDisplayEl && this.keyValueEl) {
            this.keyValueEl.textContent = key;
            this.keyDisplayEl.style.display = 'block';
        }
    }
    
    copyKey() {
        if (!this.keyValueEl || !this.keyValueEl.textContent) return;
        
        navigator.clipboard.writeText(this.keyValueEl.textContent)
            .then(() => {
                if (this.copyKeyBtn) {
                    const originalText = this.copyKeyBtn.textContent;
                    this.copyKeyBtn.textContent = '✅ Copied!';
                    setTimeout(() => {
                        this.copyKeyBtn.textContent = originalText;
                    }, 2000);
                }
            })
            .catch(err => {
                console.error('Failed to copy:', err);
            });
    }
    
    async resetGame() {
        this.victoryModal.classList.remove('show');
        
        try {
            await fetch('/api/blackjack/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error) {
            console.error('Error resetting:', error);
        }
        
        this.winStreak = 0;
        if (this.keyDisplayEl) {
            this.keyDisplayEl.style.display = 'none';
        }
        this.updateStats();
        this.deal();
    }
    
    async resetStreak() {
        if (confirm('Are you sure you want to reset your streak?')) {
            try {
                await fetch('/api/blackjack/reset', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (error) {
                console.error('Error resetting:', error);
            }
            
            this.winStreak = 0;
            this.playerHand = [];
            this.dealerHand = [];
            this.dealerCardsEl.innerHTML = '';
            this.playerCardsEl.innerHTML = '';
            this.dealerScoreEl.textContent = '';
            this.playerScoreEl.textContent = '';
            this.messageEl.textContent = '';
            this.messageEl.className = 'message';
            this.gameInProgress = false;
            this.enableGameButtons(false);
            this.dealBtn.disabled = false;
            if (this.keyDisplayEl) {
                this.keyDisplayEl.style.display = 'none';
            }
            this.updateStats();
        }
    }
    
    enableGameButtons(enabled) {
        this.hitBtn.disabled = !enabled;
        this.standBtn.disabled = !enabled;
    }
}

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new BlackjackGame();
});