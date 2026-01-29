const request = require("supertest");
const axios = require("axios");

// Mock db BEFORE requiring index.js to prevent connection attempts
jest.mock("../db", () => ({
  init: jest.fn().mockResolvedValue(true),
  query: jest.fn().mockResolvedValue([{ insertId: 1 }]),
  pool: {
    end: jest.fn().mockResolvedValue(),
  },
}));

const db = require("../db");
// Now require the app
const app = require("../index");

jest.mock("axios");

describe("Order Service Load Test", () => {
  beforeAll(async () => {
    // DB init is already mocked to succeed
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    // No cleanup needed for mocked db
  });

  it("should handle concurrent order creations", async () => {
    // Mock Inventory Service Success
    axios.post.mockResolvedValue({
      data: { success: true, message: "Reserved" },
    });
    
    // Mock DB Query to simulate successful insert
    // We need to spyOn/mock the db module methods.
    // Since db is a singleton instance exported, we can spy on db.query
    jest.spyOn(db, "query").mockResolvedValue([{ insertId: 1 }]);
    jest.spyOn(db, "init").mockResolvedValue(true);

    const numberOfRequests = 50;
    const requests = [];

    for (let i = 0; i < numberOfRequests; i++) {
      requests.push(
        request(app)
          .post("/orders")
          .send({ productId: "123", quantity: 1 })
      );
    }

    const responses = await Promise.all(requests);

    // Verify all requests succeeded
    responses.forEach((res) => {
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    expect(axios.post).toHaveBeenCalledTimes(numberOfRequests);
    // 2 queries per success (insert order), wait -- logic:
    // 1. axios call
    // 2. if success, db.query insert
    expect(db.query).toHaveBeenCalledTimes(numberOfRequests); 
  });
});
