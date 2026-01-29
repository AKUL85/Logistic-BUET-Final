const request = require('supertest');
const db = require('../db');

// Mock Data
const mockConnection = {
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
    query: jest.fn()
};

jest.mock('../db', () => ({
    init: jest.fn().mockResolvedValue(true),
    query: jest.fn(),
    getConnection: jest.fn()
}));

const app = require('../index');

describe('Inventory Service Unit Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Default mock implementation forgetConnection
        db.getConnection.mockResolvedValue(mockConnection);
        // Default success for connection query
        mockConnection.query.mockResolvedValue([[], []]); 
    });

    describe('GET /inventory', () => {
        it('should return inventory list', async () => {
            const mockData = [{ product_id: 'apple', quantity: 100 }];
            db.query.mockResolvedValue([mockData, []]);

            const res = await request(app).get('/inventory');
            
            expect(res.status).toBe(200);
            expect(res.body).toEqual(mockData);
            expect(db.query).toHaveBeenCalledWith('SELECT * FROM inventory');
        });

        it('should handle db errors', async () => {
            db.query.mockRejectedValue(new Error('DB Error'));
            const res = await request(app).get('/inventory');
            expect(res.status).toBe(500);
        });
    });

    describe('POST /inventory/reserve', () => {
        const payload = { 
            productId: 'apple', 
            quantity: 5, 
            idempotencyKey: 'key-123' 
        };

        it('should reserve stock successfully', async () => {
            // Mock sequence of queries on connection
            // 1. Check idempotency -> empty
            // 2. Lock product -> returns row with quantity
            // 3. Update -> success
            // 4. Insert idempotency -> success
            
            mockConnection.query
                .mockResolvedValueOnce([[], []]) // Check idempotency: Not found
                .mockResolvedValueOnce([[{ quantity: 10 }]]) // Lock product: Found with 10
                .mockResolvedValueOnce([]) // Update inventory
                .mockResolvedValueOnce([]); // Insert idempotency

            const res = await request(app).post('/inventory/reserve').send(payload);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.reserved).toBe(5);
            expect(mockConnection.beginTransaction).toHaveBeenCalled();
            expect(mockConnection.commit).toHaveBeenCalled();
            expect(mockConnection.release).toHaveBeenCalled();
        });

        it('should return cached response if idempotency key exists', async () => {
            const cachedResponse = { success: true, message: 'Stock reserved', reserved: 5 };
            
            mockConnection.query.mockResolvedValueOnce([[{ response_json: cachedResponse }]]); // Found key

            const res = await request(app).post('/inventory/reserve').send(payload);

            expect(res.status).toBe(200);
            expect(res.body).toEqual(cachedResponse);
            expect(mockConnection.rollback).toHaveBeenCalled(); // Should rollback/release early logic
            // Actually code calls rollback then release if existing found.
            expect(mockConnection.release).toHaveBeenCalled();
        });

        it('should fail if insufficient stock', async () => {
            mockConnection.query
                .mockResolvedValueOnce([[]]) // Idempotency check
                .mockResolvedValueOnce([[{ quantity: 2 }]]); // Lock product: Low stock

            const res = await request(app).post('/inventory/reserve').send(payload);

            expect(res.status).toBe(409);
            expect(res.body.message).toBe('Insufficient stock');
            expect(mockConnection.rollback).toHaveBeenCalled();
            expect(mockConnection.release).toHaveBeenCalled();
        });

        it('should fail if product not found', async () => {
            mockConnection.query
                .mockResolvedValueOnce([[]]) // Idempotency check
                .mockResolvedValueOnce([[]]); // Lock product: Not found

            const res = await request(app).post('/inventory/reserve').send(payload);

            expect(res.status).toBe(404);
            expect(res.body.error).toBe('Product not found');
            expect(mockConnection.rollback).toHaveBeenCalled();
        });

        it('should handle missing fields', async () => {
            const res = await request(app).post('/inventory/reserve').send({ productId: 'apple' });
            expect(res.status).toBe(400);
        });

        it('should rollback on processing error', async () => {
            mockConnection.query.mockRejectedValue(new Error('Processing failed'));

            const res = await request(app).post('/inventory/reserve').send(payload);

            expect(res.status).toBe(500);
            expect(mockConnection.rollback).toHaveBeenCalled();
            expect(mockConnection.release).toHaveBeenCalled();
        });
    });
});
