// assets/js/app.js
document.addEventListener('DOMContentLoaded', () => {
    let bleDevice = null;
    let uartService = null;
    let txCharacteristic = null;
    let rxCharacteristic = null;
    
    let dashboardEventsAttached = false;
    let accountId = null;
    let awaitingLoginResponse = false;
    let currentuser = null;

    let settingsPollingInterval = null;
    let latestSettingsResponse = '';

    let settingsbuffer = '';
    let animationBuffer = '';
    let expectingAnimations = false;


    const UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
    const UART_TX_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // notify
    const UART_RX_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // write

    ////////////////////////////////////////////////////////////// DEBUG MODE
    // Check for debug mode in URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const debugLevel = parseInt(urlParams.get('debug'), 10) || 0;
    const DEBUG = debugLevel >= 1;
    const VERBOSE = debugLevel >= 2;

    function debugLog(...args) {
        if (DEBUG) console.log(...args);
    }
    function verboseLog(...args) {
        if (VERBOSE) console.log(...args);
    }
    function showDebugBanner() {
        const banner = document.createElement('div');
        banner.textContent = VERBOSE ? 'VERBOSE MODE 🛠️' : 'DEBUG MODE 🛠️';
        banner.style.position = 'fixed';
        banner.style.bottom = '10px';
        banner.style.left = '10px';
        banner.style.padding = '8px 12px';
        banner.style.backgroundColor = VERBOSE ? '#ff0000' : '#4d4d4d';
        banner.style.color = 'white';
        banner.style.borderRadius = '8px';
        banner.style.fontSize = '14px';
        banner.style.zIndex = '9999';
        banner.style.boxShadow = '0 0 5px rgba(0,0,0,0.2)';
        banner.style.opacity = '0.85';

        document.body.appendChild(banner);
    }

    if (DEBUG) showDebugBanner();

///////////////////////////////////////////////////////////// UI FUNCTIONS
    loadPage('connect', 'connectLayout');

    function loadPage(pageName, containerId) {
        if (window.stopModbusPolling) window.stopModbusPolling();
        const container = document.getElementById(containerId);
        showLoading(container);

        fetch(`./assets/pages/${pageName}.html`)
            .then(response => response.text())
            .then(html => {
                container.innerHTML = html;

                // ✅ Manually execute scripts inside loaded HTML
                const scripts = container.querySelectorAll('script');
                scripts.forEach(oldScript => {
                    const newScript = document.createElement('script');
                    if (oldScript.src) {
                        newScript.src = oldScript.src;
                    } else {
                        newScript.textContent = oldScript.textContent;
                    }
                    document.body.appendChild(newScript);
                    oldScript.remove();
                });

                if (pageName === 'connect') {
                    setupConnectEventListeners();
                } else {
                    setupPageEventListeners();
                }
                if (pageName === 'console') {
                    setupConsoleEvents();
                }
                highlightTab(pageName + 'Tab');
            })
            .catch(err => {
                console.error('Error loading page:', err);
                container.innerHTML = '<p class="text-danger">Failed to load page.</p>';
            }
        );
    }


    function setupConnectEventListeners() {
        document.getElementById('connectBtn')?.addEventListener('click', connect);
        document.getElementById('loginBtn')?.addEventListener('click', login);
        document.getElementById('disconnectBtnLogin')?.addEventListener('click', disconnect);

        const usernameInput = document.getElementById('username');
        const passwordInput = document.getElementById('password');

        if (usernameInput && passwordInput) {
            usernameInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    passwordInput.focus();
                }
            });

            passwordInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    login();
                }
            });
        }
    }
    function setupConsoleEvents() {
        document.getElementById('sendBtn')?.addEventListener('click', send);
        document.getElementById('input')?.addEventListener('keydown', event => {
            if (event.key === 'Enter') send();
        });
    }

    function setupPageEventListeners() {
        if (dashboardEventsAttached) return;
        dashboardEventsAttached = true;

        document.getElementById('consoleTab')?.addEventListener('click', () => {
            stopSettingsPolling(); 
            stopStatusPolling(); 
            loadPage('console', 'appContent');
        });

        document.getElementById('controlTab')?.addEventListener('click', () => {
            stopSettingsPolling(); 
            stopStatusPolling(); 
            window.loadAnimationList();
            loadPage('control', 'appContent');
            const waitForControlInputs = setInterval(() => {
                if (document.getElementById('speed')) {
                    clearInterval(waitForControlInputs);
                    getSettings();          
                    startSettingsPolling();  
                }
            }, 100); 
        });

        document.getElementById('dashboardTab')?.addEventListener('click', () => {
            stopSettingsPolling(); 
            stopStatusPolling(); 
            loadPage('dashboard', 'appContent');
            const waitForDashboard = setInterval(() => {
                if (document.getElementById('tile-0')) {
                    clearInterval(waitForDashboard);
                    startStatusPolling();
                }
            }, 100);
        });

        document.getElementById('sendBtn')?.addEventListener('click', send);
        document.getElementById('disconnectBtnNav')?.addEventListener('click', disconnect);
        document.getElementById('input')?.addEventListener('keydown', event => {
            if (event.key === 'Enter') send();
        });

        document.querySelectorAll('.modbus-tab').forEach(el => {
            el.removeEventListener('click', modbusTabHandler); 
            el.addEventListener('click', modbusTabHandler);
        });

        function modbusTabHandler(e) {
            e.preventDefault();
            stopSettingsPolling(); 
            stopStatusPolling(); 
            const page = e.currentTarget.dataset.page;
            loadPage(`modbus/${page}`, 'appContent');
        }
    }


    function showMainLayout() {
        const connectLayout = document.getElementById('connectLayout');
        const mainLayout = document.getElementById('mainLayout');
        if (connectLayout) connectLayout.style.display = 'none';
        if (mainLayout) mainLayout.style.display = 'block';
        loadPage('dashboard', 'appContent');
        startStatusPolling();
    }

    function showLoading(container) {
        container.innerHTML = `
            <div class="d-flex justify-content-center align-items-center" style="height: 300px;">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
            </div>
        `;
    }

    function highlightTab(tabId) {
        document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
        const tab = document.getElementById(tabId);
        if (tab) tab.classList.add('active');
    }
