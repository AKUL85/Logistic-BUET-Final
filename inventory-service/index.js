const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const db = require('./db');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = 3001;

async function startDB() {
    const success = await db.init();
    if (!success) {
        setTimeout(startDB, 5000);
    }
}
startDB();

app.post('/inventory/reserve', async (req, res) => {
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
