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
const INVENTORY_SERVICE_URL =
  process.env.INVENTORY_SERVICE_URL || "http://inventory-service:3001";
const PENDING_RETRY_DELAY_MS = parseInt(
  process.env.PENDING_RETRY_DELAY_MS || "10000",
  10,
);

async function startDB() {
  const success = await db.init();
  if (!success) {
    setTimeout(startDB, 5000);
    return;
  }

  try {
    await db.query("UPDATE orders SET status = ? WHERE status = ?", [
      "PENDING",
      "FAILED",
    ]);
  } catch (err) {
    console.error("Failed to migrate FAILED orders:", err.message);
  }

  startPendingWorker();
}
startDB();

// Track attempts for crash simulation
let callCounter = 0;
let pendingWorkerStarted = false;
let pendingWorkerRunning = false;

async function processPendingOrders() {
  if (pendingWorkerRunning) return;
  pendingWorkerRunning = true;

  try {
    const [pendingOrders] = await db.query(
      "SELECT id, product_id, quantity FROM orders WHERE status = ? ORDER BY created_at ASC",
      ["PENDING"],
    );

    for (const order of pendingOrders) {
      try {
        const idempotencyKey = uuidv4();
        const inventoryResponse = await reserveWithRetry(
          order.product_id,
          order.quantity,
          idempotencyKey,
        );

        if (inventoryResponse.data.success) {
          await db.query("UPDATE orders SET status = ? WHERE id = ?", [
            "PROCESSED",
            order.id,
          ]);
        }
      } catch (err) {
        const status = err.response?.status;
        if (status === 409) {
          await db.query("UPDATE orders SET status = ? WHERE id = ?", [
            "OUT_OF_STOCK",
            order.id,
          ]);
        }
        continue;
      }
    }
  } catch (err) {
    console.error("Failed to process pending orders:", err.message);
  } finally {
    pendingWorkerRunning = false;
  }
}

function startPendingWorker() {
  if (pendingWorkerStarted) return;
  pendingWorkerStarted = true;
  setInterval(processPendingOrders, PENDING_RETRY_DELAY_MS);
}

async function reserveWithRetry(
  productId,
  quantity,
  idempotencyKey,
  attempt = 1,
) {
  const maxRetries = 10;
  const timeout = 3000; // 3 seconds timeout per request
  
  // Only increment on the very first attempt of a new request call (or if logic allows)
  // But wait, reserveWithRetry is recursive.
  // We should probably track this outside validation.
  // Ideally, distinct "orders" should increment the counter.
  // If we increment here on attempt=1, it counts "Orders".
  
  if(attempt === 1) callCounter++;

  try {
    const shouldCrash = process.env.SIMULATE_CRASH === "true" && attempt === 1 && (callCounter % 4 === 0);
    
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
          simulate_crash: shouldCrash,
        }, // Crash only every 4th order, on first attempt
      },
    );
    return response;
  } catch (error) {
    const status = error.response?.status;

    // Stop retrying on "Logical" failures
    if (status === 409 || status === 404 || status === 400 || status === 200) {
      throw error;
    }

    // Retry on Network Errors or 5xx
    if (attempt <= maxRetries) {
      console.warn(
        `[Retry] Attempt ${attempt} failed. Retrying... (${error.message})`,
      );
      await new Promise((res) => setTimeout(res, 1000)); // Wait 1s
      return reserveWithRetry(productId, quantity, idempotencyKey, attempt + 1);
    }

    throw error;
  }
}

app.get('/health', async (req, res) => {
    const healthStatus = {
        status: 'UP',
        database: 'connected',
        inventoryService: 'connected'
    };

    let statusCode = 200;

    try {
        await db.query('SELECT 1');
    } catch (err) {
        healthStatus.database = 'disconnected';
        healthStatus.status = 'DOWN';
        healthStatus.error = err.message;
        statusCode = 500;
    }

    try {
        await axios.get(`${INVENTORY_SERVICE_URL}/health`, { timeout: 1000 });
    } catch (err) {
        healthStatus.inventoryService = 'disconnected';
        // If inventory is down, overall service is degraded/down depending on strictness.
        // Prompt says "verify downstream", implies we should report status.
        // We'll mark as DOWN if a dependency is critical.
        healthStatus.status = 'DOWN'; 
        healthStatus.inventoryError = err.message;
        statusCode = 500;
    }

    res.status(statusCode).json(healthStatus);
});

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

      // Save as PENDING and retry later
      try {
        const [result] = await db.query(
          "INSERT INTO orders (product_id, quantity, status) VALUES (?, ?, ?)",
          [productId, quantity, "PENDING"],
        );
        return res.status(202).json({
          success: false,
          pending: true,
          message: "High Demand. Please check a bit later.",
          orderDbId: result.insertId,
        });
      } catch (dbErr) {
        console.error("Failed to log pending order:", dbErr.message);
      }

      res
        .status(202)
        .json({
          success: false,
          pending: true,
          message: "High Demand. Please check a bit later.",
        });
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
