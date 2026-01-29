import { useState, useEffect } from 'react'
import axios from 'axios'
import './App.css'

// Use localhost for browser access
const ORDER_API = 'http://localhost:3000';
const INVENTORY_API = 'http://localhost:3001';

function App() {
  const [inventory, setInventory] = useState([]);
  const [orders, setOrders] = useState([]);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState('');

  const fetchInventory = async () => {
    try {
      const res = await axios.get(`${INVENTORY_API}/inventory`);
      setInventory(res.data);
    } catch (err) {
      console.error("Failed to fetch inventory", err);
    }
  };

  const fetchOrders = async () => {
    try {
      const res = await axios.get(`${ORDER_API}/orders`);
      setOrders(res.data);
    } catch (err) {
      console.error("Failed to fetch orders", err);
    }
  };

  useEffect(() => {
    fetchInventory();
    fetchOrders();
    const interval = setInterval(() => {
      fetchInventory(); // Poll for updates
      fetchOrders();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleOrder = async (e) => {
    e.preventDefault();
    setMessage('Processing...');
    try {
      const res = await axios.post(`${ORDER_API}/orders`, {
        productId,
        quantity: parseInt(quantity)
      });
      setMessage('Order successful');
      fetchInventory();
      fetchOrders();
    } catch (err) {
      console.error("Order failed:", err);
      setMessage("High demand. Please try again.");
    }
  };

  return (
    <div className="container">
      <h1>Logistics Microservices</h1>

      <div className="section">
        <h2>Place Order</h2>
        <form onSubmit={handleOrder} className="order-form">
          <div className="form-group">
            <label>Product ID:</label>
            <select value={productId} onChange={(e) => setProductId(e.target.value)} required>
              <option value="">Select Product</option>
              {inventory.map(item => (
                <option key={item.product_id} value={item.product_id}>
                  {item.product_id} (Available: {item.quantity})
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Quantity:</label>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </div>
          <button type="submit">Order</button>
        </form>
        {message && <div className="message">{message}</div>}
      </div>

      <div className="dashboard">
        <div className="card">
          <h2>Inventory Status</h2>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Quantity</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map(item => (
                <tr key={item.id}>
                  <td>{item.product_id}</td>
                  <td>{item.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2>Recent Orders</h2>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Product</th>
                <th>Qty</th>
                <th>Status</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => (
                <tr key={order.id}>
                  <td>{order.id}</td>
                  <td>{order.product_id}</td>
                  <td>{order.quantity}</td>
                  <td className={`status-${order.status.toLowerCase()}`}>{order.status}</td>
                  <td>{new Date(order.created_at).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default App