///////////////////////////////////////////////////////////// CONNECTION
    async function connect() {
        const overlay = document.getElementById('connectSpinnerOverlay');
        if (overlay) overlay.style.display = 'flex'; // Show the spinner

        try {
            bleDevice = await navigator.bluetooth.requestDevice({
                filters: [{ services: [UART_SERVICE_UUID] }]
            });
            const server = await bleDevice.gatt.connect();
            uartService = await server.getPrimaryService(UART_SERVICE_UUID);

            txCharacteristic = await uartService.getCharacteristic(UART_TX_UUID);
            rxCharacteristic = await uartService.getCharacteristic(UART_RX_UUID);

            await txCharacteristic.startNotifications();
            txCharacteristic.addEventListener('characteristicvaluechanged', event => {
                const value = new TextDecoder().decode(event.target.value);
                handleNotification(value);
            });

            debugLog('Connected to ' + bleDevice.name);
            showScreen('loginScreen');
        } catch (error) {
            alert('Error: ' + error);
        } finally {
            if (overlay) overlay.style.display = 'none'; 
        }
    }


    async function sendBLE(text) {
        verboseLog('[BLE SEND] > '+ text);
        if (!rxCharacteristic) {
            debugLog('Not connected yet!');
            return;
        }
        if (accountId && text.startsWith('ht ') && !text.includes('bsid=')) {
            const parts = text.split('^');
            if (parts.length > 1) {
                parts.splice(1, 0, `bsid=${accountId}`);
                text = parts.join('^');
            }
        }
        const encoder = new TextEncoder();
        await rxCharacteristic.writeValue(encoder.encode(text));
    }

    window.sendBLE = sendBLE;

    function handleNotification(value) {
        verboseLog('[BLE RECV] < ' + String(value));
        log('>> ' + String(value));

        if (awaitingLoginResponse) {
            awaitingLoginResponse = false;
            handleLoginResponse(value);
        } else if (value.includes('SpeedValue=') || value.includes('BuzzerValue=')) {
            tryHandleSettingsResponse(value);
        } else if (value.includes('BitStatus=')) {
            tryHandleStatusResponse(value);
        } else if (expectingAnimations) {
            tryHandleAnimationList(value);
        } else if (window.activeRequest === 'text' || window.activeRequest === 'value') {
            window._modbusHandlers.forEach(handler => handler(value));
            return;
        } else {
        for (const key in window._modbusHandlers) {
            if (value.includes(key)) {
            window._modbusHandlers[key](value);
            return;
            }
        }
        console.warn(`Unhandled BLE response: ${value}`);
        }
    }

