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
const INVENTORY_TIMEOUT_MS = parseInt(process.env.INVENTORY_TIMEOUT_MS || '5000', 10); // 5 second timeout

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

        // 1. Call Inventory Service with timeout
        try {
            const inventoryResponse = await axios.post(`${INVENTORY_SERVICE_URL}/inventory/reserve`, {
                productId,
                quantity
            }, {
                timeout: INVENTORY_TIMEOUT_MS
            });

            if (inventoryResponse.data.success) {
                await db.query('INSERT INTO orders (product_id, quantity, status) VALUES (?, ?, ?)', [productId, quantity, 'PROCESSED']);
                res.json({ success: true, message: 'Order created successfully', orderId: 'generated-id' });
            } else {
                res.status(400).json({ success: false, message: 'Order failed: ' + inventoryResponse.data.message });
            }
        } catch (apiError) {
            console.error('Inventory service error:', apiError.message);
            
            let errorMessage;
            let statusCode = 503;
            
            if (apiError.code === 'ECONNABORTED' || apiError.message.includes('timeout')) {
                errorMessage = `High Demand. Inventory service timed out after ${INVENTORY_TIMEOUT_MS}ms. Please try again later.`;
                console.warn(`[TIMEOUT] Inventory service did not respond within ${INVENTORY_TIMEOUT_MS}ms`);
            } else if (apiError.response?.data?.message) {
                errorMessage = apiError.response.data.message;
                statusCode = apiError.response.status || 503;
            } else {
                errorMessage = 'Inventory service unavailable';
            }

            try {
                await db.query('INSERT INTO orders (product_id, quantity, status) VALUES (?, ?, ?)', [productId, quantity, 'FAILED']);
            } catch (dbErr) {
                console.error('Failed to log failed order:', dbErr.message);
            }

            res.status(statusCode).json({ success: false, message: 'Order failed: ' + errorMessage });
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
