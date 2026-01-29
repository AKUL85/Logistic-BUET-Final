const request = require("supertest");
const ORDER_SERVICE_URL =
  process.env.ORDER_SERVICE_URL || "http://localhost:3000";

describe("Order Service Load Test", () => {
  test("handle multiple concurrent orders", async () => {
    const NUM_REQUESTS = 50;
    const requests = [];

    for (let i = 0; i < NUM_REQUESTS; i++) {
      const payload = {
        productId: `TEST_${i}`,
        quantity: 1,
      };
      requests.push(
        request(ORDER_SERVICE_URL)
          .post("/orders")
          .send(payload)
          .then((res) => {
            expect([200, 201, 400]).toContain(res.statusCode);
          }),
      );
    }

    await Promise.all(requests);
  }, 20000);
});
