const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const axios = require("axios");
const db = require("./db");
const { v4: uuidv4 } = require("uuid");

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

async function reserveWithRetry(
  productId,
  quantity,
  idempotencyKey,
  attempt = 1,
) {
  const maxRetries = 10;
  const timeout = 3000; // 3 seconds timeout per request

  try {
    const response = await axios.post(
      `${INVENTORY_SERVICE_URL}/inventory/reserve`,
      {
        productId,
        quantity,
        idempotencyKey,
      },
      {
        timeout: timeout,
        params: {
          simulate_crash:
            process.env.SIMULATE_CRASH === "true" && attempt === 1,
        }, // Crash only on first attempt if flag set
      },
    );
    return response;
  } catch (error) {
    const status = error.response?.status;

    // Stop retrying on "Logical" failures
    if (status === 409 || status === 404 || status === 400 || status === 200) {
      throw error;
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

    throw error;
  }
}

app.post("/orders", async (req, res) => {
  const { productId, quantity } = req.body;

  if (!productId || !quantity) {
    return res.status(400).json({ error: "Missing productId or quantity" });
  }

  const idempotencyKey = uuidv4(); // Generate Unique ID per order
  const orderId = uuidv4(); // Unique Order ID (though DB ID is auto-inc, this is logical ID)

  try {
    console.log(
      `Processing order for ${quantity} of ${productId}. Key: ${idempotencyKey}`,
    );

    try {
      // 1. Call Inventory Service with Retry Algorithm
      const inventoryResponse = await reserveWithRetry(
        productId,
        quantity,
        idempotencyKey,
      );

      if (inventoryResponse.data.success) {
        // 2. Save Order as PROCESSED
        await db.query(
          "INSERT INTO orders (product_id, quantity, status) VALUES (?, ?, ?)",
          [productId, quantity, "PROCESSED"],
        );
        res.json({
          success: true,
          message: "Order created successfully",
          orderId,
          idempotencyKey,
        });
      } else {
        res
          .status(400)
          .json({
            success: false,
            message: "Order failed: " + inventoryResponse.data.message,
          });
      }
    } catch (apiError) {
      console.error("Inventory service error:", apiError.message);
      const errorMessage =
        apiError.response?.data?.message || "Inventory service unavailable";
      const status = apiError.response?.status || 503;

      // If 409, it's just out of stock, not a system failure
      if (status === 409) {
        return res
          .status(409)
          .json({ success: false, message: "Out of Stock" });
      }

      // Save as FAILED
      try {
        await db.query(
          "INSERT INTO orders (product_id, quantity, status) VALUES (?, ?, ?)",
          [productId, quantity, "FAILED"],
        );
      } catch (dbErr) {
        console.error("Failed to log failed order:", dbErr.message);
      }

      res
        .status(status)
        .json({ success: false, message: "Order failed: " + errorMessage });
    }
  } catch (err) {
    console.error("Internal error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/orders", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM orders ORDER BY created_at DESC",
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`Order Service running on port ${PORT}`);
  });
}

module.exports = app;
