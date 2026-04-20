// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => {
            console.log('SW registration failed: ', err);
        });
    });
}

// DOM Elements
const balanceEl = document.getElementById('total-balance');
const incomeEl = document.getElementById('total-income');
const expenseEl = document.getElementById('total-expense');
const savingsEl = document.getElementById('total-savings');
const transactionListEl = document.getElementById('transaction-list');
const btnAddTransaction = document.getElementById('btn-add-transaction');
const transactionModal = document.getElementById('transaction-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const transactionForm = document.getElementById('transaction-form');

// Auth DOM
const authOverlay = document.getElementById('auth-overlay');
const appContent = document.getElementById('app-content');
const loginFormContainer = document.getElementById('login-form-container');
const registerFormContainer = document.getElementById('register-form-container');
const showRegister = document.getElementById('show-register');
const showLogin = document.getElementById('show-login');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const btnLogout = document.getElementById('btn-logout');
const userGreeting = document.getElementById('user-greeting');
const btnExportCsv = document.getElementById('btn-export-csv');

// Theme & Filter & Budget DOM
const btnThemeToggle = document.getElementById('btn-theme-toggle');
const themeIconDark = document.getElementById('theme-icon-dark');
const themeIconLight = document.getElementById('theme-icon-light');
const themeText = document.getElementById('theme-text');
const monthFilter = document.getElementById('month-filter');
const btnSetBudget = document.getElementById('btn-set-budget');
const budgetSpentText = document.getElementById('budget-spent-text');
const budgetTotalText = document.getElementById('budget-total-text');
const budgetProgressFill = document.getElementById('budget-progress-fill');

// Backend API URL
const API_URL = 'http://localhost:3000/api';

// State
let transactions = [];
let expenseChartInstance = null;
let currentBudget = 0;

// Set default month filter to current month
const now = new Date();
monthFilter.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

// Theme Logic
let isLightMode = localStorage.getItem('nexus_theme') === 'light';
function applyTheme() {
    if (isLightMode) {
        document.body.classList.add('light-mode');
        themeIconLight.style.display = 'none';
        themeIconDark.style.display = 'block';
        themeText.textContent = 'Dark Mode';
    } else {
        document.body.classList.remove('light-mode');
        themeIconLight.style.display = 'block';
        themeIconDark.style.display = 'none';
        themeText.textContent = 'Light Mode';
    }
    // Update chart colors if it exists
    if (expenseChartInstance) updateChart();
}
applyTheme();

btnThemeToggle.addEventListener('click', (e) => {
    e.preventDefault();
    isLightMode = !isLightMode;
    localStorage.setItem('nexus_theme', isLightMode ? 'light' : 'dark');
    applyTheme();
});

// Helper: Get Auth Headers
function getAuthHeaders() {
    const token = localStorage.getItem('nexus_token');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

// Check Auth State
function checkAuth() {
    const token = localStorage.getItem('nexus_token');
    const username = localStorage.getItem('nexus_username');
    
    if (token && username) {
        authOverlay.classList.remove('active');
        appContent.style.display = 'flex';
        userGreeting.textContent = username;
        initApp();
    } else {
        authOverlay.classList.add('active');
        appContent.style.display = 'none';
    }
}

// Logout
btnLogout.addEventListener('click', () => {
    localStorage.removeItem('nexus_token');
    localStorage.removeItem('nexus_username');
    transactions = [];
    checkAuth();
});

// Auth Toggle Forms
showRegister.addEventListener('click', (e) => {
    e.preventDefault();
    loginFormContainer.style.display = 'none';
    registerFormContainer.style.display = 'block';
});

showLogin.addEventListener('click', (e) => {
    e.preventDefault();
    registerFormContainer.style.display = 'none';
    loginFormContainer.style.display = 'block';
});

// Login Submit
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    try {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        
        if (res.ok) {
            localStorage.setItem('nexus_token', data.token);
            localStorage.setItem('nexus_username', data.username);
            checkAuth();
        } else {
            alert(data.error);
        }
    } catch (err) {
        alert('Failed to connect to backend.');
    }
});

// Register Submit
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('reg-username').value;
    const password = document.getElementById('reg-password').value;

    try {
        const res = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        
        if (res.ok) {
            alert('Registration successful! Please login.');
            showLogin.click();
        } else {
            alert(data.error);
        }
    } catch (err) {
        alert('Failed to connect to backend.');
    }
});

