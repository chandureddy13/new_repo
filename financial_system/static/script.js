// Global variables
let currentUser = null;
let transactions = [];
let budgets = [];

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    // Set today's date as default
    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('transaction-date');
    if (dateInput) {
        dateInput.value = today;
    }
    
    const monthInput = document.getElementById('budget-month');
    if (monthInput) {
        monthInput.value = new Date().toISOString().slice(0, 7);
    }
    
    // Setup form event listeners
    setupEventListeners();
    
    // Check if user is already logged in
    checkAuthStatus();
});

// Setup all event listeners
function setupEventListeners() {
    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // Register form
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }
    
    // Forgot password form
    const forgotForm = document.getElementById('forgotForm');
    if (forgotForm) {
        forgotForm.addEventListener('submit', handleForgotPassword);
    }
    
    // OTP form
    const otpForm = document.getElementById('otpForm');
    if (otpForm) {
        otpForm.addEventListener('submit', handleOTPVerification);
    }
    
    // Transaction form
    const transactionForm = document.getElementById('transaction-form');
    if (transactionForm) {
        transactionForm.addEventListener('submit', handleAddTransaction);
    }
    
    // Budget form
    const budgetForm = document.getElementById('budget-form');
    if (budgetForm) {
        budgetForm.addEventListener('submit', handleAddBudget);
    }
}

// Show/Hide authentication forms
function showLogin() {
    hideAllAuthForms();
    document.getElementById('login-form').style.display = 'block';
}

function showRegister() {
    hideAllAuthForms();
    document.getElementById('register-form').style.display = 'block';
}

function showForgotPassword() {
    hideAllAuthForms();
    document.getElementById('forgot-form').style.display = 'block';
}

function showOTPForm(email, phone) {
    hideAllAuthForms();
    document.getElementById('otp-form').style.display = 'block';
    document.getElementById('otp-message').innerHTML = 
        `OTP has been sent to your email: ${email}<br>Your registered phone: ***-***-${phone}`;
    document.getElementById('otp-email').value = email;
}

function hideAllAuthForms() {
    const forms = ['login-form', 'register-form', 'forgot-form', 'otp-form'];
    forms.forEach(formId => {
        const form = document.getElementById(formId);
        if (form) {
            form.style.display = 'none';
        }
    });
}

// Authentication handlers
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    
    if (!email || !password) {
        showNotification('Please fill in all fields', 'error');
        return;
    }
    
    if (!isValidEmail(email)) {
        showNotification('Please enter a valid email address', 'error');
        return;
    }
    
    const loginBtn = e.target.querySelector('button[type="submit"]');
    setLoading(loginBtn, true);
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password }),
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentUser = data.user;
            showMainApp();
            loadUserData();
            showNotification('Login successful!', 'success');
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        showNotification('Login failed. Please try again.', 'error');
    } finally {
        setLoading(loginBtn, false);
    }
}

async function handleRegister(e) {
    e.preventDefault();
    
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const phone = document.getElementById('reg-phone').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirmPassword = document.getElementById('reg-confirm-password').value;
    
    // Validation
    if (!name || !email || !phone || !password || !confirmPassword) {
        showNotification('Please fill in all fields', 'error');
        return;
    }
    
    if (!isValidEmail(email)) {
        showNotification('Please enter a valid email address', 'error');
        return;
    }
    
    if (phone.length < 10) {
        showNotification('Please enter a valid phone number', 'error');
        return;
    }
    
    if (password.length < 6) {
        showNotification('Password must be at least 6 characters long', 'error');
        return;
    }
    
    if (password !== confirmPassword) {
        showNotification('Passwords do not match', 'error');
        return;
    }
    
    const registerBtn = e.target.querySelector('button[type="submit"]');
    setLoading(registerBtn, true);
    
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name, email, phone, password }),
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Registration successful! Please login.', 'success');
            showLogin();
            // Clear form
            document.getElementById('registerForm').reset();
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        showNotification('Registration failed. Please try again.', 'error');
    } finally {
        setLoading(registerBtn, false);
    }
}

async function handleForgotPassword(e) {
    e.preventDefault();
    
    const email = document.getElementById('forgot-email').value.trim();
    
    if (!email) {
        showNotification('Please enter your email address', 'error');
        return;
    }
    
    if (!isValidEmail(email)) {
        showNotification('Please enter a valid email address', 'error');
        return;
    }
    
    const forgotBtn = e.target.querySelector('button[type="submit"]');
    setLoading(forgotBtn, true);
    
    try {
        const response = await fetch('/api/forgot-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email }),
        });
        
        const data = await response.json();
        
        if (data.success) {
            showOTPForm(email, data.phone);
            showNotification('OTP sent successfully!', 'success');
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        showNotification('Failed to send OTP. Please try again.', 'error');
    } finally {
        setLoading(forgotBtn, false);
    }
}

