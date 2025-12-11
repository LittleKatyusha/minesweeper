const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// Game constants
const GRAVITY = 0.35;
const JUMP_FORCE = -6;
const SPEED = 3;
const PIPE_SPACING = 300;
const PIPE_GAP = 160;
const TARGET_SCORE = 50; // Difficulty mainly from moving obstacles

// Game state
let gameLoop;
let score = 0;
let gameState = 'start'; // start, playing, gameover, win
let frames = 0;
let particles = [];
let stars = []; // For background
let shake = 0; // Screen shake magnitude
let popups = []; // Text popups

// Audio System
class SoundManager {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.initialized = false;
        this.musicOscillators = [];
        this.isMuted = false;
    }

    init() {
        if (this.initialized) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.3; // Master volume
            this.masterGain.connect(this.ctx.destination);
            this.initialized = true;
        } catch (e) {
            console.error("Audio init failed", e);
        }
    }

    playJump() {
        if (!this.initialized || this.isMuted) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.type = 'square';
        osc.frequency.setValueAtTime(150, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(600, this.ctx.currentTime + 0.1);

        gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    }

    playCrash() {
        if (!this.initialized || this.isMuted) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();

        // White noise buffer
        const bufferSize = this.ctx.sampleRate * 0.5; // 0.5 seconds
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        
        const noiseGain = this.ctx.createGain();
        noise.connect(noiseGain);
        noiseGain.connect(this.masterGain);
        
        noiseGain.gain.setValueAtTime(0.8, this.ctx.currentTime);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);
        
        noise.start();

        // Low frequency impact
        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        
        osc.connect(oscGain);
        oscGain.connect(this.masterGain);
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(10, this.ctx.currentTime + 0.5);
        
        oscGain.gain.setValueAtTime(0.8, this.ctx.currentTime);
        oscGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);
        
        osc.start();
        osc.stop(this.ctx.currentTime + 0.5);
    }

    playScore() {
        if (!this.initialized || this.isMuted) return;
        
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, this.ctx.currentTime);
        osc.frequency.setValueAtTime(1200, this.ctx.currentTime + 0.05);
        
        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.1);
        
        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    }
    
    startMusic() {
        if (!this.initialized || this.isMuted) return;
        this.stopMusic();

        // Simple bassline loop
        const bassFreqs = [55, 55, 65, 55, 49, 49, 41, 49]; // A1, A1, C2, A1, G1, G1, E1, G1
        let noteIndex = 0;
        
        const playNextNote = () => {
            if (gameState !== 'playing') return;
            
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.connect(gain);
            gain.connect(this.masterGain);
            
            osc.type = 'sawtooth';
            osc.frequency.value = bassFreqs[noteIndex];
            
            // Low pass filter for "muffled" bass sound
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 400;
            osc.disconnect();
            osc.connect(filter);
            filter.connect(gain);
            
            gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
            
            osc.start();
            osc.stop(this.ctx.currentTime + 0.2);
            
            noteIndex = (noteIndex + 1) % bassFreqs.length;
            
            this.musicTimer = setTimeout(playNextNote, 250); // 120 BPM roughly
        };
        
        playNextNote();
    }
    
    stopMusic() {
        if (this.musicTimer) {
            clearTimeout(this.musicTimer);
            this.musicTimer = null;
        }
    }
}

const audio = new SoundManager();

// Initialize stars
for(let i=0; i<100; i++) {
    stars.push({
        x: Math.random() * 800,
        y: Math.random() * 600,
        size: Math.random() * 2,
        speed: Math.random() * 3 + 0.5
    });
}

