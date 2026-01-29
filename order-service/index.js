const express = require('express');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = 3000;
const INVENTORY_SERVICE_URL = process.env.INVENTORY_SERVICE_URL || 'http://inventory-service:3001';

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'password',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

const dbName = process.env.DB_NAME || 'order_db';

let pool;

async function initDB() {
    try {
        console.log('Connecting to database server...');
        const connection = await mysql.createConnection({
            host: dbConfig.host,
            user: dbConfig.user,
            password: dbConfig.password
        });

        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
        await connection.end();

        console.log(`Database ${dbName} ensured.`);

        pool = mysql.createPool({ ...dbConfig, database: dbName });
        const poolConn = await pool.getConnection();
        console.log('Database connected!');

        await poolConn.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id INT AUTO_INCREMENT PRIMARY KEY,
                product_id VARCHAR(255) NOT NULL,
                quantity INT NOT NULL,
                status VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        poolConn.release();
    } catch (err) {
        console.error('Failed to connect to database:', err.message);
        setTimeout(initDB, 5000);
    }
}

initDB();

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
                if (pool) {
                    await pool.query('INSERT INTO orders (product_id, quantity, status) VALUES (?, ?, ?)', [productId, quantity, 'PROCESSED']);
                }
                res.json({ success: true, message: 'Order created successfully', orderId: 'generated-id' }); // Simplified ID logic
            } else {
                res.status(400).json({ success: false, message: 'Order failed: ' + inventoryResponse.data.message });
            }
        } catch (apiError) {
            console.error('Inventory service error:', apiError.message);
            // If inventory service is down or returns error
            const errorMessage = apiError.response?.data?.message || 'Inventory service unavailable';

            // Save as FAILED if possible
            if (pool) {
                await pool.query('INSERT INTO orders (product_id, quantity, status) VALUES (?, ?, ?)', [productId, quantity, 'FAILED']);
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
        if (!pool) return res.status(503).json({ error: 'Database not ready' });
        const [rows] = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Order Service running on port ${PORT}`);
});
