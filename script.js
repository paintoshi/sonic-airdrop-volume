class VolumeDisplay {
    constructor() {
        this.apiUrl = 'https://api-airdrop-beta.paintswap.finance/interval-data/S/1?interval=day';
        this.externalLink = 'https://airdrop.paintswap.io';
        this.currentVolume = 0;
        this.displayElement = null;
        this.statusElement = null;
        this.updateInterval = null;
        this.isInitialized = false;
        this.animationFrameId = null;
        this.isFirstLoad = true; // Track if this is the first volume load
        
        // Test counter settings
        this.useTestCounter = false; // Set to false to use real API data
        this.testCounter = 0;
        this.testInterval = null;
        
        // Animation timing settings (easy to adjust for testing)
        this.testCounterInterval = 1000; // Time between increments (ms) - 10 seconds
        this.animationSpeed = 7; // Base flips per second for 3-second total animation
        this.animationSpeedVariation = 0.0; // Random variation in speed
        this.characterDelay = 100; // Delay between characters starting (ms)
        
        // Animation buffering system
        this.isAnimating = false;
        this.targetVolume = 0; // The volume we want to animate to
        this.pendingVolume = null; // The latest volume request while animating
        
        // Character map for sequential flipping
        this.charsMap = '0123456789';
        this.animations = new Map();
        
        this.init();
    }

    init() {
        this.createHTML();
        setTimeout(() => {
            this.setupDisplay();
            this.startUpdating();
        }, 100);
    }

    createHTML() {
        document.body.innerHTML = `
            <div class="container">
                <div class="volume-display clickable" title="Click to visit airdrop.paintswap.io">
                    <div class="loading">Loading volume data...</div>
                </div>
            </div>
            <div class="status clickable" id="status" title="Click to visit airdrop.paintswap.io">Connecting...</div>
        `;
        
        this.displayElement = document.querySelector('.volume-display');
        this.statusElement = document.getElementById('status');
        
        // Add click event listener to status element
        this.statusElement.addEventListener('click', () => {
            window.open(this.externalLink, '_blank');
        });
        
        // Add click event listener to volume display element
        this.displayElement.addEventListener('click', () => {
            window.open(this.externalLink, '_blank');
        });
    }

    async fetchVolumeData() {
        try {
            const response = await fetch(this.apiUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (!data.orderSoldIntervalDatas || !Array.isArray(data.orderSoldIntervalDatas)) {
                throw new Error('Invalid data format received');
            }

            // Calculate total accumulated volume by summing all totalCost values
            const totalVolume = data.orderSoldIntervalDatas.reduce((sum, item) => {
                const cost = parseFloat(item.totalCost) || 0;
                return sum + cost;
            }, 0);

            // Convert from wei to a more readable format (assuming 18 decimals)
            const volumeInTokens = totalVolume / Math.pow(10, 18);
            
            this.updateStatus(`Last updated: ${new Date().toLocaleDateString('en-US', { 
                month: 'long', 
                day: 'numeric' 
            })} ${new Date().toLocaleTimeString('en-US')}`, false);
            
            return Math.floor(volumeInTokens);
            
        } catch (error) {
            console.error('Error fetching volume data:', error);
            this.updateStatus(`Error: ${error.message}`, false);
            this.showError(`Failed to fetch data: ${error.message}`);
            return null;
        }
    }

    updateStatus(message, isUpdating = false) {
        if (this.statusElement) {
            this.statusElement.textContent = message;
            this.statusElement.className = isUpdating ? 'status updating clickable' : 'status clickable';
        }
    }

    showError(message) {
        this.displayElement.innerHTML = `<div class="error">${message}</div>`;
    }

    formatVolumeForDisplay(volume) {
        // Return volume as string without padding - only show necessary digits
        return volume.toString();
    }

    setupDisplay() {
        // Create custom split-flap display starting with single digit
        const initialText = '0';
        this.createSplitFlapDisplay(initialText);
        this.isInitialized = true;
    }

    createSplitFlapDisplay(text) {
        const chars = text.split('');
        let html = '<div class="splitflap">';
        
        chars.forEach((char, index) => {
            html += `
                <div class="char" data-index="${index}" data-char="${char}">
                    <div class="upper">
                        <span class="char-text">${char}</span>
                    </div>
                    <div class="lower">
                        <span class="char-text">${char}</span>
                    </div>
                    <div class="flipping" style="display: none;">
                        <span class="char-text">${char}</span>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        this.displayElement.innerHTML = html;
    }

    getCharOffset(char) {
        return Math.max(0, this.charsMap.indexOf(char));
    }

    buildFlipSequence(fromChar, toChar) {
        const fromIndex = this.getCharOffset(fromChar);
        const toIndex = this.getCharOffset(toChar);
        const sequence = [fromChar];
        
        let currentIndex = fromIndex;
        while (currentIndex !== toIndex) {
            currentIndex = (currentIndex + 1) % this.charsMap.length;
            sequence.push(this.charsMap.charAt(currentIndex));
        }
        
        return sequence;
    }

    updateDisplay(newVolume) {
        if (newVolume === null) {
            return;
        }

        const formattedVolume = this.formatVolumeForDisplay(newVolume);
        
        if (this.isInitialized) {
            // Check if this is the first real volume load
            if (this.isFirstLoad) {
                this.isFirstLoad = false;
                
                // Create display with zeros matching the target volume length
                const zerosText = '0'.repeat(formattedVolume.length);
                this.createSplitFlapDisplay(zerosText);
                
                // Set target and animate to the actual volume
                this.targetVolume = newVolume;
                this.animateToNewValue(formattedVolume);
                this.currentVolume = newVolume;
                return;
            }
            
            if (this.isAnimating) {
                // Animation in progress - buffer this request
                this.pendingVolume = newVolume;
            } else {
                // No animation in progress - start immediately
                this.targetVolume = newVolume;
                this.animateToNewValue(formattedVolume);
            }
        }

        this.currentVolume = newVolume;
    }

    animateToNewValue(newText) {
        const chars = document.querySelectorAll('.char');
        const newChars = newText.split('');
        
        // Check if number of digits changed - if so, recreate display instead of animating
        if (chars.length !== newChars.length) {
            this.createSplitFlapDisplay(newText);
            this.isAnimating = false;
            this.onAnimationComplete();
            return;
        }
        
        // Mark as animating
        this.isAnimating = true;
        
        // Clear any existing animations
        this.animations.clear();
        
        // Start new animations to target
        let hasAnimations = false;
        chars.forEach((charElement, index) => {
            const currentChar = charElement.getAttribute('data-char');
            const newChar = newChars[index] || '0';
            
            if (currentChar !== newChar) {
                const sequence = this.buildFlipSequence(currentChar, newChar);
                
                this.animations.set(index, {
                    element: charElement,
                    sequence: sequence,
                    currentStep: 0,
                    ratio: 0,
                    speed: this.animationSpeed + (Math.random() * this.animationSpeedVariation),
                    delay: index * this.characterDelay
                });
                hasAnimations = true;
            }
        });
        
        if (hasAnimations) {
            this.animationStartTime = performance.now();
            this.animate();
        } else {
            // No animation needed - mark as complete
            this.onAnimationComplete();
        }
    }

    animate() {
        const currentTime = performance.now();
        
        let activeAnimations = 0;
        const completedAnimations = [];
        
        this.animations.forEach((animation, index) => {
            const animationStartTime = this.animationStartTime + animation.delay;
            
            if (currentTime < animationStartTime) {
                activeAnimations++;
                return;
            }
            
            // Calculate elapsed time since this specific animation started
            const elapsedTime = (currentTime - animationStartTime) / 1000;
            
            if (animation.sequence.length > 1) {
                // Duration for each character flip
                const flipDuration = 1 / animation.speed;
                
                // Calculate which character we should be on
                const targetStep = Math.floor(elapsedTime / flipDuration);
                
                // Move sequence forward if needed
                while (animation.currentStep < targetStep && animation.sequence.length > 1) {
                    animation.currentStep++;
                    animation.sequence.shift();
                }
                
                if (animation.sequence.length > 1) {
                    // Calculate ratio for current character flip
                    const currentFlipElapsed = elapsedTime - (animation.currentStep * flipDuration);
                    animation.ratio = Math.min(1, currentFlipElapsed / flipDuration);
                    
                    this.setCharWithRatio(
                        animation.element,
                        animation.sequence[1],
                        animation.sequence[0],
                        animation.ratio
                    );
                    activeAnimations++;
                } else {
                    // Animation complete
                    this.setCharWithRatio(animation.element, animation.sequence[0], animation.sequence[0], 1);
                    animation.element.setAttribute('data-char', animation.sequence[0]);
                    completedAnimations.push(index);
                }
            } else {
                // Animation complete
                this.setCharWithRatio(animation.element, animation.sequence[0], animation.sequence[0], 1);
                animation.element.setAttribute('data-char', animation.sequence[0]);
                completedAnimations.push(index);
            }
        });
        
        // Remove completed animations
        completedAnimations.forEach(index => {
            this.animations.delete(index);
        });
        
        if (activeAnimations > 0) {
            this.animationFrameId = requestAnimationFrame(() => this.animate());
        } else {
            // All animations complete
            this.onAnimationComplete();
        }
    }

    onAnimationComplete() {
        this.isAnimating = false;
        
        // Check if there's a pending volume update
        if (this.pendingVolume !== null && this.pendingVolume !== this.targetVolume) {
            const nextVolume = this.pendingVolume;
            this.pendingVolume = null;
            this.targetVolume = nextVolume;
            
            this.animateToNewValue(this.formatVolumeForDisplay(nextVolume));
        } else {
            this.pendingVolume = null;
        }
    }

    setCharWithRatio(charElement, toChar, fromChar, ratio) {
        const upper = charElement.querySelector('.upper .char-text');
        const lower = charElement.querySelector('.lower .char-text');
        const flipping = charElement.querySelector('.flipping');
        const flippingText = flipping.querySelector('.char-text');
        
        if (ratio <= 0) {
            // Show starting character
            upper.textContent = fromChar;
            lower.textContent = fromChar;
            flipping.style.display = 'none';
        } else if (ratio >= 1) {
            // Show ending character
            upper.textContent = toChar;
            lower.textContent = toChar;
            flipping.style.display = 'none';
        } else {
            // Animation in progress
            flipping.style.display = 'block';
            
            if (ratio <= 0.5) {
                // First half: top flap rotates down (0 to 90 degrees)
                const rotation = ratio * 180; // 0 to 90 degrees
                flippingText.textContent = fromChar;
                flipping.style.top = '0px';
                flipping.style.height = '50%';
                flipping.style.transformOrigin = 'bottom center';
                flipping.style.transform = `rotateX(-${rotation}deg)`;
                flipping.style.zIndex = '10';
                
                // Reset text positioning for top half
                flippingText.style.top = '0';
                flippingText.style.clipPath = 'inset(0 0 50% 0)';
                
                upper.textContent = fromChar;
                lower.textContent = fromChar;
            } else {
                // Second half: bottom flap rotates up (90 to 0 degrees)
                const rotation = (1 - ratio) * 180; // 90 to 0 degrees
                flippingText.textContent = toChar;
                flipping.style.top = '50%';
                flipping.style.height = '50%';
                flipping.style.transformOrigin = 'top center';
                flipping.style.transform = `rotateX(${rotation}deg)`;
                flipping.style.zIndex = '10';
                
                // Position text to show bottom half
                flippingText.style.top = 'calc(-100% - 4px)'; // Move text up so bottom half shows, but compensate for center divider
                flippingText.style.clipPath = 'inset(50% 0 0 0)'; // Show only bottom half
                
                upper.textContent = toChar;
                lower.textContent = fromChar;
            }
        }
    }

    startTestCounter() {
        this.testCounter = 345345;
        this.updateStatus(`Test Mode: Counter running (${this.testCounterInterval/1000}s interval, ~${(1/this.animationSpeed).toFixed(1)}s per flip)`, false);
        
        // Trigger initial display with first test value
        this.updateDisplay(this.testCounter);
        
        this.testInterval = setInterval(() => {
            this.testCounter++;
            this.updateDisplay(this.testCounter);
        }, this.testCounterInterval);
    }

    stopTestCounter() {
        if (this.testInterval) {
            clearInterval(this.testInterval);
            this.testInterval = null;
        }
    }

    async updateVolume() {
        if (this.useTestCounter) {
            // Test mode is handled by startTestCounter
            return;
        }
        
        const newVolume = await this.fetchVolumeData();
        if (newVolume !== null) {
            this.updateDisplay(newVolume);
        }
    }

    startUpdating() {
        if (this.useTestCounter) {
            this.startTestCounter();
        } else {
            // Initial load
            this.updateVolume();
            
            // Update every 3 seconds
            this.updateInterval = setInterval(() => {
                this.updateVolume();
            }, 5000);
        }
    }

    stopUpdating() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        this.stopTestCounter();
    }

    handleResize() {
        if (this.isInitialized) {
            const currentText = this.formatVolumeForDisplay(this.currentVolume);
            this.createSplitFlapDisplay(currentText);
            // Note: We don't reset isFirstLoad here as this is just a resize, not a fresh load
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Create volume display instance
    const volumeDisplay = new VolumeDisplay();
    
    // Handle window resize
    let resizeTimeout;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            volumeDisplay.handleResize();
        }, 250);
    });
    
    // Handle page visibility change
    document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
            volumeDisplay.stopUpdating();
        } else {
            volumeDisplay.startUpdating();
        }
    });
});

// Error handling
window.addEventListener('error', function(event) {
    console.error('Global error:', event.error);
});

window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection:', event.reason);
}); 