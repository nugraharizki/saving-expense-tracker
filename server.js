const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const JWT_SECRET = 'nexus_super_secret_key_123';

// Middleware
app.use(cors());
app.use(express.json());

// Serve Static Frontend Files (For Glitch/Single Node Deployment)
app.use(express.static(__dirname));

// Helper: Read Database
function readDB() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            fs.writeFileSync(DATA_FILE, JSON.stringify({ users: [], transactions: [], budgets: [] }));
        }
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading DB:', error);
        return { users: [], transactions: [], budgets: [] };
    }
}

// Helper: Write Database
function writeDB(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error writing DB:', error);
    }
}

// Middleware: Authenticate Token
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token.' });
        req.user = user;
        next();
    });
}

// --- AUTH API ---

// Register
app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });

    const db = readDB();
    if (db.users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'Username already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
        id: Date.now().toString(),
        username,
        password: hashedPassword
    };

    db.users.push(newUser);
    writeDB(db);

    res.status(201).json({ message: 'User registered successfully.' });
});

// Login
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    const db = readDB();

    const user = db.users.find(u => u.username === username);
    if (!user) return res.status(400).json({ error: 'Invalid username or password.' });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ error: 'Invalid username or password.' });

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);
    res.json({ token, username: user.username });
});

// --- TRANSACTIONS API ---

// Get all transactions for logged in user
app.get('/api/transactions', authenticateToken, (req, res) => {
    const db = readDB();
    const userTransactions = db.transactions.filter(t => t.userId === req.user.id);
    res.json(userTransactions);
});

// Add a transaction
app.post('/api/transactions', authenticateToken, (req, res) => {
    const { type, category, amount, description, date } = req.body;
    
    if (!type || !amount || !description || !date || !category) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const newTransaction = {
        id: Date.now().toString(),
        userId: req.user.id,
        type,
        category,
        amount: Number(amount),
        description,
        date
    };

    const db = readDB();
    db.transactions.push(newTransaction);
    writeDB(db);

    res.status(201).json(newTransaction);
});

// Delete a transaction
app.delete('/api/transactions/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const db = readDB();
    
    const initialLength = db.transactions.length;
    db.transactions = db.transactions.filter(t => !(t.id === id && t.userId === req.user.id));
    
    if (db.transactions.length === initialLength) {
        return res.status(404).json({ error: 'Transaction not found or unauthorized' });
    }

    writeDB(db);
    res.json({ message: 'Transaction deleted successfully' });
});

// --- BUDGET API ---

// Get budget for logged in user
app.get('/api/budget', authenticateToken, (req, res) => {
    const db = readDB();
    if (!db.budgets) db.budgets = [];
    const userBudget = db.budgets.find(b => b.userId === req.user.id);
    res.json({ amount: userBudget ? userBudget.amount : 0 });
});

// Set budget
app.post('/api/budget', authenticateToken, (req, res) => {
    const { amount } = req.body;
    if (amount === undefined) return res.status(400).json({ error: 'Amount required' });

    const db = readDB();
    if (!db.budgets) db.budgets = [];

    const existingIndex = db.budgets.findIndex(b => b.userId === req.user.id);
    if (existingIndex >= 0) {
        db.budgets[existingIndex].amount = Number(amount);
    } else {
        db.budgets.push({ userId: req.user.id, amount: Number(amount) });
    }

    writeDB(db);
    res.status(200).json({ amount: Number(amount) });
});

// Start Server
app.listen(PORT, () => {
    console.log(`Backend server is running on http://localhost:${PORT}`);
});
