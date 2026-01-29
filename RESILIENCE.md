# Gremlin Latency & Resilience Implementation

## Overview
This implementation adds resilience to the microservices architecture by simulating network latency issues and handling them gracefully.

## What Was Implemented

### 1. Gremlin Latency in Inventory Service
**File:** `inventory-service/index.js`

- **Deterministic Pattern:** Every 3rd request to `/inventory/reserve` is delayed by 6 seconds
- **Request Counter:** Tracks request number to apply delays predictably
- **Logging:** Clear console messages show which requests are delayed

```javascript
// Request #1: Normal response (~0.1s)
// Request #2: Normal response (~0.1s)
// Request #3: Delayed by 6000ms (6s)
// Request #4: Normal response (~0.1s)
// Request #5: Normal response (~0.1s)
// ...cycle repeats
```

### 2. Timeout Handling in Order Service
**File:** `order-service/index.js`

- **Timeout Configuration:** 5-second timeout for inventory service calls (configurable via `INVENTORY_TIMEOUT_MS` env variable)
- **Graceful Degradation:** Order service doesn't freeze when inventory service is slow
- **User-Friendly Error Messages:** Returns clear timeout messages instead of hanging
- **Failed Order Logging:** Saves orders with `FAILED` status when timeouts occur

## Test Results

Running the test script demonstrates the resilience:

```bash
./test-resilience.sh
```

### Expected Behavior
- **Request #1:** ✅ Success in ~0.09s
- **Request #2:** ✅ Success in ~0.07s
- **Request #3:** ⏱️ Timeout after 5.03s with error: "Inventory service timed out after 5000ms. Please try again later."
- **Request #4:** ✅ Success in ~0.06s
- **Request #5:** ✅ Success in ~0.05s

### Database State
Orders are properly logged with their status:
```
PROCESSED - Request 1
PROCESSED - Request 2
FAILED    - Request 3 (timeout)
PROCESSED - Request 4
PROCESSED - Request 5
```

## Key Benefits

1. **No Infinite Waits:** Order service doesn't hang forever waiting for slow responses
2. **User Feedback:** Clear error messages inform users when services are slow
3. **Audit Trail:** Failed orders are logged for debugging and monitoring
4. **Configurable:** Timeout can be adjusted via environment variable
5. **Predictable Testing:** Deterministic latency pattern makes testing reliable

## Configuration

### Environment Variables

**Order Service:**
```yaml
INVENTORY_TIMEOUT_MS=5000  # Default: 5 seconds
```

### Adjusting the Gremlin Pattern

To change the latency pattern, modify in `inventory-service/index.js`:
```javascript
const shouldDelay = requestCounter % 3 === 0;  // Every 3rd request
const delayMs = 6000;                          // 6 seconds
```

## Monitoring

Check logs to see resilience in action:

```bash
# View gremlin latency logs
docker compose logs inventory-service | grep GREMLIN

# View timeout handling
docker compose logs order-service | grep TIMEOUT

# View all orders with status
curl http://localhost:3000/orders | jq '.[] | {product_id, status}'
```

## Real-World Application

This pattern simulates real-world scenarios:
- Network congestion
- Database query delays
- External API slowdowns
- Overloaded services
- "Noisy neighbors" in shared infrastructure

The resilient architecture ensures the Order Service provides a good user experience even when dependent services are struggling.
