const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");

const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "password",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

const dbName = process.env.DB_NAME || "inventory_db";

let pool = null;

async function initDB() {
  try {
    console.log("Connecting to MySQL server...");

    // Connect to MySQL server (without DB)
    const connection = await mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password,
    });

    // Ensure database exists
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    await connection.end();

    console.log(`Database ${dbName} ready.`);

    // Create pool for the database
    pool = mysql.createPool({ ...dbConfig, database: dbName });

    const conn = await pool.getConnection();
    console.log("Database connected.");

    // Create table if not exists
    await conn.query(`
      CREATE TABLE IF NOT EXISTS inventory (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id VARCHAR(255) NOT NULL UNIQUE,
        quantity INT NOT NULL DEFAULT 0
      )
    `);

    console.log("Inventory table ensured.");

    // Seed data safely
    const seedData = [
      { product_id: "apple", quantity: 100 },
      { product_id: "banana", quantity: 50 },
      { product_id: "orange", quantity: 75 },
    ];

    for (const item of seedData) {
      await conn.query(
        `INSERT INTO inventory (product_id, quantity) 
         VALUES (?, ?) 
         ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)`,
        [item.product_id, item.quantity],
      );
    }

    console.log("Seed data inserted/updated.");

    conn.release();

    return true;
  } catch (err) {
    console.error("DB init failed:", err.message);
    return false;
  }
}


function getPool() {
  if (!pool) throw new Error("Database not initialized");
  return pool;
}

module.exports = { initDB, getPool };
