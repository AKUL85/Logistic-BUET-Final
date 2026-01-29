#!/bin/bash

export DB_HOST=localhost
export DB_USER=root
export DB_PASSWORD=password
export DB_NAME_ORDER=order_db
export DB_NAME_INVENTORY=inventory_db

export INVENTORY_SERVICE_URL=http://localhost:3001
export VITE_ORDER_SERVICE_URL=http://localhost:3000
export VITE_INVENTORY_SERVICE_URL=http://localhost:3001

echo "Starting Inventory Service on port 3001..."
cd inventory-service
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

trap "kill $PID_INV $PID_ORD $PID_FRONT; exit" INT
wait