// Fetch Budget
async function fetchBudget() {
    try {
        const response = await fetch(`${API_URL}/budget`, { headers: getAuthHeaders() });
        if (response.ok) {
            const data = await response.json();
            currentBudget = data.amount;
        }
    } catch (error) {
        console.error('Error fetching budget', error);
    }
}

// Fetch Transactions
async function fetchTransactions() {
    try {
        const response = await fetch(`${API_URL}/transactions`, {
            headers: getAuthHeaders()
        });
        if (response.status === 401 || response.status === 403) {
            btnLogout.click();
            return;
        }
        transactions = await response.json();
        refreshUI();
    } catch (error) {
        console.error('Error fetching transactions:', error);
        transactionListEl.innerHTML = '<div class="empty-state" style="color: var(--color-expense);">Error loading data. Is the backend running?</div>';
    }
}

// Get filtered transactions based on selected month
function getFilteredTransactions() {
    const selectedMonthStr = monthFilter.value; // "YYYY-MM"
    if (!selectedMonthStr) return transactions;
    
    return transactions.filter(t => {
        const tDate = new Date(t.date);
        const tMonthStr = `${tDate.getFullYear()}-${String(tDate.getMonth() + 1).padStart(2, '0')}`;
        return tMonthStr === selectedMonthStr;
    });
}

// Refresh all UI elements based on filtered data
function refreshUI() {
    updateDashboard();
    renderTransactions();
    updateChart();
    updateBudgetProgress();
}

monthFilter.addEventListener('change', refreshUI);

// Utility: Format currency (IDR)
function formatCurrency(amount) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

// Utility: Format Date
function formatDate(dateString) {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('en-US', options);
}

// Update Budget UI
function updateBudgetProgress() {
    const filtered = getFilteredTransactions();
    let spent = 0;
    filtered.forEach(t => {
        if (t.type === 'expense') spent += t.amount;
    });

    budgetSpentText.textContent = `${formatCurrency(spent)} spent`;
    budgetTotalText.textContent = `of ${formatCurrency(currentBudget)} limit`;

    let percentage = 0;
    if (currentBudget > 0) {
        percentage = (spent / currentBudget) * 100;
        if (percentage > 100) percentage = 100;
    }

    budgetProgressFill.style.width = `${percentage}%`;
    
    if (percentage < 50) {
        budgetProgressFill.style.backgroundColor = 'var(--color-income)';
    } else if (percentage < 85) {
        budgetProgressFill.style.backgroundColor = '#F59E0B'; // Warning yellow
    } else {
        budgetProgressFill.style.backgroundColor = 'var(--color-expense)'; // Danger red
    }
}

// Set Budget
btnSetBudget.addEventListener('click', async () => {
    const input = prompt('Enter your monthly budget limit (Rp):', currentBudget || '');
    if (input === null) return;
    const amount = Number(input.replace(/[^0-9]/g, ''));
    
    try {
        const res = await fetch(`${API_URL}/budget`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ amount })
        });
        if (res.ok) {
            currentBudget = amount;
            updateBudgetProgress();
        }
    } catch (e) {
        alert('Failed to update budget.');
    }
});

// Update Dashboard Summaries
function updateDashboard() {
    const filtered = getFilteredTransactions();
    let totalIncome = 0;
    let totalExpense = 0;
    let totalSavings = 0;

    filtered.forEach(transaction => {
        if (transaction.type === 'income') totalIncome += transaction.amount;
        else if (transaction.type === 'expense') totalExpense += transaction.amount;
        else if (transaction.type === 'saving') totalSavings += transaction.amount;
    });

    const totalBalance = totalIncome - totalExpense - totalSavings;

    balanceEl.textContent = formatCurrency(totalBalance);
    incomeEl.textContent = formatCurrency(totalIncome);
    expenseEl.textContent = formatCurrency(totalExpense);
    savingsEl.textContent = formatCurrency(totalSavings);
}

// Render Chart
function updateChart() {
    const ctx = document.getElementById('expenseChart').getContext('2d');
    const filtered = getFilteredTransactions();
    
    // Group expenses by category
    const expenseData = {};
    filtered.forEach(t => {
        if (t.type === 'expense') {
            expenseData[t.category] = (expenseData[t.category] || 0) + t.amount;
        }
    });

    const labels = Object.keys(expenseData);
    const data = Object.values(expenseData);

    if (expenseChartInstance) {
        expenseChartInstance.destroy();
    }

    const emptyColor = isLightMode ? '#E2E8F0' : '#1A1F2E';
    const textColor = isLightMode ? '#475569' : '#94A3B8';

    if (data.length === 0) {
        expenseChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: ['No Expenses'], datasets: [{ data: [1], backgroundColor: [emptyColor], borderWidth: 0 }] },
            options: { cutout: '75%', plugins: { legend: { display: false } } }
        });
        return;
    }

    expenseChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    '#F43F5E', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4'
                ],
                borderWidth: isLightMode ? 2 : 0,
                borderColor: isLightMode ? '#FFFFFF' : 'transparent',
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            cutout: '75%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: textColor, padding: 20, font: { family: 'Outfit' } }
                }
            }
        }
    });
}