// Player object (Cube style like Geometry Dash)
const player = {
    x: 100,
    y: 300,
    width: 30,
    height: 30,
    velocity: 0,
    rotation: 0,
    color: '#ffff00',
    trail: [], // Trail positions
    pulse: 0, // For pulse effect
    
    draw() {
        // Draw Trail
        this.trail.forEach((pos, index) => {
            ctx.save();
            ctx.translate(pos.x + this.width/2, pos.y + this.height/2);
            ctx.rotate(pos.rotation * Math.PI / 180);
            ctx.fillStyle = this.color;
            ctx.globalAlpha = 0.5 - (index / this.trail.length) * 0.5;
            ctx.fillRect(-this.width/2 * 0.8, -this.height/2 * 0.8, this.width * 0.8, this.height * 0.8);
            ctx.restore();
        });
        ctx.globalAlpha = 1.0;

        ctx.save();
        ctx.translate(this.x + this.width/2, this.y + this.height/2);
        // Rotate based on velocity for that GD feel
        if (gameState === 'playing') {
            this.rotation += 5;
            this.pulse = Math.sin(frames * 0.2) * 5; // Pulse effect when playing
        } else {
            this.pulse = 0;
        }
        ctx.rotate(this.rotation * Math.PI / 180);
        
        // Glow effect - Optimized: Removed expensive shadowBlur
        // ctx.shadowBlur = 20 + Math.abs(this.pulse);
        // ctx.shadowColor = this.color;
        
        // Draw main body with gradient
        const grad = ctx.createLinearGradient(-this.width/2, -this.height/2, this.width/2, this.height/2);
        grad.addColorStop(0, '#ffff00');
        grad.addColorStop(1, '#ffaa00');
        ctx.fillStyle = grad;
        ctx.fillRect(-this.width/2, -this.height/2, this.width, this.height);
        
        // Simple border instead of glow
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(-this.width/2, -this.height/2, this.width, this.height);
        
        // Inner face details
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(-this.width/4, -this.height/4, this.width/2, this.height/2);
        
        // Eye (Cyclops style)
        ctx.fillStyle = '#00f3ff'; // Neon blue eye
        // ctx.shadowBlur = 10; // Removed
        // ctx.shadowColor = '#00f3ff';
        // Optimized: square eye
        ctx.fillRect(-5, -5, 10, 10);
        
        ctx.restore();
    },
    
    update() {
        // Update trail
        if (frames % 3 === 0) {
            this.trail.unshift({x: this.x, y: this.y, rotation: this.rotation});
            if (this.trail.length > 5) this.trail.pop();
        }

        this.velocity += GRAVITY;
        this.y += this.velocity;
        
        // Floor collision
        if (this.y + this.height > canvas.height) {
            this.y = canvas.height - this.height;
            gameOver();
        }
        
        // Ceiling collision
        if (this.y < 0) {
            this.y = 0;
            this.velocity = 0;
        }
    },
    
    jump() {
        this.velocity = JUMP_FORCE;
        createParticles(this.x, this.y + this.height, 8, '#ffff00');
        audio.playJump();
    },
    
    reset() {
        this.y = 300;
        this.velocity = 0;
        this.rotation = 0;
        this.trail = [];
    }
};

// Pipes array
let pipes = [];

class Pipe {
    constructor(x) {
        this.x = x;
        this.width = 60;
        this.topHeight = Math.random() * (canvas.height - PIPE_GAP - 100) + 50;
        this.bottomY = this.topHeight + PIPE_GAP;
        this.passed = false;
        this.hue = (frames * 0.5) % 360;
        
        // Dynamic obstacle properties
        this.moving = Math.random() > 0.7; // 30% chance of moving pipe
        this.moveSpeed = (Math.random() * 0.8 + 0.4) * (Math.random() < 0.5 ? 1 : -1); // Slower movement
        this.initialTop = this.topHeight;
    }
    
    update() {
        this.x -= SPEED;
        
        // Vertical movement for dynamic pipes
        if (this.moving) {
            this.topHeight += this.moveSpeed;
            
            // Bounce bounds
            if (this.topHeight < 50 || this.topHeight > canvas.height - PIPE_GAP - 50) {
                this.moveSpeed *= -1;
            }
            this.bottomY = this.topHeight + PIPE_GAP;
        }
    }

    draw() {
        const color = `hsl(${this.hue}, 100%, 50%)`;
        // ctx.shadowBlur = 15; // Optimized: Removed expensive shadowBlur
        
        // Gradient for pipe
        const grad = ctx.createLinearGradient(this.x, 0, this.x + this.width, 0);
        grad.addColorStop(0, color);
        grad.addColorStop(0.5, '#ffffff'); // Shiny highlight
        grad.addColorStop(1, color);

        ctx.fillStyle = grad;
        
        // Top pipe
        ctx.fillRect(this.x, 0, this.width, this.topHeight);
        // Bottom pipe
        ctx.fillRect(this.x, this.bottomY, this.width, canvas.height - this.bottomY);
        
        // Tech details on pipes
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(this.x + 10, 0, 5, this.topHeight);
        ctx.fillRect(this.x + 10, this.bottomY, 5, canvas.height - this.bottomY);
        ctx.fillRect(this.x + this.width - 15, 0, 5, this.topHeight);
        ctx.fillRect(this.x + this.width - 15, this.bottomY, 5, canvas.height - this.bottomY);
        
        // Pipe caps
        ctx.fillStyle = '#fff';
        ctx.fillRect(this.x - 4, this.topHeight - 25, this.width + 8, 25);
        ctx.fillRect(this.x - 4, this.bottomY, this.width + 8, 25);
    }
    
}

