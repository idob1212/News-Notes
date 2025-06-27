// Account management functionality
document.addEventListener('DOMContentLoaded', function() {
    let NewsNotesConfig = null; // Renamed

    function loadConfig() {
        // Prefer pre-loaded config from switch-env.js if available
        if (window.NewsNotesConfigGlobal && window.NewsNotesConfigGlobal.ENVIRONMENT) {
            NewsNotesConfig = window.NewsNotesConfigGlobal;
            return NewsNotesConfig;
        }
        if (window.NewsNotesConfig) {
            return window.NewsNotesConfig;
        }
        // Fallback (should ideally not be used in production)
        console.warn('Global config not found, using fallback inline config for account.js.');
        NewsNotesConfig = {
            ENVIRONMENT: 'development',
            environments: {
                development: { API_BASE_URL: 'http://localhost:8000' },
                production: { API_BASE_URL: 'https://news-notes.onrender.com' }
            },
            get current() { return this.environments[this.ENVIRONMENT]; },
            getBaseUrl() { return this.current.API_BASE_URL; }
        };
        window.NewsNotesConfig = NewsNotesConfig;
        return NewsNotesConfig;
    }

    const config = loadConfig();
    const API_BASE_URL = config.getBaseUrl();

    // DOM elements
    const authSection = document.getElementById('authSection');
    const dashboardSection = document.getElementById('dashboardSection');
    const loginFormEl = document.getElementById('loginForm'); // Renamed for clarity
    const registerFormEl = document.getElementById('registerForm'); // Renamed
    const loginFormElement = document.getElementById('loginFormElement');
    const registerFormElement = document.getElementById('registerFormElement');
    const statusMessageContainer = document.getElementById('statusMessageContainer');
    const loadingIndicator = document.getElementById('loadingIndicator');

    // Dashboard elements
    const userEmailDisplay = document.getElementById('userEmailDisplay'); // Renamed
    const accountTypeEl = document.getElementById('accountType').querySelector('.plan-badge'); // Target badge directly
    const monthlyUsageEl = document.getElementById('monthlyUsage');
    const usageLimitEl = document.getElementById('usageLimit');
    const resetDateEl = document.getElementById('resetDate'); // For text part of reset date
    const usageProgressContainer = document.getElementById('usageProgressContainer');
    const usageProgressBar = document.getElementById('usageProgressBar');
    const usageTextDetails = document.getElementById('usageTextDetails');


    const freeAccountBilling = document.getElementById('freeAccountBilling');
    const premiumAccountBilling = document.getElementById('premiumAccountBilling');
    const logoutBtn = document.getElementById('logoutBtn');
    const upgradeBtn = document.getElementById('upgradeBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const googleSignInBtn = document.getElementById('googleSignInBtn');
    const appleSignInBtn = document.getElementById('appleSignInBtn');

    // Utility functions
    function showLoading() {
        loadingIndicator.style.display = 'flex'; // Changed to flex for centering
    }

    function hideLoading() {
        loadingIndicator.style.display = 'none';
    }

    let messageTimeout;
    function showMessage(message, type = 'info', persistent = false) {
        clearTimeout(messageTimeout); // Clear existing timeout
        const messageDiv = document.createElement('div');
        messageDiv.className = `status-message ${type}`;
        messageDiv.textContent = message;
        
        statusMessageContainer.innerHTML = ''; // Clear previous messages
        statusMessageContainer.appendChild(messageDiv);
        messageDiv.style.display = 'block';

        if (!persistent) {
            messageTimeout = setTimeout(() => {
                messageDiv.style.display = 'none';
            }, 7000); // Increased timeout for better readability
        }
    }

    // Token management functions (no changes needed from original)
    function getStoredToken() {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.local.get(['authToken'], (result) => resolve(result.authToken));
            } else {
                resolve(localStorage.getItem('authToken'));
            }
        });
    }
    function storeToken(token) {
        // Store email for post-payment confirmation
        const decodedToken = parseJwt(token);
        if (decodedToken && decodedToken.sub) {
            localStorage.setItem('userEmailForConfirmation', decodedToken.sub);
        }

        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.local.set({ authToken: token }, resolve);
            } else {
                localStorage.setItem('authToken', token);
                resolve();
            }
        });
    }
    function removeToken() {
        localStorage.removeItem('userEmailForConfirmation');
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.local.remove(['authToken'], resolve);
            } else {
                localStorage.removeItem('authToken');
                resolve();
            }
        });
    }
    function parseJwt(token) {
        try {
            return JSON.parse(atob(token.split('.')[1]));
        } catch (e) {
            return null;
        }
    }


    // API functions (minor error handling improvement)
    async function apiRequest(endpoint, options = {}) {
        showLoading(); // Show loading for all API requests
        try {
            const token = await getStoredToken();
            const headers = { 'Content-Type': 'application/json', ...options.headers };
            if (token) headers.Authorization = `Bearer ${token}`;

            const response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
            const data = await response.json().catch(() => {
                 // Handle cases where response is not JSON (e.g. server error page)
                if (!response.ok) throw new Error(`HTTP error ${response.status} - Server returned non-JSON response.`);
                return {}; // Or handle as appropriate
            });

            if (!response.ok) {
                 // Use detail from JSON if available, otherwise use status text or generic message
                const errorMessage = data.detail || response.statusText || `API request failed with status ${response.status}`;
                throw new Error(errorMessage);
            }
            return data;
        } catch (error) {
            console.error(`API request to ${endpoint} failed:`, error);
            // Ensure a user-friendly message is thrown
            throw new Error(error.message.includes("Failed to fetch") ? "Network error. Please check your connection." : error.message);
        } finally {
            hideLoading(); // Hide loading after request completes or fails
        }
    }

    // Auth functions (register, login, OAuth) - largely the same, using new apiRequest
    async function register(email, password, fullName) {
        const data = await apiRequest('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ email, password, full_name: fullName })
        });
        await storeToken(data.access_token);
        return data;
    }
    async function login(email, password) {
        const data = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        await storeToken(data.access_token);
        return data;
    }
    async function googleLoginApi(token) {
        const data = await apiRequest('/auth/google', {
            method: 'POST', body: JSON.stringify({ token })
        });
        await storeToken(data.access_token);
        return data;
    }
    async function appleLoginApi(token) {
        const data = await apiRequest('/auth/apple', {
            method: 'POST', body: JSON.stringify({ token })
        });
        await storeToken(data.access_token);
        return data;
    }


    // Data fetching functions
    async function getCurrentUser() { return await apiRequest('/auth/me'); }
    async function getUserUsage() { return await apiRequest('/auth/usage'); }

    // Billing functions
    async function createSubscription() {
        return await apiRequest('/billing/subscribe', {
            method: 'POST',
            body: JSON.stringify({
                // Success/cancel URLs now point to account.html for better UX
                success_url: `${window.location.origin}${window.location.pathname}?payment=success`,
                cancel_url: `${window.location.origin}${window.location.pathname}?payment=cancelled`
            })
        });
    }
    async function cancelSubscription() {
        return await apiRequest('/billing/cancel', { method: 'POST' });
    }

    // Form handlers (updated to use new showMessage and field IDs)
    async function handleLogin(event) {
        event.preventDefault();
        try {
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            if (!email || !password) {
                showMessage("Email and password are required.", "error");
                return;
            }
            await login(email, password);
            showMessage('Login successful! Loading your dashboard...', 'success');
            await loadDashboard();
        } catch (error) { showMessage(error.message, 'error'); }
    }
    async function handleRegister(event) {
        event.preventDefault();
        try {
            const email = document.getElementById('registerEmail').value;
            const password = document.getElementById('registerPassword').value;
            const fullName = document.getElementById('registerName').value;
             if (!email || !password) {
                showMessage("Email and password are required.", "error");
                return;
            }
            if (password.length < 8) {
                showMessage("Password must be at least 8 characters long.", "error");
                return;
            }
            await register(email, password, fullName);
            showMessage('Account created successfully! Loading your dashboard...', 'success');
            await loadDashboard();
        } catch (error) { showMessage(error.message, 'error'); }
    }
    // OAuth handlers (no major changes, just using new showMessage)
    async function handleGoogleSignIn() {
        try {
            const dummyGoogleToken = `dummy_google_token_user${Date.now()}_${Math.random().toString(36).substring(7)}`;
            showMessage('Simulating Google Sign-In...', 'info');
            await new Promise(resolve => setTimeout(resolve, 1000)); // Reduced delay
            await googleLoginApi(dummyGoogleToken);
            showMessage('Google Sign-In successful! Loading dashboard...', 'success');
            await loadDashboard();
        } catch (error) { showMessage(`Google Sign-In failed: ${error.message}`, 'error');}
    }
    async function handleAppleSignIn() {
         try {
            const dummyAppleToken = `dummy_apple_token_user${Date.now()}_${Math.random().toString(36).substring(7)}`;
            showMessage('Simulating Apple Sign-In...', 'info');
            await new Promise(resolve => setTimeout(resolve, 1000));
            await appleLoginApi(dummyAppleToken);
            showMessage('Apple Sign-In successful! Loading dashboard...', 'success');
            await loadDashboard();
        } catch (error) { showMessage(`Apple Sign-In failed: ${error.message}`, 'error');}
    }


    async function handleLogout() {
        try {
            await removeToken();
            showAuthUI(); // Changed function name for clarity
            showMessage('You have been logged out.', 'success');
        } catch (error) {
            showMessage('Logout failed. Please try again.', 'error');
        }
    }

    async function handleUpgrade() {
        try {
            const response = await createSubscription();
            if (response.checkout_url) {
                 // Store email before redirecting for post-payment confirmation
                const token = await getStoredToken();
                const decoded = parseJwt(token);
                if(decoded && decoded.sub) localStorage.setItem('userEmailForConfirmation', decoded.sub);

                window.location.href = response.checkout_url; // Redirect to Paddle
            } else {
                showMessage('Could not initiate upgrade. Please try again later.', 'error');
            }
        } catch (error) { showMessage(error.message, 'error'); }
    }

    async function handleCancel() {
        if (!confirm('Are you sure you want to cancel your Premium subscription? This action cannot be undone through this interface.')) return;
        try {
            await cancelSubscription();
            showMessage('Subscription cancellation request processed. Changes will reflect soon.', 'success');
            // Refresh dashboard after a short delay to allow backend to process (ideally webhook handles this)
            setTimeout(loadDashboard, 3000);
        } catch (error) { showMessage(error.message, 'error'); }
    }

    // UI update functions
    function showAuthUI() {
        authSection.style.display = 'block';
        dashboardSection.style.display = 'none';
        showLoginFormUI(); // Default to login form
    }

    function showDashboardUI() {
        authSection.style.display = 'none';
        dashboardSection.style.display = 'block';
    }

    function updateUsageDisplay(usage) {
        accountTypeEl.textContent = usage.account_type.toUpperCase();
        accountTypeEl.className = `plan-badge ${usage.account_type.toLowerCase()}`;

        monthlyUsageEl.textContent = usage.monthly_usage;
        const limitDisplay = usage.usage_limit === 999999 ? 'Unlimited' : usage.usage_limit;
        usageLimitEl.textContent = limitDisplay;

        if (usage.account_type === 'free' && usage.usage_limit > 0 && usage.usage_limit !== 999999) {
            const percentage = (usage.monthly_usage / usage.usage_limit) * 100;
            usageProgressBar.style.width = `${Math.min(percentage, 100)}%`;
            usageProgressBar.className = 'usage-progress-bar'; // Reset classes
            if (percentage >= 100) usageProgressBar.classList.add('limit-reached');
            else if (percentage >= 80) usageProgressBar.classList.add('warning');

            usageProgressContainer.style.display = 'block';
        } else {
            usageProgressContainer.style.display = 'none';
        }

        const nextResetDate = new Date(usage.usage_reset_date).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
        resetDateEl.textContent = nextResetDate;
        usageTextDetails.style.display = 'block'; // Show reset date details
    }

    async function loadDashboard() {
        try {
            showLoading(); // Show loading indicator for dashboard loading
            const [user, usage] = await Promise.all([getCurrentUser(), getUserUsage()]);

            userEmailDisplay.textContent = user.email;
            updateUsageDisplay(usage);

            if (usage.account_type === 'premium') {
                freeAccountBilling.style.display = 'none';
                premiumAccountBilling.style.display = 'block';
            } else {
                freeAccountBilling.style.display = 'block';
                premiumAccountBilling.style.display = 'none';
            }
            showDashboardUI();
        } catch (error) {
            showMessage(error.message.includes("token") ? "Your session may have expired. Please log in again." : error.message, 'error', true);
            showAuthUI(); // Show auth UI if dashboard loading fails
        } finally {
            hideLoading();
        }
    }

    // Form switching
    function showLoginFormUI() {
        loginFormEl.style.display = 'block';
        registerFormEl.style.display = 'none';
    }
    function showRegisterFormUI() {
        loginFormEl.style.display = 'none';
        registerFormEl.style.display = 'block';
    }

    // Event listeners
    loginFormElement.addEventListener('submit', handleLogin);
    registerFormElement.addEventListener('submit', handleRegister);
    logoutBtn.addEventListener('click', handleLogout);
    upgradeBtn.addEventListener('click', handleUpgrade);
    cancelBtn.addEventListener('click', handleCancel);
    googleSignInBtn.addEventListener('click', handleGoogleSignIn);
    appleSignInBtn.addEventListener('click', handleAppleSignIn);
    
    document.getElementById('showRegisterLink').addEventListener('click', (e) => { e.preventDefault(); showRegisterFormUI(); });
    document.getElementById('showLoginLink').addEventListener('click', (e) => { e.preventDefault(); showLoginFormUI(); });

    // Check URL parameters for payment status and display message
    function checkPaymentStatus() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('payment') === 'success') {
            showMessage('Payment successful! Your account has been upgraded.', 'success', true);
            // Remove query params to prevent message re-display on reload
            window.history.replaceState({}, document.title, window.location.pathname);
        } else if (urlParams.get('payment') === 'cancelled') {
            showMessage('Your payment process was cancelled.', 'info', true);
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }

    // Initialize
    async function init() {
        checkPaymentStatus(); // Check this first
        const token = await getStoredToken();
        if (token) {
            await loadDashboard();
        } else {
            showAuthUI();
        }
    }

    init().catch(error => {
        console.error('Initialization error:', error);
        showMessage('Could not initialize account page. Please refresh.', 'error', true);
        showAuthUI(); // Fallback to auth UI
    });
});