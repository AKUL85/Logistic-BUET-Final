const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { initDB, getPool } = require("./database/connectDb");


const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = 3001;

async function startDB() {
  let success = false;

  while (!success) {
    success = await initDB();
    if (!success) {
      console.log("Retrying DB connection...");
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

if (process.env.NODE_ENV !== "test") {
  startDB();
}



// update quantity of a product
app.post('/inventory/reserve', async (req, res) => {
    const { productId, quantity } = req.body;

    if (!productId || !quantity) {
        return res.status(400).json({ error: 'Missing productId or quantity' });
    }

    try {
        const pool = getPool();
        const [rows] = await pool.query(
          "SELECT quantity FROM inventory WHERE product_id = ?",
          [productId],
        );

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
        console.error('Error reserving inventory:', err.message);
        res.status(500).json({ error: err.message === 'Database not ready' ? 'Service Unavailable' : 'Internal server error' });
    }
});

// List all inventory
app.get('/inventory', async (req, res) => {
    try {
        const pool = getPool();
        const [rows] = await pool.query('SELECT * FROM inventory');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// create new inventory
app.post('/inventory', async (req, res) => {
    const { productId, quantity } = req.body;

    if (!productId || quantity === undefined) {
        return res.status(400).json({ error: 'Missing productId or quantity' });
    }

    try {
        // Check if exists
        const pool = getPool();
        const [rows] = await pool.query('SELECT * FROM inventory WHERE product_id = ?', [productId]);
        if (rows.length > 0) {
            return res.status(409).json({ error: 'Product already exists. Use /inventory/reserve to update stock.' });
        }

        await pool.query('INSERT INTO inventory (product_id, quantity) VALUES (?, ?)', [productId, quantity]);
        res.status(201).json({ success: true, message: 'Product added', productId, quantity });
    } catch (err) {
        console.error('Error adding inventory:', err);
        res.status(500).json({ error: err.message });
    }
});

// delete a product from inventory
app.delete('/inventory/:productId', async (req, res) => {
    const { productId } = req.params;

    if (!productId) {
        return res.status(400).json({ error: 'Missing productId' });
    }

    try {
        // Check if product exists
        const pool = getPool();
        const [rows] = await pool.query(
            'SELECT * FROM inventory WHERE product_id = ?',
            [productId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        // Delete product
        await pool.query(
            'DELETE FROM inventory WHERE product_id = ?',
            [productId]
        );

        console.log(`Product ${productId} deleted from inventory`);
        res.json({ success: true, message: `Product ${productId} removed from inventory` });

    } catch (err) {
        console.error('Error deleting inventory:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});


if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`Inventory Service running on port ${PORT}`);
  });
}


module.exports = { app, startDB };