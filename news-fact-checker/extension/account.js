// Account management functionality
document.addEventListener('DOMContentLoaded', function() {
    // Configuration
    let TruthPilotConfig = null;

    // Load configuration
    function loadConfig() {
        if (window.TruthPilotConfig) {
            TruthPilotConfig = window.TruthPilotConfig;
            return TruthPilotConfig;
        }
        
        // Fallback: inline config if not available globally
        TruthPilotConfig = {
            ENVIRONMENT: 'development',
            environments: {
                development: {
                    API_BASE_URL: 'http://localhost:8000',
                    API_ENDPOINT: 'http://localhost:8000/analyze'
                },
                production: {
                    API_BASE_URL: 'https://news-notes.onrender.com',
                    API_ENDPOINT: 'https://news-notes.onrender.com/analyze'
                }
            },
            get current() {
                return this.environments[this.ENVIRONMENT];
            },
            getApiUrl() {
                return this.current.API_ENDPOINT;
            },
            getBaseUrl() {
                return this.current.API_BASE_URL;
            }
        };
        
        window.TruthPilotConfig = TruthPilotConfig;
        return TruthPilotConfig;
    }

    // Initialize configuration
    const config = loadConfig();
    const API_BASE_URL = config.getBaseUrl();

    // DOM elements
    const authSection = document.getElementById('authSection');
    const dashboardSection = document.getElementById('dashboardSection');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const loginFormElement = document.getElementById('loginFormElement');
    const registerFormElement = document.getElementById('registerFormElement');
    const statusMessage = document.getElementById('statusMessage');
    const loadingIndicator = document.getElementById('loadingIndicator');

    // Dashboard elements
    const userEmail = document.getElementById('userEmail');
    const accountType = document.getElementById('accountType');
    const monthlyUsage = document.getElementById('monthlyUsage');
    const usageLimit = document.getElementById('usageLimit');
    const resetDate = document.getElementById('resetDate');
    const freeAccountBilling = document.getElementById('freeAccountBilling');
    const premiumAccountBilling = document.getElementById('premiumAccountBilling');
    const logoutBtn = document.getElementById('logoutBtn');
    const upgradeBtn = document.getElementById('upgradeBtn');
    const cancelBtn = document.getElementById('cancelBtn');

    // Utility functions
    function showLoading() {
        loadingIndicator.style.display = 'block';
    }

    function hideLoading() {
        loadingIndicator.style.display = 'none';
    }

    function showMessage(message, type = 'info') {
        statusMessage.textContent = message;
        statusMessage.className = `status-message ${type}`;
        statusMessage.style.display = 'block';
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            statusMessage.style.display = 'none';
        }, 5000);
    }

    function getStoredToken() {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.local.get(['authToken'], (result) => {
                    resolve(result.authToken);
                });
            } else {
                resolve(localStorage.getItem('authToken'));
            }
        });
    }

    function storeToken(token) {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.local.set({ authToken: token }, () => {
                    resolve();
                });
            } else {
                localStorage.setItem('authToken', token);
                resolve();
            }
        });
    }

    function removeToken() {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.local.remove(['authToken'], () => {
                    resolve();
                });
            } else {
                localStorage.removeItem('authToken');
                resolve();
            }
        });
    }

    // API functions
    async function apiRequest(endpoint, options = {}) {
        const token = await getStoredToken();
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || 'API request failed');
        }

        return data;
    }

    async function register(email, password, fullName) {
        const data = await apiRequest('/auth/register', {
            method: 'POST',
            body: JSON.stringify({
                email,
                password,
                full_name: fullName
            })
        });

        await storeToken(data.access_token);
        return data;
    }

    async function login(email, password) {
        const data = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({
                email,
                password
            })
        });

        await storeToken(data.access_token);
        return data;
    }

    async function getCurrentUser() {
        return await apiRequest('/auth/me');
    }

    async function getUserUsage() {
        return await apiRequest('/auth/usage');
    }

    async function createSubscription() {
        const currentUrl = window.location.href;
        const baseUrl = currentUrl.split('/').slice(0, -1).join('/');
        
        return await apiRequest('/billing/subscribe', {
            method: 'POST',
            body: JSON.stringify({
                success_url: `${baseUrl}/account.html?success=true`,
                cancel_url: `${baseUrl}/account.html?cancelled=true`
            })
        });
    }

    async function cancelSubscription() {
        return await apiRequest('/billing/cancel', {
            method: 'POST'
        });
    }

    // Form handlers
    async function handleLogin(event) {
        event.preventDefault();
        showLoading();

        try {
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;

            await login(email, password);
            showMessage('Login successful!', 'success');
            await loadDashboard();
        } catch (error) {
            showMessage(error.message, 'error');
        } finally {
            hideLoading();
        }
    }

    async function handleRegister(event) {
        event.preventDefault();
        showLoading();

        try {
            const email = document.getElementById('registerEmail').value;
            const password = document.getElementById('registerPassword').value;
            const fullName = document.getElementById('registerName').value;

            await register(email, password, fullName);
            showMessage('Account created successfully!', 'success');
            await loadDashboard();
        } catch (error) {
            showMessage(error.message, 'error');
        } finally {
            hideLoading();
        }
    }

    async function handleLogout() {
        await removeToken();
        showAuth();
        showMessage('Logged out successfully', 'success');
    }

    async function handleUpgrade() {
        showLoading();
        
        try {
            const response = await createSubscription();
            // Redirect to Paddle checkout
            window.open(response.checkout_url, '_blank');
            showMessage('Redirecting to checkout...', 'info');
        } catch (error) {
            showMessage(error.message, 'error');
        } finally {
            hideLoading();
        }
    }

    async function handleCancel() {
        if (!confirm('Are you sure you want to cancel your subscription?')) {
            return;
        }

        showLoading();

        try {
            await cancelSubscription();
            showMessage('Subscription cancelled successfully', 'success');
            setTimeout(() => {
                loadDashboard(); // Refresh dashboard
            }, 1000);
        } catch (error) {
            showMessage(error.message, 'error');
        } finally {
            hideLoading();
        }
    }

    // UI functions
    function showAuth() {
        authSection.style.display = 'block';
        dashboardSection.style.display = 'none';
    }

    function showDashboard() {
        authSection.style.display = 'none';
        dashboardSection.style.display = 'block';
    }

    async function loadDashboard() {
        showLoading();

        try {
            const [user, usage] = await Promise.all([
                getCurrentUser(),
                getUserUsage()
            ]);

            // Update user info
            userEmail.textContent = user.email;
            accountType.textContent = usage.account_type.toUpperCase();

            // Update usage info
            monthlyUsage.textContent = usage.monthly_usage;
            usageLimit.textContent = usage.usage_limit === 999999 ? 'Unlimited' : usage.usage_limit;
            resetDate.textContent = new Date(usage.usage_reset_date).toLocaleDateString();

            // Show appropriate billing section
            if (usage.account_type === 'premium') {
                freeAccountBilling.style.display = 'none';
                premiumAccountBilling.style.display = 'block';
            } else {
                freeAccountBilling.style.display = 'block';
                premiumAccountBilling.style.display = 'none';
            }

            showDashboard();
        } catch (error) {
            showMessage(error.message, 'error');
            showAuth();
        } finally {
            hideLoading();
        }
    }

    // Form switching functions
    function showLoginForm() {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
    }

    function showRegisterForm() {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
    }

    // Event listeners
    loginFormElement.addEventListener('submit', handleLogin);
    registerFormElement.addEventListener('submit', handleRegister);
    logoutBtn.addEventListener('click', handleLogout);
    upgradeBtn.addEventListener('click', handleUpgrade);
    cancelBtn.addEventListener('click', handleCancel);
    
    // Add event listeners for form switching
    document.getElementById('showRegisterLink').addEventListener('click', function(e) {
        e.preventDefault();
        showRegisterForm();
    });
    
    document.getElementById('showLoginLink').addEventListener('click', function(e) {
        e.preventDefault();
        showLoginForm();
    });

    // Check URL parameters for payment status
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('success') === 'true') {
        showMessage('Payment successful! Your account has been upgraded.', 'success');
    } else if (urlParams.get('cancelled') === 'true') {
        showMessage('Payment cancelled.', 'info');
    }

    // Initialize app
    async function init() {
        const token = await getStoredToken();
        
        if (token) {
            await loadDashboard();
        } else {
            showAuth();
        }
    }

    // Start the app
    init().catch(error => {
        console.error('Initialization error:', error);
        showAuth();
    });
}); 