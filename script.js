class VolumeDisplay {
    constructor() {
        // Base API URLs for easy configuration
        this.baseApiUrl = 'https://api-airdrop-beta.paintswap.finance';
        this.priceApiUrl = 'https://api.paintswap.finance/v2/tokens?addresses%5B0%5D=0x1b6382dbdea11d97f24495c9a90b7c88469134a4numToFetch=1&chainId=146';
        
        // API endpoints for different tokens
        this.apiEndpoints = {
            S: `${this.baseApiUrl}/interval-data/S/1?interval=day`,
            USDC: `${this.baseApiUrl}/interval-data/USDC/1?interval=day`,
            SCUSD: `${this.baseApiUrl}/interval-data/SCUSD/1?interval=day`
        };
        
        this.externalLink = 'https://airdrop.paintswap.io';
        this.currentVolume = 0;
        this.displayElement = null;
        this.statusElement = null;
        this.updateInterval = null;
        this.isInitialized = false;
        this.animationFrameId = null;
        this.isFirstLoad = true; // Track if this is the first volume load
        this.isFetchingVolume = false; // Guard for concurrent updates
        
        // Price data
        this.sPrice = null; // Price of 1 S in USDC
        
        // Test counter settings
        this.useTestCounter = false; // Set to false to use real API data
        this.testCounter = 0;
        this.testInterval = null;
        
        // Animation timing settings (easy to adjust for testing)
        this.testCounterInterval = 1000; // Time between increments (ms) - 10 seconds
        this.animationSpeed = 5; // Base flips per second for 3-second total animation
        this.animationSpeedVariation = 0.0; // Random variation in speed
        this.characterDelay = 100; // Delay between characters starting (ms)
        
        // Animation buffering system
        this.isAnimating = false;
        this.targetVolume = 0; // The volume we want to animate to
        this.pendingVolume = null; // The latest volume request while animating
        
        // Character map for sequential flipping
        this.charsMap = '0123456789';
        this.animations = new Map();
        
        // Chart properties
        this.chart = null;
        this.chartData = [];
        this.chartElement = null;
        
        this.init();
    }

    init() {
        this.createHTML();
        setTimeout(() => {
            this.setupDisplay();
            this.initChart();
            this.startUpdating();
        }, 100);
    }

    createHTML() {
        document.body.innerHTML = `
            <div class="container">
                <div class="volume-display clickable" title="Click to visit airdrop.paintswap.io">
                    <div class="loading-spinner">
                        <div class="spinner"></div>
                    </div>
                </div>
                <div class="chart-container">
                    <canvas id="volumeChart"></canvas>
                </div>
            </div>
            <div class="status clickable" id="status" title="Click to visit airdrop.paintswap.io">Connecting...</div>
            <style>
                .loading-spinner {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100%;
                }
                .spinner {
                    width: 160px;
                    height: 160px;
                    border: 8px solid rgba(46, 226, 164, 0.3);
                    border-radius: 50%;
                    border-top-color: #2ee2a4;
                    animation: spin 1s ease-in-out infinite;
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                .volume-display {
                    position: relative;
                    min-height: 200px;
                }
            </style>
        `;
        
        this.displayElement = document.querySelector('.volume-display');
        this.statusElement = document.getElementById('status');
        this.chartElement = document.getElementById('volumeChart');
        
        // Add click event listener to status element
        this.statusElement.addEventListener('click', () => {
            window.open(this.externalLink, '_blank');
        });
        
        // Add click event listener to volume display element
        this.displayElement.addEventListener('click', () => {
            window.open(this.externalLink, '_blank');
        });
    }

    async fetchSPrice() {
        try {
            const response = await fetch(this.priceApiUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            const sToken = data.tokens['0x039e2fb66102314ce7b64ce5ce3e5183bc94ad38'];
            
            if (!sToken || !sToken.price) {
                throw new Error('S token price not found in response');
            }
            
            this.sPrice = parseFloat(sToken.price);
            console.log('S price fetched:', this.sPrice, 'USDC');
            return this.sPrice;
            
        } catch (error) {
            console.error('Error fetching S price:', error);
            // Fallback price if API fails
            this.sPrice = 0.4;
            console.log('Using fallback S price:', this.sPrice);
            return this.sPrice;
        }
    }

    async fetchVolumeData() {
        try {
            // First fetch S price
            await this.fetchSPrice();
            
            // Fetch data from all three endpoints - ALL must succeed for data integrity
            const [sResponse, usdcResponse, scusdResponse] = await Promise.all([
                fetch(this.apiEndpoints.S),
                fetch(this.apiEndpoints.USDC),
                fetch(this.apiEndpoints.SCUSD)
            ]);

            // Check that ALL endpoints succeeded
            if (!sResponse.ok) {
                throw new Error(`S API failed! status: ${sResponse.status}`);
            }
            if (!usdcResponse.ok) {
                throw new Error(`USDC API failed! status: ${usdcResponse.status}`);
            }
            if (!scusdResponse.ok) {
                throw new Error(`SCUSD API failed! status: ${scusdResponse.status}`);
            }

            // Parse all responses - if any fail, the whole update fails
            const sData = await sResponse.json();
            const usdcData = await usdcResponse.json();
            const scusdData = await scusdResponse.json();

            // Validate that all responses have the expected structure
            if (!sData.orderSoldIntervalDatas && !sData.intervalDatas) {
                throw new Error('S API returned invalid data structure');
            }

            console.log('All APIs succeeded - processing combined volume data');
            console.log('S data points:', (sData.intervalDatas || sData.orderSoldIntervalDatas).length);
            console.log('USDC data points:', (usdcData.intervalDatas || usdcData.orderSoldIntervalDatas || []).length);
            console.log('SCUSD data points:', (scusdData.intervalDatas || scusdData.orderSoldIntervalDatas || []).length);
            
            // Process and combine data
            const combinedData = this.combineVolumeData(sData, usdcData, scusdData);
            
            // Calculate total volume in S
            const totalVolumeS = combinedData.reduce((sum, item) => sum + item.volume, 0);
            
            // Update chart with combined data
            this.chartData = combinedData.sort((a, b) => a.date - b.date);
            this.updateChart();
            
            // Remove the loading spinner after the first load
            if (this.displayElement.querySelector('.loading-spinner')) {
                this.displayElement.querySelector('.loading-spinner').remove();
            }
            
            // Update status after digits are ready
            this.updateStatus(`Updated: ${new Date().toLocaleDateString('en-US', { 
                month: 'long', 
                day: 'numeric' 
            })} - ${new Date().toLocaleTimeString('en-US')}`, false);
            
            return Math.floor(totalVolumeS);
            
        } catch (error) {
            console.error('Error fetching volume data:', error);
            this.updateStatus(`Error: ${error.message} - Data incomplete`, true);
            
            // Don't update display with partial data - keep showing last known good data
            // Only show error in status, don't change the volume display
            console.warn('Keeping previous volume data due to API failure');
            return null;
        }
    }

    combineVolumeData(sData, usdcData, scusdData) {
        const dataMap = new Map(); // Use timestamp as key to combine same-day data
        
        // All three data sources are guaranteed to be available and valid at this point
        
        // Helper function to process data and ensure all dates are captured
        const processDataArray = (dataArray, tokenName, decimals, priceConversion = 1) => {
            dataArray.forEach(item => {
                const timestampMs = parseInt(item.timestamp) / 1000;
                const cost = parseFloat(item.totalCost) || 0;
                const volume = (cost / Math.pow(10, decimals)) / priceConversion; // Convert to S
                
                const key = timestampMs.toString();
                if (!dataMap.has(key)) {
                    dataMap.set(key, {
                        date: new Date(timestampMs),
                        volumeS: 0,
                        sources: [],
                        breakdown: { S: 0, USDC: 0, SCUSD: 0 }
                    });
                }
                
                const entry = dataMap.get(key);
                entry.volumeS += volume;
                entry.sources.push(tokenName);
                entry.breakdown[tokenName] = volume;
            });
        };
        
        // Process each data source - missing dates will automatically be 0
        const sDataArray = sData.intervalDatas || sData.orderSoldIntervalDatas;
        const usdcDataArray = usdcData.intervalDatas || usdcData.orderSoldIntervalDatas || [];
        const scusdDataArray = scusdData.intervalDatas || scusdData.orderSoldIntervalDatas || [];
        
        // Process S data (already in S, 18 decimals, no price conversion)
        processDataArray(sDataArray, 'S', 18, 1);
        
        // Process USDC data (6 decimals, convert using S price)
        processDataArray(usdcDataArray, 'USDC', 6, this.sPrice);
        
        // Process SCUSD data (6 decimals, convert using S price - treat as USDC)
        processDataArray(scusdDataArray, 'SCUSD', 6, this.sPrice);
        
        // Convert map to array and format for chart
        const result = Array.from(dataMap.values()).map(item => ({
            date: item.date,
            volume: Math.round(item.volumeS * 10) / 10, // Round to 1 decimal place
            sources: item.sources,
            breakdown: {
                S: Math.round(item.breakdown.S * 10) / 10,
                USDC: Math.round(item.breakdown.USDC * 10) / 10,
                SCUSD: Math.round(item.breakdown.SCUSD * 10) / 10
            }
        }));
        
        console.log('Combined volume data processed:', result.length, 'unique dates');
        if (result.length > 0) {
            console.log('Sample combined data:', result[0]);
            console.log('Date range coverage:');
            console.log('- S data points:', sDataArray.length);
            console.log('- USDC data points:', usdcDataArray.length); 
            console.log('- SCUSD data points:', scusdDataArray.length);
            console.log('- Combined unique dates:', result.length);
            
            // Show breakdown for each date
            result.forEach(d => {
                const breakdown = `S:${d.breakdown.S} + USDC:${d.breakdown.USDC} + SCUSD:${d.breakdown.SCUSD} = ${d.volume}`;
                console.log(`${d.date.toDateString()}: ${breakdown}`);
            });
        }
        
        return result;
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
        // Display will be initialized by updateDisplay on first data load
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
                // Top flap (fromChar's top half) is rotating down.
                flippingText.textContent = fromChar; // Flap is fromChar's top
                upper.textContent = toChar;          // Stationary top *behind* flap shows toChar
                lower.textContent = fromChar;        // Stationary bottom *behind* flap shows fromChar
                
                const rotation = ratio * 180; // 0 to 90 degrees
                flipping.style.top = '0px';
                flipping.style.height = '50%';
                flipping.style.transformOrigin = 'bottom center';
                flipping.style.transform = `rotateX(-${rotation}deg)`;
                flipping.style.zIndex = '10';
                
                flippingText.style.top = '0';
                flippingText.style.clipPath = 'inset(0 0 50% 0)';
                
            } else { // ratio > 0.5
                // Bottom flap (toChar's bottom half) is rotating down/into place.
                flippingText.textContent = toChar;   // Flap is toChar's bottom
                upper.textContent = toChar;          // Stationary top *behind* flap shows toChar
                lower.textContent = fromChar;        // Stationary bottom *behind* flap still shows fromChar until animation completes
                
                const rotation = (1 - ratio) * 180; // 90 to 0 degrees
                flipping.style.top = '50%';
                flipping.style.height = '50%';
                flipping.style.transformOrigin = 'top center';
                flipping.style.transform = `rotateX(${rotation}deg)`;
                flipping.style.zIndex = '10';
                
                flippingText.style.top = 'calc(-100% - 4px)'; // Move text up so bottom half shows, but compensate for center divider
                flippingText.style.clipPath = 'inset(50% 0 0 0)'; // Show only bottom half
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

        if (this.isFetchingVolume) {
            console.log('Update volume already in progress, skipping.');
            return;
        }
        
        this.isFetchingVolume = true;
        try {
            const newVolume = await this.fetchVolumeData();
            if (newVolume !== null) {
                this.updateDisplay(newVolume);
            }
        } finally {
            this.isFetchingVolume = false;
        }
    }

    startUpdating() {
        if (this.useTestCounter) {
            this.startTestCounter();
        } else {
            // Initial load
            this.updateVolume();
            
            // Update every 5 seconds
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
            // Reinitialize chart on resize for proper scaling
            if (this.chart) {
                this.initChart();
                this.updateChart();
            }
            // Note: We don't reset isFirstLoad here as this is just a resize, not a fresh load
        }
    }

    initChart() {
        if (this.chart) {
            this.chart.destroy();
        }

        const ctx = this.chartElement.getContext('2d');
        
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Daily Volume',
                    data: [],
                    borderColor: '#2ee2a4',
                    backgroundColor: (ctx) => {
                        const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
                        gradient.addColorStop(0, 'rgba(46, 226, 164, 0.8)'); // Top
                        gradient.addColorStop(0.9, 'rgba(34, 163, 118, 0)'); // Bottom
                        return gradient;
                    },
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    pointHoverBackgroundColor: '#2ee2a4',
                    pointHoverBorderColor: '#ffffff',
                    pointHoverBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: '#ffffff',
                        bodyColor: '#ffffff',
                        borderColor: '#2ee2a4',
                        borderWidth: 1,
                        displayColors: false,
                        callbacks: {
                            label: function(context) {
                                return `Volume: ${context.parsed.y.toFixed(1)} S`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'day',
                            displayFormats: {
                                day: 'MMM dd'
                            }
                        },
                        grid: {
                            display: false
                        },
                        border: {
                            color: 'rgba(255, 255, 255, 0.3)'
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)',
                            maxTicksLimit: 7,
                            font: {
                                size: 10
                            }
                        }
                    },
                    y: {
                        grid: {
                            display: false
                        },
                        border: {
                            color: 'rgba(255, 255, 255, 0.3)'
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)',
                            callback: function(value) {
                                return value.toLocaleString();
                            },
                            font: {
                                size: 10
                            }
                        }
                    }
                },
                elements: {
                    point: {
                        radius: 0
                    }
                }
            }
        });
    }

    updateChart() {
        if (!this.chart) {
            this.initChart();
        }

        if (this.chartData && this.chartData.length > 0) {
            console.log('Updating chart with', this.chartData.length, 'data points');
            console.log('Date range:', this.chartData[0].date, 'to', this.chartData[this.chartData.length - 1].date);
            
            this.chart.data.labels = this.chartData.map(item => item.date);
            this.chart.data.datasets[0].data = this.chartData.map(item => item.volume);
            this.chart.update('none'); // No animation for updates
        } else {
            console.log('No chart data available to display');
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