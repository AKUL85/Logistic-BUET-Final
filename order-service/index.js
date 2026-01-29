const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
const db = require('./db');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = 3000;
const INVENTORY_SERVICE_URL = process.env.INVENTORY_SERVICE_URL || 'http://inventory-service:3001';

async function startDB() {
    const success = await db.init();
    if (!success) {
        setTimeout(startDB, 5000);
    }
}
startDB();

app.post('/orders', async (req, res) => {
    const { productId, quantity } = req.body;

    if (!productId || !quantity) {
        return res.status(400).json({ error: 'Missing productId or quantity' });
    }

    try {
        console.log(`Processing order for ${quantity} of ${productId}`);

        // 1. Call Inventory Service
        try {
            const inventoryResponse = await axios.post(`${INVENTORY_SERVICE_URL}/inventory/reserve`, {
                productId,
                quantity
            });

            if (inventoryResponse.data.success) {
                // 2. Save Order as PROCESSED
                await db.query('INSERT INTO orders (product_id, quantity, status) VALUES (?, ?, ?)', [productId, quantity, 'PROCESSED']);
                res.json({ success: true, message: 'Order created successfully', orderId: 'generated-id' });
            } else {
                res.status(400).json({ success: false, message: 'Order failed: ' + inventoryResponse.data.message });
            }
        } catch (apiError) {
            console.error('Inventory service error:', apiError.message);
            const errorMessage = apiError.response?.data?.message || 'Inventory service unavailable';

            // Save as FAILED
            // Note: If DB is down, this will throw, which is fine (Internal Server Error)
            try {
                await db.query('INSERT INTO orders (product_id, quantity, status) VALUES (?, ?, ?)', [productId, quantity, 'FAILED']);
            } catch (dbErr) {
                console.error('Failed to log failed order:', dbErr.message);
            }

            res.status(503).json({ success: false, message: 'Order failed: ' + errorMessage });
        }

    } catch (err) {
        console.error('Internal error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/orders', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM orders ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Order Service running on port ${PORT}`);
});
