#!/bin/bash

# Configuration
# Please update DB_PASSWORD below if your local MySQL root password is not 'password'
export DB_HOST=localhost
export DB_USER=root
export DB_PASSWORD=password
export DB_NAME_ORDER=order_db
export DB_NAME_INVENTORY=inventory_db

# URLs for local execution (overriding Docker defaults)
export INVENTORY_SERVICE_URL=http://localhost:3001
export VITE_ORDER_SERVICE_URL=http://localhost:3000
export VITE_INVENTORY_SERVICE_URL=http://localhost:3001

echo "Starting Inventory Service on port 3001..."
cd inventory-service
# We need to install dependencies first if not done, but user likely did or I did.
# I'll assume dependencies are installed.
npm start &
PID_INV=$!
cd ..

echo "Starting Order Service on port 3000..."
cd order-service
npm start &
PID_ORD=$!
cd ..

echo "Starting Frontend on port 5173..."
cd frontend
npm run dev -- --port 5173 &
PID_FRONT=$!
cd ..

echo "All services started."
echo "Frontend: http://localhost:5173"
echo "Order Service: http://localhost:3000"
echo "Inventory Service: http://localhost:3001"
echo ""
echo "Press CTRL+C to stop all services."

# Wait for all background processes
trap "kill $PID_INV $PID_ORD $PID_FRONT; exit" INT
wait