// Render Transactions List
function renderTransactions() {
    transactionListEl.innerHTML = '';
    const filtered = getFilteredTransactions();

    if (filtered.length === 0) {
        transactionListEl.innerHTML = '<div class="empty-state">No transactions in this month.</div>';
        return;
    }

    const sortedTransactions = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date));

    sortedTransactions.forEach(transaction => {
        const item = document.createElement('div');
        item.classList.add('transaction-item');

        const isIncome = transaction.type === 'income';
        const isExpense = transaction.type === 'expense';
        
        let iconHtml = '';
        let sign = '';
        
        if (isIncome) {
            iconHtml = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>`;
            sign = '+';
        } else if (isExpense) {
            iconHtml = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>`;
            sign = '-';
        } else {
            iconHtml = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>`;
            sign = '+';
        }

        item.innerHTML = `
            <div class="t-info">
                <div class="t-icon ${transaction.type}">
                    ${iconHtml}
                </div>
                <div class="t-details">
                    <h4 style="color: var(--text-primary);">${transaction.description}</h4>
                    <p>${transaction.category} &bull; ${formatDate(transaction.date)}</p>
                </div>
            </div>
            <div class="t-amount ${transaction.type}">
                ${sign}${formatCurrency(transaction.amount)}
                <button class="btn-delete" onclick="deleteTransaction('${transaction.id}')" title="Delete">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
        `;
        transactionListEl.appendChild(item);
    });
}

// Add Transaction
async function addTransaction(e) {
    e.preventDefault();

    const type = document.getElementById('type').value;
    const category = document.getElementById('category').value;
    const amount = parseFloat(document.getElementById('amount').value);
    const description = document.getElementById('description').value;
    const date = document.getElementById('date').value;

    if (!amount || !description || !date) return;

    const transaction = { type, category, amount, description, date };

    try {
        const response = await fetch(`${API_URL}/transactions`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(transaction)
        });

        if (response.ok) {
            const newTransaction = await response.json();
            transactions.push(newTransaction);
            refreshUI();
            transactionForm.reset();
            closeModal();
        } else {
            alert('Failed to add transaction');
        }
    } catch (error) {
        alert('Failed to add transaction. Is the backend running?');
    }
}

// Delete Transaction
window.deleteTransaction = async function(id) {
    if(confirm('Are you sure you want to delete this transaction?')) {
        try {
            const response = await fetch(`${API_URL}/transactions/${id}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });

            if (response.ok) {
                transactions = transactions.filter(t => t.id !== id);
                refreshUI();
            } else {
                alert('Failed to delete transaction');
            }
        } catch (error) {
            alert('Failed to delete transaction. Is the backend running?');
        }
    }
}

// Export CSV
btnExportCsv.addEventListener('click', () => {
    const filtered = getFilteredTransactions();
    if (filtered.length === 0) return alert('No data to export for this month.');
    
    const headers = ['Date', 'Type', 'Category', 'Description', 'Amount'];
    const csvRows = [];
    csvRows.push(headers.join(','));

    filtered.forEach(t => {
        const row = [
            t.date,
            t.type,
            `"${t.category}"`,
            `"${t.description}"`,
            t.amount
        ];
        csvRows.push(row.join(','));
    });

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', `nexus_transactions_${monthFilter.value}.csv`);
    a.click();
});

// Modal Logic
function openModal() {
    transactionModal.classList.add('active');
    document.getElementById('date').valueAsDate = new Date();
}

function closeModal() {
    transactionModal.classList.remove('active');
}

// Event Listeners
btnAddTransaction.addEventListener('click', openModal);
btnCloseModal.addEventListener('click', closeModal);
transactionModal.addEventListener('click', (e) => {
    if (e.target === transactionModal) closeModal();
});
transactionForm.addEventListener('submit', addTransaction);

// Init App Data
async function initApp() {
    transactionListEl.innerHTML = '<div class="empty-state">Loading data from backend...</div>';
    await fetchBudget();
    await fetchTransactions();
}

// Initial Boot
checkAuth();
