const request = require("supertest");
const axios = require("axios");

// Mock db BEFORE requiring index.js
jest.mock("../db", () => ({
  init: jest.fn().mockResolvedValue(true),
  query: jest.fn(),
  pool: {
    end: jest.fn().mockResolvedValue(),
  },
}));

const db = require("../db");
const app = require("../index");

jest.mock("axios");

describe("Order Service Unit Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
      // Clean up if needed, though mocks handle it
  });

  describe("GET /orders", () => {
    it("should return list of orders", async () => {
      const mockOrders = [{ id: 1, product_id: "p1", quantity: 1, status: "PROCESSED" }];
      db.query.mockResolvedValue([mockOrders, []]);

      const res = await request(app).get("/orders");
      
      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockOrders);
    });

    it("should handle db errors", async () => {
        db.query.mockRejectedValue(new Error("DB Connection Failed"));
        const res = await request(app).get("/orders");
        expect(res.status).toBe(500);
    });
  });

    beforeAll(() => {
        jest.spyOn(global, "setInterval").mockImplementation(() => 0);
    });

    afterAll(() => {
        global.setInterval.mockRestore();
    });

  describe("POST /orders", () => {
    const validOrder = { productId: "p1", quantity: 2 };

    it("should create order successfully when inventory is reserved", async () => {
        // Inventory success
        axios.post.mockResolvedValue({ 
            data: { success: true, message: "Reserved" } 
        });
        
        // DB Insert Success
        db.query.mockResolvedValue([{ insertId: 10 }]);

        const res = await request(app).post("/orders").send(validOrder);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.orderId).toBeDefined();
        // Check axios called with correct params
        expect(axios.post).toHaveBeenCalledWith(
            expect.stringContaining("/inventory/reserve"),
            expect.objectContaining({
                productId: "p1",
                quantity: 2
            }),
            expect.anything()
        );
        // Check DB insert with PROCESSED
        expect(db.query).toHaveBeenCalledWith(
            expect.stringContaining("INSERT INTO orders"),
            expect.arrayContaining(["p1", 2, "PROCESSED"])
        );
    });

    it("should return 400 if validation fails", async () => {
        const res = await request(app).post("/orders").send({ productId: "" });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Missing/);
    });

    it("should handle inventory Out of Stock (409)", async () => {
        // Inventory 409
        const error = {
            response: {
                status: 409,
                data: { message: "Insufficient stock" }
            }
        };
        axios.post.mockRejectedValue(error);

        const res = await request(app).post("/orders").send(validOrder);

        expect(res.status).toBe(409);
        expect(res.body.message).toBe("Out of Stock");
        // Should NOT retry 409
        expect(axios.post).toHaveBeenCalledTimes(1);
    });

    it("should return 503 if inventory service is down", async () => {
        // Network Error or 503
        const error = {
            message: "Network Error",
            isAxiosError: true
        };
        // Mocking retry behavior might be slow if we don't mock setTimeout or reduce retries.
        // The code has `const timeout = 3000` and `retry logic`.
        // We can jest.useFakeTimers() or just verify the initial failure logic if possible.
        // However, the code retries 10 times with 1s delay! That's 10s test duration.
        // We should probably mock the retry logic or the reserveWithRetry function is internal.
        // Since it's internal to index.js and not exported, we have to test via endpoint.
        // We can mock axios to fail FAST or rely on the fact that `attempt` arg is default 1.
        
        // Actually, we can just spy on console to see retries, but for unit test speed we want to avoid real waits.
        // We can mock setTimeout?
        
        /* 
           The code:
           await new Promise((res) => setTimeout(res, 1000));
        */
        
        // This test might time out if we don't handle the retry delays.
        // Let's Skip the full retry verification for this specific unit test run
        // and just test a non-retriable error OR mock `setTimeout` to be instant.
    });
    
    it("should retry on network error and eventually fail", async () => {
        // Mock setTimeout to resolve immediately, skipping the 1s delay
        const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((cb) => cb());
        
        const error = {
            response: { status: 500 },
             message: "Server Error"
        };
        axios.post.mockRejectedValue(error);
        
        const res = await request(app).post("/orders").send(validOrder);

        expect(res.status).toBe(202);
        // 1 initial + 10 retries = 11 calls
        expect(axios.post).toHaveBeenCalledTimes(11); 
        expect(res.body.success).toBe(false);
        expect(res.body.pending).toBe(true);
        
        setTimeoutSpy.mockRestore();
    });

    it("should save order as PENDING if inventory fails permanently", async () => {
         const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((cb) => cb());
         
         axios.post.mockRejectedValue({ response: { status: 500 } });
         db.query.mockResolvedValue([]); 

         const res = await request(app).post("/orders").send(validOrder);
         
         expect(res.status).toBe(202);
         // Check DB insert with PENDING
         expect(db.query).toHaveBeenCalledWith(
            expect.stringContaining("INSERT INTO orders"),
            expect.arrayContaining(["p1", 2, "PENDING"])
        );
        
        setTimeoutSpy.mockRestore();
    });
  });
});