// Particle system
class Particle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = Math.random() * 5 + 2;
        this.speedX = Math.random() * 4 - 2;
        this.speedY = Math.random() * 4 - 2;
        this.life = 1.0;
        this.color = `hsl(${Math.random() * 360}, 100%, 70%)`;
    }
    
    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.life -= 0.03;
        this.size *= 0.95;
    }
    
    draw() {
        ctx.fillStyle = this.color;
        ctx.globalAlpha = this.life;
        // Optimized: Rect instead of Arc
        ctx.fillRect(this.x, this.y, this.size, this.size);
        ctx.globalAlpha = 1.0;
    }
}

function createParticles(x, y, count, color = null) {
    for (let i = 0; i < count; i++) {
        const p = new Particle(x, y);
        if (color) p.color = color;
        particles.push(p);
    }
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        particles[i].draw();
        if (particles[i].life <= 0) {
            particles.splice(i, 1);
        }
    }
}

// Text Popup System
class TextPopup {
    constructor(x, y, text) {
        this.x = x;
        this.y = y;
        this.text = text;
        this.life = 1.0;
        this.velocity = -2; // Move up
    }

    update() {
        this.y += this.velocity;
        this.life -= 0.02;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.life;
        ctx.font = 'bold 24px "Press Start 2P", monospace';
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.textAlign = 'center';
        ctx.strokeText(this.text, this.x, this.y);
        ctx.fillText(this.text, this.x, this.y);
        ctx.restore();
    }
}

function createPopup(x, y) {
    const texts = ["Buns", "Sybau", "Guh"];
    const text = texts[Math.floor(Math.random() * texts.length)];
    popups.push(new TextPopup(x, y, text));
}

function updatePopups() {
    for (let i = popups.length - 1; i >= 0; i--) {
        popups[i].update();
        popups[i].draw();
        if (popups[i].life <= 0) {
            popups.splice(i, 1);
        }
    }
}

// Cached background gradient
let bgGradient = null;

// Background effect (moving stars/grid lines)
function drawBackground() {
    // Deep space background
    if (!bgGradient) {
        bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        bgGradient.addColorStop(0, '#0f0c29');
        bgGradient.addColorStop(0.5, '#302b63');
        bgGradient.addColorStop(1, '#24243e');
    }
    ctx.fillStyle = bgGradient;
    ctx.fillRect(-20, -20, canvas.width + 40, canvas.height + 40); // Oversize for shake
    
    // Draw Stars
    ctx.fillStyle = '#ffffff';
    stars.forEach(star => {
        ctx.globalAlpha = Math.random() * 0.5 + 0.5;
        // Optimized: Rect instead of Arc
        ctx.fillRect(star.x, star.y, star.size, star.size);
        
        // Move stars
        if (gameState === 'playing') {
            star.x -= star.speed;
            if (star.x < 0) {
                star.x = canvas.width;
                star.y = Math.random() * canvas.height;
            }
        }
    });
    ctx.globalAlpha = 1.0;

    // Grid lines (Retro Wave style)
    ctx.strokeStyle = 'rgba(255, 0, 255, 0.2)';
    ctx.lineWidth = 2;
    
    const offset = (frames * 3) % 60;
    
    // Perspective Grid effect
    ctx.save();
    ctx.beginPath();
    // Simple horizon line at bottom
    for (let y = canvas.height / 2; y < canvas.height; y += 40) {
         ctx.moveTo(0, y);
         ctx.lineTo(canvas.width, y);
    }
    // Vertical lines moving
    for (let x = -offset; x < canvas.width; x += 80) {
        ctx.moveTo(x, canvas.height/2); // Start from horizon
        ctx.lineTo(x - (canvas.width/2 - x) * 2, canvas.height); // Fan out
    }
    ctx.stroke();
    ctx.restore();
}

function checkCollision(pipe) {
    // Check x range
    if (player.x + player.width > pipe.x && player.x < pipe.x + pipe.width) {
        // Check y range (hit top pipe OR hit bottom pipe)
        if (player.y < pipe.topHeight || player.y + player.height > pipe.bottomY) {
            return true;
        }
    }
    return false;
}

function gameOver() {
    gameState = 'gameover';
    shake = 20; // Trigger screen shake
    createParticles(player.x, player.y, 50, '#ff0000'); // Big explosion
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('game-over-screen').style.display = 'block';
    document.getElementById('final-score').innerText = score;
    audio.playCrash();
    audio.stopMusic();
}

function winGame() {
    gameState = 'win';
    audio.stopMusic();
    document.getElementById('win-screen').style.display = 'block';
    
    // Request key from server
    fetch('/api/flappy-win', {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            document.getElementById('key-display').style.display = 'block';
            document.getElementById('key-value').innerText = data.key;
        }
    })
    .catch(err => console.error('Error getting key:', err));
}

