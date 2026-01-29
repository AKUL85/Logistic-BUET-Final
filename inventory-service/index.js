const express = require('express');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = 3001;

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'password',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

const dbName = process.env.DB_NAME || 'inventory_db';

let pool;

async function initDB() {
    try {
        // Wait for DB to be ready
        console.log('Connecting to database server...');
        // Create connection to Create DB
        const connection = await mysql.createConnection({
            host: dbConfig.host,
            user: dbConfig.user,
            password: dbConfig.password
        });

        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
        await connection.end();

        console.log(`Database ${dbName} ensured.`);

        // Create pool with database
        pool = mysql.createPool({ ...dbConfig, database: dbName });

        // Check connection
        const poolConn = await pool.getConnection();
        console.log('Database connected!');

        // Create table if not exists
        await poolConn.query(`
            CREATE TABLE IF NOT EXISTS inventory (
                id INT AUTO_INCREMENT PRIMARY KEY,
                product_id VARCHAR(255) NOT NULL UNIQUE,
                quantity INT NOT NULL DEFAULT 0
            )
        `);

        // Seed initial data if empty
        const [rows] = await poolConn.query('SELECT count(*) as count FROM inventory');
        if (rows[0].count === 0) {
            console.log('Seeding initial inventory...');
            await poolConn.query('INSERT INTO inventory (product_id, quantity) VALUES ?', [
                [['apple', 100], ['banana', 50], ['orange', 75]]
            ]);
        }

        poolConn.release();
    } catch (err) {
        console.error('Failed to connect to database:', err.message);
        // Retry logic could go here, but for now we rely on Docker restart policy or manual restart
        setTimeout(initDB, 5000);
    }
}

initDB();

app.post('/inventory/reserve', async (req, res) => {
    const { productId, quantity } = req.body;

    if (!productId || !quantity) {
        return res.status(400).json({ error: 'Missing productId or quantity' });
    }

    try {
        if (!pool) {
            return res.status(503).json({ error: 'Database not ready' });
        }

        const [rows] = await pool.query('SELECT quantity FROM inventory WHERE product_id = ?', [productId]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const currentQuantity = rows[0].quantity;

        if (currentQuantity >= quantity) {
            await pool.query('UPDATE inventory SET quantity = quantity - ? WHERE product_id = ?', [quantity, productId]);
            console.log(`Reserved ${quantity} of ${productId}. New stock: ${currentQuantity - quantity}`);
            res.json({ success: true, message: 'Stock reserved' });
        } else {
            console.log(`Failed to reserve ${quantity} of ${productId}. Current stock: ${currentQuantity}`);
            res.status(400).json({ success: false, message: 'Insufficient stock' });
        }
    } catch (err) {
        console.error('Error reserving inventory:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/inventory', async (req, res) => {
    try {
        if (!pool) return res.status(503).json({ error: 'Database not ready' });
        const [rows] = await pool.query('SELECT * FROM inventory');
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
        if (!pool) return res.status(503).json({ error: 'Database not ready' });

        // Check if exists
        const [rows] = await pool.query('SELECT * FROM inventory WHERE product_id = ?', [productId]);
        if (rows.length > 0) {
            return res.status(409).json({ error: 'Product already exists. Use /inventory/reserve to update stock (negative/positive logic not implemented in reserve yet) or add update endpoint.' });
        }

        await pool.query('INSERT INTO inventory (product_id, quantity) VALUES (?, ?)', [productId, quantity]);
        res.status(201).json({ success: true, message: 'Product added', productId, quantity });
    } catch (err) {
        console.error('Error adding inventory:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(PORT, () => {
    console.log(`Inventory Service running on port ${PORT}`);
});