///////////////////////////////////////////////////////////// LOGIN
    async function login() {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const passwordHash = CryptoJS.MD5(password).toString();
        const combined = username + ':' + passwordHash;
        const combinedHash = CryptoJS.MD5(combined).toString();

        const bodyContent = combinedHash + ';';
        const contentLength = bodyContent.length - 1;
        const packet = `ht POST /login HTTP/1.1^Content-Length: ${contentLength}^Content-Type: text/plain^^${bodyContent}`;

        debugLog('Attempting Login as ', username);

        await sendBLE(packet);

        log('Sent Login Packet');
        awaitingLoginResponse = true;
    }

    async function send() {
        const input = document.getElementById('input');
        if (!input) return;
        const text = input.value;
        await sendBLE(text + '\n');
        log('Sent: ' + text);
        input.value = '';
    }

    function handleLoginResponse(response) {
        const parts = response.split(';;');
        if (parts.length < 2) {
            alert('Unexpected login response.');
            return;
        }
        const payload = parts[1].trim();

        if (payload.toLowerCase() === 'forbidden') {
            document.getElementById('loginError').innerText = 'Login Failed. Please try again.';
            document.getElementById('password').value = '';
            debugLog('Login Failed');
        } else {
            currentuser = document.getElementById('username').value
            accountId = payload;
            updateConsoleHeader();
            showMainLayout();
            debugLog('Login Success: bsid = ' + accountId);
        }
    }
///////////////////////////////////////////////////////////// FUNCTIONS
    function updateConsoleHeader() {
        const header = document.getElementById('consoleHeader');
        if (header) {
            header.innerText = 'Console (Account: ' + currentuser + " | "+ accountId + ')';
        }
    }

    function log(text) {
        const consoleDiv = document.getElementById('console');
        if (consoleDiv) {
            consoleDiv.textContent += text + '\n';
            consoleDiv.scrollTop = consoleDiv.scrollHeight;
        }
    }

    function showScreen(screenId) {
        const screens = ['connectScreen', 'loginScreen', 'consoleScreen', 'diagsScreen'];
        screens.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = (id === screenId) ? 'block' : 'none';
        });
    }


    async function disconnect() {
        if (bleDevice && bleDevice.gatt.connected) {
            if (confirm('Are you sure you want to logout and disconnect?')) {
            bleDevice.gatt.disconnect();
            debugLog('Device disconnected.');
            }
        }
        bleDevice = null;
        uartService = null;
        txCharacteristic = null;
        rxCharacteristic = null;
        accountId = null;
        awaitingLoginResponse = false;

        const mainLayout = document.getElementById('mainLayout');
        const connectLayout = document.getElementById('connectLayout');
        if (mainLayout) mainLayout.style.display = 'none';
        if (connectLayout) connectLayout.style.display = 'block';
        document.getElementById('logoutNavItem').classList.add('d-none');

        loadPage('connect', 'connectLayout');
    }