async function handleOTPVerification(e) {
    e.preventDefault();
    
    const email = document.getElementById('otp-email').value.trim();
    const otp = document.getElementById('otp-code').value.trim();
    const newPassword = document.getElementById('new-password').value;
    const confirmNewPassword = document.getElementById('confirm-new-password').value;
    
    if (!otp || !newPassword || !confirmNewPassword) {
        showNotification('Please fill in all fields', 'error');
        return;
    }
    
    if (otp.length !== 6) {
        showNotification('OTP must be 6 digits', 'error');
        return;
    }
    
    if (newPassword.length < 6) {
        showNotification('Password must be at least 6 characters long', 'error');
        return;
    }
    
    if (newPassword !== confirmNewPassword) {
        showNotification('Passwords do not match', 'error');
        return;
    }
    
    const otpBtn = e.target.querySelector('button[type="submit"]');
    setLoading(otpBtn, true);
    
    try {
        const response = await fetch('/api/verify-otp', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, otp, new_password: newPassword }),
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Password reset successful! Please login.', 'success');
            showLogin();
            // Clear forms
            document.getElementById('forgotForm').reset();
            document.getElementById('otpForm').reset();
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        showNotification('OTP verification failed. Please try again.', 'error');
    } finally {
        setLoading(otpBtn, false);
    }
}

async function logout() {
    try {
        const response = await fetch('/api/logout', {
            method: 'POST',
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentUser = null;
            transactions = [];
            budgets = [];
            showAuthContainer();
            showNotification('Logged out successfully!', 'success');
        }
    } catch (error) {
        showNotification('Logout failed. Please try again.', 'error');
    }
}

// Google Sign-In
function googleSignIn() {
    window.location.href = '/google-login';
}

// Check authentication status
async function checkAuthStatus() {
    try {
        const response = await fetch('/api/summary', {
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.income !== undefined) {
                showMainApp();
                loadUserData();
                return;
            }
        }
        showAuthContainer();
    } catch (error) {
        showAuthContainer();
    }
}

// Show/Hide main app and auth container
function showMainApp() {
    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';
    
    // Update user name if available
    if (sessionStorage.getItem('user_name')) {
        document.getElementById('user-name').textContent = sessionStorage.getItem('user_name');
    }
}

function showAuthContainer() {
    document.getElementById('auth-container').style.display = 'flex';
    document.getElementById('main-app').style.display = 'none';
    showLogin();
}

// Load user data
async function loadUserData() {
    try {
        await Promise.all([
            loadTransactions(),
            loadBudgets(),
            updateSummary(),
            loadReports()
        ]);
    } catch (error) {
        showNotification('Failed to load user data', 'error');
    }
}

// Transaction handlers
async function handleAddTransaction(e) {
    e.preventDefault();
    
    const type = document.getElementById('transaction-type').value;
    const amount = document.getElementById('transaction-amount').value;
    const category = document.getElementById('transaction-category').value;
    const description = document.getElementById('transaction-description').value;
    const date = document.getElementById('transaction-date').value;
    
    if (!type || !amount || !category || !description || !date) {
        showNotification('Please fill in all fields', 'error');
        return;
    }
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    setLoading(submitBtn, true);
    
    try {
        const response = await fetch('/api/transactions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                type,
                amount: parseFloat(amount),
                category,
                description,
                date
            }),
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification('Transaction added successfully!', 'success');
            document.getElementById('transaction-form').reset();
            document.getElementById('transaction-date').value = new Date().toISOString().split('T')[0];
            await loadTransactions();
            await updateSummary();
            await loadReports();
        } else {
            showNotification(data.message || 'Failed to add transaction', 'error');
        }
    } catch (error) {
        showNotification('Failed to add transaction', 'error');
    } finally {
        setLoading(submitBtn, false);
    }
}

async function loadTransactions() {
    try {
        const response = await fetch('/api/transactions', {
            credentials: 'include'
        });
        
        if (response.ok) {
            transactions = await response.json();
            displayTransactions();
        }
    } catch (error) {
        showNotification('Failed to load transactions', 'error');
    }
}