function resetGame() {
    audio.init(); // Ensure audio context is ready on user interaction
    player.reset();
    pipes = [];
    score = 0;
    frames = 0;
    particles = [];
    popups = [];
    document.getElementById('score').innerText = '0';
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('game-over-screen').style.display = 'none';
    document.getElementById('win-screen').style.display = 'none';
    gameState = 'playing';
    shake = 0;
    
    // Initial pipe
    pipes.push(new Pipe(canvas.width));
    audio.startMusic();
}

function loop() {
    // Apply shake globally
    ctx.save();
    if (shake > 0) {
        const shakeX = (Math.random() - 0.5) * shake;
        const shakeY = (Math.random() - 0.5) * shake;
        ctx.translate(shakeX, shakeY);
        shake *= 0.9;
        if (shake < 0.5) shake = 0;
    }

    drawBackground();
    
    if (gameState === 'playing') {
        player.update();
        frames++;
        
        // Spawn pipes
        if (frames % Math.floor(PIPE_SPACING / SPEED) === 0) {
            pipes.push(new Pipe(canvas.width));
        }
        
        // Update pipes
        for (let i = pipes.length - 1; i >= 0; i--) {
            pipes[i].update();
            pipes[i].draw();
            
            // Remove off-screen pipes
            if (pipes[i].x + pipes[i].width < 0) {
                pipes.splice(i, 1);
                continue;
            }
            
            // Collision detection
            if (checkCollision(pipes[i])) {
                gameOver();
            }
            
            // Score update
            if (!pipes[i].passed && player.x > pipes[i].x + pipes[i].width) {
                score++;
                pipes[i].passed = true;
                document.getElementById('score').innerText = score;
                createParticles(player.x, player.y, 10, '#00ff00'); // Score particles
                createPopup(player.x, player.y - 40); // Random pop up text
                audio.playScore();
                
                // Win condition
                if (score >= TARGET_SCORE) {
                    winGame();
                }
            }
        }
    } else {
        // Draw pipes static in background if not playing
        pipes.forEach(p => p.draw());
    }
    
    player.draw();
    updateParticles();
    updatePopups();
    
    ctx.restore(); // Restore shake transform
    requestAnimationFrame(loop);
}

// Input handling
function handleInput(e) {
    // Check if interaction is with UI elements
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A') return;

    // Only handle space and arrow up for jumping, but allow other keys
    if (e.type === 'keydown' && e.code !== 'Space' && e.code !== 'ArrowUp' && e.code !== 'Enter') return;
    
    // Prevent scrolling for game keys and touch
    if ((e.type === 'keydown' && (e.code === 'Space' || e.code === 'ArrowUp')) || e.type === 'touchstart') {
        if (e.cancelable) e.preventDefault();
    }
    
    if (gameState === 'start' || gameState === 'gameover') {
        // Start game on click/touch/space/enter
        if (e.type === 'click' || e.type === 'touchstart' || e.code === 'Space' || e.code === 'Enter') {
            resetGame();
        }
    } else if (gameState === 'playing') {
        player.jump();
    }
}

window.addEventListener('keydown', handleInput);
// Add listeners to window instead of canvas for better mobile experience
window.addEventListener('mousedown', (e) => {
    if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'A') {
        if (gameState === 'playing') player.jump();
        else if (gameState === 'start' || gameState === 'gameover') resetGame();
    }
});
window.addEventListener('touchstart', handleInput, {passive: false});

// Buttons
document.getElementById('start-btn').addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent canvas click event
    resetGame();
});
document.getElementById('restart-btn').addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent canvas click event
    resetGame();
});
document.getElementById('copy-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    const keyText = document.getElementById('key-value').innerText;
    
    // Try modern clipboard API first, fallback to execCommand
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(keyText).then(() => {
            const btn = document.getElementById('copy-btn');
            btn.innerText = 'Copied!';
            setTimeout(() => btn.innerText = 'COPY', 2000);
        }).catch(() => {
            // Fallback for mobile/older browsers
            fallbackCopy(keyText);
        });
    } else {
        fallbackCopy(keyText);
    }
});

// Fallback copy function for mobile browsers
function fallbackCopy(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        document.execCommand('copy');
        const btn = document.getElementById('copy-btn');
        btn.innerText = 'Copied!';
        setTimeout(() => btn.innerText = 'COPY', 2000);
    } catch (err) {
        console.error('Copy failed:', err);
        alert('Copy failed. Please manually copy: ' + text);
    }
    
    document.body.removeChild(textArea);
}

// Initialize
canvas.width = 800;
canvas.height = 600;
drawBackground();
player.draw();
loop(); // Start the loop immediately