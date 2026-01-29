# Logistics Microservices Project

This project implements a microservices architecture for a logistics system, featuring an Order Service, Inventory Service, and a React Frontend.

## Architecture

- **Order Service** (Node.js/Express): Handles order placement.
- **Inventory Service** (Node.js/Express): Manages stock.
- **Frontend** (React/Vite): User interface.
- **Databases**: Each service uses its own MySQL database (`order_db`, `inventory_db`).

## Prerequisites

- Node.js (v18+)
- MySQL Server running locally (or via Docker)

## Setup

1.  **Install Dependencies**:
    ```bash
    cd order-service && npm install
    cd ../inventory-service && npm install
    cd ../frontend && npm install
    cd ..
    ```

2.  **Database Configuration**:
    - Ensure your local MySQL server is running.
    - Default configuration assumes user `root` and password `password`.
    - If your password differs, open `start-services.sh` and update `DB_PASSWORD`.

## Running the Project

### Option 1: Docker (Recommended if available)
If you have Docker installed and running:
```bash
docker-compose up --build
```
Access frontend at `http://localhost:5173`.

### Option 2: Local Execution (No Docker)
If Docker is not available or failing (e.g. permission issues), use the provided helper script:

```bash
chmod +x start-services.sh
./start-services.sh
```
This script will:
- Set environment variables.
- Start Order Service (Port 3000).
- Start Inventory Service (Port 3001).
- Start Frontend (Port 5173).

## Verification

1.  Open `http://localhost:5173`.
2.  You should see the "Inventory Status" loaded with initial data (Apples, Bananas).
3.  Place an order using the form.
4.  Verify the order appears in "Recent Orders" and Inventory count decreases.