function displayTransactions() {
    const container = document.getElementById('transactions-list');
    if (!container) return;
    
    if (transactions.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 2rem; color: #666;">No transactions yet. Add your first transaction above!</p>';
        return;
    }
    
    // Sort transactions by date (newest first)
    const sortedTransactions = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    container.innerHTML = sortedTransactions.map(transaction => `
        <div class="transaction-item">
            <div class="item-details">
                <h4>${transaction.description}</h4>
                <p>Category: ${transaction.category}</p>
                <p>Date: ${formatDate(transaction.date)}</p>
            </div>
            <div class="item-amount">
                <div class="amount ${transaction.type}">
                    ${transaction.type === 'income' ? '+' : '-'}$${transaction.amount.toFixed(2)}
                </div>
                <div class="item-actions">
                    <button class="delete-btn" onclick="deleteTransaction(${transaction.id})">Delete</button>
                </div>
            </div>
        </div>
    `).join('');
}

async function deleteTransaction(id) {
    if (!confirm('Are you sure you want to delete this transaction?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/transactions/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        if (response.ok) {
            showNotification('Transaction deleted successfully!', 'success');
            await loadTransactions();
            await updateSummary();
            await loadReports();
        } else {
            showNotification('Failed to delete transaction', 'error');
        }
    } catch (error) {
        showNotification('Failed to delete transaction', 'error');
    }
}

// Budget handlers
async function handleAddBudget(e) {
    e.preventDefault();
    
    const category = document.getElementById('budget-category').value;
    const limit = document.getElementById('budget-limit').value;
    const month = document.getElementById('budget-month').value;
    
    if (!category || !limit || !month) {
        showNotification('Please fill in all fields', 'error');
        return;
    }
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    setLoading(submitBtn, true);
    
    try {
        const response = await fetch('/api/budgets', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                category,
                limit: parseFloat(limit),
                month
            }),
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification('Budget created successfully!', 'success');
            document.getElementById('budget-form').reset();
            document.getElementById('budget-month').value = new Date().toISOString().slice(0, 7);
            await loadBudgets();
        } else {
            showNotification(data.message || 'Failed to create budget', 'error');
        }
    } catch (error) {
        showNotification('Failed to create budget', 'error');
    } finally {
        setLoading(submitBtn, false);
    }
}

async function loadBudgets() {
    try {
        const response = await fetch('/api/budgets', {
            credentials: 'include'
        });
        
        if (response.ok) {
            budgets = await response.json();
            displayBudgets();
        }
    } catch (error) {
        showNotification('Failed to load budgets', 'error');
    }
}

