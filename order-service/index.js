const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const axios = require("axios");
const db = require("./db");
const { v4: uuidv4 } = require("uuid");
const client = require('prom-client');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'code'],
  buckets: [0.1, 0.5, 1, 2, 5]
});
register.registerMetric(httpRequestDuration);

const PORT = 3000;
const INVENTORY_SERVICE_URL =
  process.env.INVENTORY_SERVICE_URL || "http://inventory-service:3001";

app.use((req, res, next) => {
  const start = process.hrtime();
  res.on('finish', () => {
    const duration = process.hrtime(start);
    const seconds = duration[0] + duration[1] / 1e9;
    httpRequestDuration.observe({
      method: req.method,
      route: req.route ? req.route.path : req.url,
      code: res.statusCode
    }, seconds);
  });
  next();
});

// Chaos Middleware: Artificial Latency
app.use(async (req, res, next) => {
  if (req.query.latency) {
    const ms = parseInt(req.query.latency);
    if (ms > 0) {
      await new Promise(resolve => setTimeout(resolve, ms));
    }
  }
  next();
});

async function startDB() {
  const success = await db.init();
  if (!success) {
    setTimeout(startDB, 5000);
  }
}
startDB();

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.get('/health', async (req, res) => {
  const health = {
    service: 'order-service',
    status: 'healthy',
    checks: {
      database: 'unknown',
      inventoryService: 'unknown'
    }
  };

  let status = 200;

  // Check DB
  try {
    await db.query('SELECT 1');
    health.checks.database = 'connected';
  } catch (e) {
    health.checks.database = 'disconnected';
    health.status = 'unhealthy';
    status = 503;
  }

  // Check Inventory Service
  try {
    await axios.get(`${INVENTORY_SERVICE_URL}/health`, { timeout: 1000 });
    health.checks.inventoryService = 'connected';
  } catch (e) {
    health.checks.inventoryService = 'disconnected';
    health.status = 'unhealthy';
    status = 503;
  }

  res.status(status).json(health);
});

// Track attempts for crash simulation
let callCounter = 0;

async function reserveWithRetry(
  productId,
  quantity,
  idempotencyKey,
  attempt = 1,
) {
  const maxRetries = 10;
  const timeout = 3000; // 3 seconds timeout per request
  
  // Only increment on the very first attempt of a new request call
  if(attempt === 1) callCounter++;

  try {
    // Crash every 5th request
    const shouldCrash = process.env.SIMULATE_CRASH === "true" && attempt === 1 && (callCounter % 5 === 0);

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