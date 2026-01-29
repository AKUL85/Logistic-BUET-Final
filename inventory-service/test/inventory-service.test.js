const request = require("supertest");
const { app, startDB } = require("../index"); // adjust path if needed
const { getPool } = require("../database/connectDb");

// Store test products for cleanup
const createdProducts = [];

// Initialize DB before running any tests
beforeAll(async () => {
  console.log("Initializing database for tests...");
  await startDB(); // ensures DB and tables exist
});

// Tests
describe("Inventory API Tests", () => {
  //  CREATE INVENTORY
  test("POST /inventory → should create a new product", async () => {
    const productId = `TEST_${Date.now()}`;

    const res = await request(app)
      .post("/inventory")
      .send({ productId, quantity: 25 });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);

    // Store for cleanup
    createdProducts.push(productId);
  });

  // LIST INVENTORY
  test("GET /inventory → should return inventory list", async () => {
    const res = await request(app).get("/inventory");

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  //  RESERVE STOCK
  test("POST /inventory/reserve → should reserve stock", async () => {
    const productId = `TEST_${Date.now()}`;

    // First, create product
    await request(app).post("/inventory").send({ productId, quantity: 10 });

    createdProducts.push(productId);

    // Reserve some stock
    const res = await request(app)
      .post("/inventory/reserve")
      .send({ productId, quantity: 4 });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  //  DELETE INVENTORY
  test("DELETE /inventory/:productId → should delete product", async () => {
    const productId = `TEST_${Date.now()}`;

    // First, create product
    await request(app).post("/inventory").send({ productId, quantity: 5 });

    createdProducts.push(productId);

    // Delete product
    const res = await request(app).delete(`/inventory/${productId}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// Cleanup after all tests
afterAll(async () => {
  console.log("Cleaning up test inventory...");

  const pool = getPool();
  for (const productId of createdProducts) {
    try {
      await pool.query("DELETE FROM inventory WHERE product_id = ?", [
        productId,
      ]);
      console.log(`Deleted test product: ${productId}`);
    } catch (err) {
      console.error(`Failed to delete ${productId}:`, err.message);
    }
  }
});
