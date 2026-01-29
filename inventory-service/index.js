const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const db = require('./db');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = 3001;

// Gremlin Latency: Counter for deterministic delay pattern
let requestCounter = 0;

// Initialize DB with retry logic
async function startDB() {
    const success = await db.init();
    if (!success) {
        setTimeout(startDB, 5000);
    }
}
startDB();

app.post('/inventory/reserve', async (req, res) => {
    // Gremlin Latency: Introduce delay on every 3rd request (deterministic pattern)
    requestCounter++;
    const shouldDelay = requestCounter % 3 === 0;
    
    if (shouldDelay) {
        const delayMs = 6000; // 6 second delay to simulate network issues
        console.log(`[GREMLIN LATENCY] Request #${requestCounter}: Delaying response by ${delayMs}ms`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
    } else {
        console.log(`[GREMLIN LATENCY] Request #${requestCounter}: Normal response`);
    }
    
    const { productId, quantity } = req.body;

    if (!productId || !quantity) {
        return res.status(400).json({ error: 'Missing productId or quantity' });
    }

    try {
        const [rows] = await db.query('SELECT quantity FROM inventory WHERE product_id = ?', [productId]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const currentQuantity = rows[0].quantity;

        if (currentQuantity >= quantity) {
            await db.query('UPDATE inventory SET quantity = quantity - ? WHERE product_id = ?', [quantity, productId]);
            console.log(`Reserved ${quantity} of ${productId}. New stock: ${currentQuantity - quantity}`);
            res.json({ success: true, message: 'Stock reserved' });
        } else {
            console.log(`Failed to reserve ${quantity} of ${productId}. Current stock: ${currentQuantity}`);
            res.status(400).json({ success: false, message: 'Insufficient stock' });
        }
    } catch (err) {
        console.error('Error reserving inventory:', err.message);
        res.status(500).json({ error: err.message === 'Database not ready' ? 'Service Unavailable' : 'Internal server error' });
    }
});

app.get('/inventory', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM inventory');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/inventory', async (req, res) => {
    const { productId, quantity } = req.body;

    if (!productId || quantity === undefined) {
        return res.status(400).json({ error: 'Missing productId or quantity' });
    }

    try {
        // Check if exists
        const [rows] = await db.query('SELECT * FROM inventory WHERE product_id = ?', [productId]);
        if (rows.length > 0) {
            return res.status(409).json({ error: 'Product already exists. Use /inventory/reserve to update stock.' });
        }

        await db.query('INSERT INTO inventory (product_id, quantity) VALUES (?, ?)', [productId, quantity]);
        res.status(201).json({ success: true, message: 'Product added', productId, quantity });
    } catch (err) {
        console.error('Error adding inventory:', err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Inventory Service running on port ${PORT}`);
});
