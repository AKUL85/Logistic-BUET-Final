#!/bin/bash

echo "=============================================="
echo "Checking Latency Handling for Order Service"
echo "=============================================="

# Define the URL
URL="http://localhost:3000/orders"
INVENTORY_URL="http://localhost:3001/inventory"

# Initialize Inventory to prevent 404 errors
echo "Initializing inventory..."
curl -s -X POST "$INVENTORY_URL" \
  -H "Content-Type: application/json" \
  -d '{"productId": "LAPTOP-001", "quantity": 100}' > /dev/null

# Loop 5 times to test stability
for i in {1..90}
do
   echo -n "Request #$i... "
   
   # Capture start time (nanoseconds)
   START=$(date +%s%N)
   
   # Make the request
   # We capture HTTP status and the body
   RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$URL" \
     -H "Content-Type: application/json" \
     -d '{"productId": "LAPTOP-001", "quantity": 1}')
   
   # Capture end time
   END=$(date +%s%N)
   DURATION=$(( ($END - $START) / 1000000 ))
   
   # Extract status and body
   HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
   BODY=$(echo "$RESPONSE" | head -n -1)
   
   # Check results based on logic:
   # - Success if processed (200)
   # - Failed if latency/timeout happened (503)
   
   if [ "$HTTP_CODE" -eq 200 ]; then
       echo -e "\033[0;32mSUCCESSFUL\033[0m (Time: ${DURATION}ms)"
       echo "   -> Order Processed"
   elif [[ "$BODY" == *"timeout"* ]] || [[ "$BODY" == *"High Demand"* ]]; then
       echo -e "\033[0;31mFAILED\033[0m (Time: ${DURATION}ms)"
       echo "   -> Latency too high! (Timeout trigger handled)"
       # echo "   -> Message: $BODY"
   else
       echo -e "\033[0;33mFAILED\033[0m (HTTP $HTTP_CODE)"
       echo "   -> Unexpected error: $BODY"
   fi
   
   echo "----------------------------------------------"
   sleep 0.5
done