function displayBudgets() {
    const container = document.getElementById('budgets-list');
    if (!container) return;
    
    if (budgets.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 2rem; color: #666;">No budgets created yet. Create your first budget above!</p>';
        return;
    }
    
    container.innerHTML = budgets.map(budget => {
        const spent = calculateSpentAmount(budget.category, budget.month);
        const percentage = budget.limit > 0 ? (spent / budget.limit) * 100 : 0;
        const isOverBudget = percentage > 100;
        
        return `
            <div class="budget-item">
                <div class="item-details">
                    <h4>${budget.category.charAt(0).toUpperCase() + budget.category.slice(1)} Budget</h4>
                    <p>Month: ${formatMonth(budget.month)}</p>
                    <p>Limit: $${budget.limit.toFixed(2)}</p>
                    <div class="budget-progress">
                        <div class="progress-bar">
                            <div class="progress-fill ${isOverBudget ? 'over-budget' : ''}" 
                                 style="width: ${Math.min(percentage, 100)}%"></div>
                        </div>
                        <p class="progress-text">
                            Spent: $${spent.toFixed(2)} / $${budget.limit.toFixed(2)} 
                            (${percentage.toFixed(1)}%)
                        </p>
                    </div>
                </div>
                <div class="item-actions">
                    <button class="delete-btn" onclick="deleteBudget(${budget.id})">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

function calculateSpentAmount(category, month) {
    return transactions
        .filter(t => t.type === 'expense' && 
                    t.category === category && 
                    t.date.startsWith(month))
        .reduce((sum, t) => sum + t.amount, 0);
}

async function deleteBudget(id) {
    if (!confirm('Are you sure you want to delete this budget?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/budgets/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        if (response.ok) {
            showNotification('Budget deleted successfully!', 'success');
            await loadBudgets();
        } else {
            showNotification('Failed to delete budget', 'error');
        }
    } catch (error) {
        showNotification('Failed to delete budget', 'error');
    }
}

// Summary and statistics
async function updateSummary() {
    try {
        const response = await fetch('/api/summary', {
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            
            document.getElementById('total-income').textContent = `$${data.income.toFixed(2)}`;
            document.getElementById('total-expenses').textContent = `$${data.expenses.toFixed(2)}`;
            document.getElementById('balance').textContent = `$${data.balance.toFixed(2)}`;
            
            // Update balance color based on positive/negative
            const balanceElement = document.getElementById('balance');
            if (data.balance >= 0) {
                balanceElement.style.color = '#28a745';
            } else {
                balanceElement.style.color = '#dc3545';
            }
        }
    } catch (error) {
        showNotification('Failed to update summary', 'error');
    }
}

// Financial reports and charts
async function loadReports() {
    try {
        const response = await fetch('/api/reports', {
            credentials: 'include'
        });
        
        if (response.ok) {
            const reportData = await response.json();
            renderCharts(reportData);
        }
    } catch (error) {
        console.error('Failed to load reports:', error);
    }
}

function renderCharts(reportData) {
    // Income vs Expense Chart
    const incomeExpenseChart = new Chart(
        document.getElementById('income-expense-chart'), 
        {
            type: 'doughnut',
            data: {
                labels: ['Income', 'Expenses'],
                datasets: [{
                    data: [reportData.income, reportData.expenses],
                    backgroundColor: ['#28a745', '#dc3545'],
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.label}: $${context.raw.toFixed(2)}`;
                            }
                        }
                    }
                }
            }
        }
    );
    
    // Category Spending Chart
    const categories = Object.keys(reportData.categories);
    const categorySpending = categories.map(cat => reportData.categories[cat]);
    
    const categoryChart = new Chart(
        document.getElementById('category-chart'), 
        {
            type: 'bar',
            data: {
                labels: categories,
                datasets: [{
                    label: 'Amount Spent',
                    data: categorySpending,
                    backgroundColor: '#667eea',
                    borderColor: '#764ba2',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `$${context.raw.toFixed(2)}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '$' + value;
                            }
                        }
                    }
                }
            }
        }
    );
    
    // Monthly Trend Chart
    const months = Object.keys(reportData.monthly_trend);
    const incomeData = months.map(month => reportData.monthly_trend[month].income);
    const expensesData = months.map(month => reportData.monthly_trend[month].expenses);
    
    const trendChart = new Chart(
        document.getElementById('trend-chart'), 
        {
            type: 'line',
            data: {
                labels: months,
                datasets: [
                    {
                        label: 'Income',
                        data: incomeData,
                        borderColor: '#28a745',
                        backgroundColor: 'rgba(40, 167, 69, 0.1)',
                        fill: true,
                        tension: 0.3
                    },
                    {
                        label: 'Expenses',
                        data: expensesData,
                        borderColor: '#dc3545',
                        backgroundColor: 'rgba(220, 53, 69, 0.1)',
                        fill: true,
                        tension: 0.3
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: $${context.raw.toFixed(2)}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '$' + value;
                            }
                        }
                    }
                }
            }
        }
    );
}

// AI Advice
async function getAdvice() {
    const query = document.getElementById('advice-query').value.trim();
    
    if (!query) {
        showNotification('Please enter a question', 'error');
        return;
    }
    
    const button = document.querySelector('#advice button');
    setLoading(button, true);
    
    try {
        const response = await fetch('/api/financial-advice', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query }),
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (data.success) {
            displayAdvice(data.advice);
        } else {
            showNotification(data.message || 'Failed to get advice', 'error');
        }
    } catch (error) {
        showNotification('Failed to get advice', 'error');
    } finally {
        setLoading(button, false);
    }
}

function displayAdvice(advice) {
    const container = document.getElementById('advice-response');
    container.innerHTML = `
        <h4>💡 Financial Advice</h4>
        <p>${advice}</p>
    `;
    container.classList.add('show');
}

// Tab management
function showTab(tabName) {
    // Hide all tab contents
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => {
        content.classList.remove('active');
    });
    
    // Remove active class from all tab buttons
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(button => {
        button.classList.remove('active');
    });
    
    // Show selected tab content
    const selectedTab = document.getElementById(tabName);
    if (selectedTab) {
        selectedTab.classList.add('active');
    }
    
    // Add active class to clicked button
    const activeButton = document.querySelector(`[onclick="showTab('${tabName}')"]`);
    if (activeButton) {
        activeButton.classList.add('active');
    }
    
    // Load reports when switching to that tab
    if (tabName === 'reports') {
        loadReports();
    }
}

// Utility functions
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function formatMonth(monthString) {
    const [year, month] = monthString.split('-');
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long'
    });
}

function setLoading(button, isLoading) {
    if (isLoading) {
        button.classList.add('loading');
        button.disabled = true;
    } else {
        button.classList.remove('loading');
        button.disabled = false;
    }
}

// Notification system
function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
    if (!container) return;
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    container.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 5000);
}

// Initialize notification container if it doesn't exist
if (!document.getElementById('notification-container')) {
    const container = document.createElement('div');
    container.id = 'notification-container';
    document.body.appendChild(container);
}

// Store user name in session storage
if (document.getElementById('user-name').textContent !== 'User') {
    sessionStorage.setItem('user_name', document.getElementById('user-name').textContent);
}ss