///////////////////////////////////////////////////////////// GET SETTINGS - CONTROL TAB
    //---------------------------// POLLING
    function startSettingsPolling() {
        if (settingsPollingInterval) clearInterval(settingsPollingInterval);
        settingsPollingInterval = setInterval(() => {
            getSettings();
        }, 10000);
    }
    
    function stopSettingsPolling() {
        if (settingsPollingInterval) {
            clearInterval(settingsPollingInterval);
            settingsPollingInterval = null;
        }
    }
    //---------------------------// DATA HANDLING
    async function getSettings() {
        const packet = `ht GET /getSettings HTTP/1.1^^;`;
        await sendBLE(packet);
    }
    
    function tryHandleSettingsResponse(partial) {
        settingsbuffer += partial;
    
        verboseLog('buffer:', settingsbuffer); // debug log
    
        if (!settingsbuffer.includes('BuzzerValue=')) return;
    
        const full = settingsbuffer.trim();
        settingsbuffer = ''; // reset
    
        if (!full.includes('SpeedValue=')) return;
        const isNew = full !== latestSettingsResponse;
        latestSettingsResponse = full;
    
        const body = full.split(';').pop();
        const fields = {};
        body.split('&').forEach(pair => {
            const [key, val] = pair.split('=');
            if (key && val !== undefined) fields[key.trim()] = val.trim();
        });
    
        if (fields.SpeedValue) updateNumber('speed', fields.SpeedValue);
        if (fields.LengthValue) updateNumber('length', fields.LengthValue);
        if (fields.LineValue) updateNumber('line', fields.LineValue);
        if (fields.SwingValue) updateNumber('swing', fields.SwingValue);
        if (fields.HopperValue) updateNumber('repeat', fields.HopperValue);
        if (fields.BrightValue) updateNumber('brightness', fields.BrightValue);
        if (fields.LaserValue !== undefined) updateToggle('lazerToggle', fields.LaserValue);
        if (fields.BuzzerValue !== undefined) updateToggle('buzzerToggle', fields.BuzzerValue);
    }
    ///////////////////////////////////////////////////////////////////// GET STATUS - DASHBOARD
    function tryHandleStatusResponse(raw) {
        const body = raw.split(';').pop();
        const pairs = body.split('&');
        const map = {};
        pairs.forEach(pair => {
            const [key, val] = pair.split('=');
            if (key && val) map[key.trim()] = val.trim();
        });

        const bitVal = parseInt(map['BitStatus'], 10);
        if (!isNaN(bitVal) && typeof window.renderStatusGrid === 'function') {
            window.renderStatusGrid(bitVal);
        } else {
            debugLog('BitStatus received but renderStatusGrid not yet defined.');
        }
    }

    let statusPollingInterval = null;

    function startStatusPolling() {
        if (statusPollingInterval) clearInterval(statusPollingInterval);
            statusPollingInterval = setInterval(() => {
            getStatus();
        }, 3000); // Adjust polling speed here
    }

    function stopStatusPolling() {
        if (statusPollingInterval) {
            clearInterval(statusPollingInterval);
            statusPollingInterval = null;
        }
    }

    async function getStatus() {
        const packet = `ht GET /getStatus HTTP/1.1^^;`;
        await sendBLE(packet);
    }
    

    window.renderStatusGrid = function(bitmask = 0) {
        for (let i = 0; i < 9; i++) {
            const card = document.querySelector(`#tile-${i} .card`);
            const badge = document.querySelector(`#tile-${i} .badge`);
            if (!card || !badge) continue;
            const ready = (bitmask & (1 << i)) !== 0;

            card.classList.toggle('bg-success', ready);
            card.classList.toggle('bg-danger', !ready);
            badge.textContent = ready ? 'Ready' : 'Not Ready';
            badge.classList.toggle('bg-light', ready);
            badge.classList.toggle('text-dark', ready);
            badge.classList.toggle('bg-dark', !ready);
            }
    };

    ///////////////////////////////////////////////////////////////////// CONTROL TAB UI
    window.toggle = async function(btn) {
        const isOn = btn.innerText === 'On';
        btn.innerText = isOn ? 'Off' : 'On';
        btn.classList.toggle('btn-outline-primary');
        btn.classList.toggle('btn-primary');
        const newValue = isOn ? 0 : 1;

        const keyMap = {
            lazerToggle: 'LaserValue',
            buzzerToggle: 'BuzzerValue'
        };

        const settingKey = keyMap[btn.id];
        if (settingKey) {
            await window.sendSettingUpdate(settingKey, newValue);
        }
    };

    window.sendCommand = async function(command) {
        debugLog(`Command sent: ${command}`);

        if (command === 'oneBall') {
            const packet = `ht POST /postBowl HTTP/1.1^Content-Length: 0^Content-Type: text/plain^^;`;
            await sendBLE(packet);
        }


    };
    
    function updateNumber(id, value) {
        const input = document.getElementById(id);
        if (input && !isNaN(value)) {
            input.value = parseInt(value, 10);
        }
    }
    
    function updateToggle(id, value) {
        const button = document.getElementById(id);
        if (button) {
            const isOn = value === '1';
            button.innerText = isOn ? 'On' : 'Off';
            button.classList.toggle('btn-primary', isOn);
            button.classList.toggle('btn-outline-primary', !isOn);
        }
    }

    window.adjust = async function(id, change) {
        const input = document.getElementById(id);
        let value = parseInt(input.value, 10);
        const [min, max] = {
            speed: [0, 100],
            length: [0, 100],
            line: [-100, 100],
            swing: [-9, 9],
            repeat: [2, 30],
            brightness: [0, 100]
        }[id];
        value = Math.min(max, Math.max(min, value + change));
        input.value = value;

        const keyMap = {
            speed: 'SpeedValue',
            length: 'LengthValue',
            line: 'LineValue',
            swing: 'SwingValue',
            repeat: 'HopperValue',
            brightness: 'BrightValue'
        };

        const settingKey = keyMap[id];
        if (settingKey) {
            await sendSettingUpdate(settingKey, value);
        }
        };

        window.sendSettingUpdate = async function(key, value) {
            const payload = `${key}=${value}`;
            const packet = `ht POST /postSettings HTTP/1.1^Content-Length: ${payload.length}^Content-Type: text/plain^^${payload};`;
            debugLog(`[BLE SEND] Updating ${key}: ${value}`);
            await sendBLE(packet);
        };

        window.inputChanged = async function(input) {
        const id = input.id;
        let value = parseInt(input.value, 10);
        const [min, max] = {
            speed: [0, 100],
            length: [0, 100],
            line: [-100, 100],
            swing: [-9, 9],
            repeat: [2, 30],
            brightness: [0, 100]
        }[id];
        value = Math.min(max, Math.max(min, value));
        input.value = value;

        const keyMap = {
            speed: 'SpeedValue',
            length: 'LengthValue',
            line: 'LineValue',
            swing: 'SwingValue',
            repeat: 'HopperValue',
            brightness: 'BrightValue'
        };

        const settingKey = keyMap[id];
        if (settingKey) {
            debugLog(`[INPUT BLUR] ${settingKey} = ${value}`);
            await sendSettingUpdate(settingKey, value);
        }
    };

    window.loadAnimationList = async function() {
        animationBuffer = '';
        expectingAnimations = true;
        const packet = `ht GET /getAnimations HTTP/1.1^^;`;
        await sendBLE(packet);
    };
    window.onAnimationSelected = async function(select) {
        const selectedAnimation = select.value;
        debugLog(`Selected animation: ${selectedAnimation}`);
        const packet = `ht POST /postAnimation HTTP/1.1^Content-Length: ${selectedAnimation.length}^Content-Type: text/plain^^${selectedAnimation};`;
        await sendBLE(packet);
        setTimeout(() => window.loadAnimationList(), 500);
    };

    function tryHandleAnimationList(chunk) {
        animationBuffer += chunk;
        verboseLog('Animation buffer:', animationBuffer); 
        if (!chunk.includes(';0') && !chunk.endsWith('0;;')) return;

        expectingAnimations = false;

        const rawItems = animationBuffer
            .split(/&;[0-9]+;/)
            .map(str => str.trim())
            .filter(str => str.length > 0 && !/^\d+$/.test(str));

        const cleanedAnimations = rawItems
            .map(name => {
                const match = name.match(/^[A-Z0-9]+/i);
                return match ? match[0] : null;
            })
            .filter(Boolean);

        if (cleanedAnimations.length && cleanedAnimations[0].startsWith('HTTP')) {
            cleanedAnimations.shift();
        }

        const select = document.getElementById('animationSelect');
        if (!select) return;

        const previouslySelected = select.value;

        select.innerHTML = cleanedAnimations.map(anim =>
            `<option value="${anim}">${anim}</option>`
        ).join('');
        if (cleanedAnimations.includes(previouslySelected)) {
            select.value = previouslySelected;
        } else if (cleanedAnimations.length > 0) {
            select.value = cleanedAnimations[0];
        } else {
            select.innerHTML = '<option value="">No animations available</option>';
            debugLog('No animations available');
        }

        debugLog('Loaded animations:', cleanedAnimations);
        animationBuffer = '';
    }

});
