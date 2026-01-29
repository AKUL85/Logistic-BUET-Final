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

    if (!productId || !quantity || !idempotencyKey) {
        return res.status(400).json({ error: 'Missing productId, quantity, or idempotencyKey' });
    }

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const [existing] = await connection.query(
            'SELECT response_json FROM idempotency_log WHERE idempotency_key = ?',
            [idempotencyKey]
        );

        if (existing.length > 0) {
            await connection.rollback();
            connection.release();
            console.log(`[Idempotency] Returning cached response for key: ${idempotencyKey}`);
            return res.status(200).json(existing[0].response_json);
        }

        const [rows] = await connection.query(
            'SELECT quantity FROM inventory WHERE product_id = ? FOR UPDATE',
            [productId]
        );

        if (rows.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ error: 'Product not found' });
        }

        const currentQuantity = rows[0].quantity;

        if (currentQuantity >= quantity) {
            await connection.query(
                'UPDATE inventory SET quantity = quantity - ? WHERE product_id = ?',
                [quantity, productId]
            );

            const responsePayload = { success: true, message: 'Stock reserved', reserved: quantity };
            await connection.query(
                'INSERT INTO idempotency_log (idempotency_key, response_json) VALUES (?, ?)',
                [idempotencyKey, JSON.stringify(responsePayload)]
            );

            await connection.commit();
            console.log(`Reserved ${quantity} of ${productId}. Stock: ${currentQuantity - quantity}`);

            if (req.query.simulate_crash === 'true') {
                console.error("💥 SIMULATING CRASH AFTER COMMIT 💥");
                process.exit(1);
            }

            connection.release();
            res.json(responsePayload);

        } else {
            await connection.rollback();
            connection.release();
            console.log(`Insufficient stock for ${productId}. Req: ${quantity}, Avail: ${currentQuantity}`);
            res.status(409).json({ success: false, message: 'Insufficient stock' });
        }

    } catch (err) {
        console.error('Error reserving inventory:', err);
        if (connection) {
            try { await connection.rollback(); } catch (e) { }
            try { connection.release(); } catch (e) { }
        }
        res.status(500).json({ error: 'Internal server error' });
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

if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log(`Inventory Service running on port ${PORT}`);
    });
}

module.exports = app;
