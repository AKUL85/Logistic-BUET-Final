const mysql = require('mysql2/promise');

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'password',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

const dbName = process.env.DB_NAME || 'inventory_db';

class DatabaseService {
    constructor() {
        this.pool = null;
    }

    async init() {
        try {
            console.log('Connecting to database server...');
            const connection = await mysql.createConnection({
                host: dbConfig.host,
                user: dbConfig.user,
                password: dbConfig.password
            });

            await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
            await connection.end();

            console.log(`Database ${dbName} ensured.`);

            this.pool = mysql.createPool({ ...dbConfig, database: dbName });

            // Validate connection
            const poolConn = await this.pool.getConnection();
            console.log('Database connected!');

            await this.initSchema(poolConn);
            poolConn.release();
            return true;
        } catch (err) {
            console.error('Failed to connect to database:', err.message);
            return false;
        }
    }

    async initSchema(connection) {
        await connection.query(`
            CREATE TABLE IF NOT EXISTS inventory (
                id INT AUTO_INCREMENT PRIMARY KEY,
                product_id VARCHAR(255) NOT NULL UNIQUE,
                quantity INT NOT NULL DEFAULT 0
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS idempotency_log (
                id INT AUTO_INCREMENT PRIMARY KEY,
                idempotency_key VARCHAR(255) NOT NULL UNIQUE,
                response_json JSON NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Seed if empty
        const [rows] = await connection.query('SELECT count(*) as count FROM inventory');
        if (rows[0].count === 0) {
            console.log('Seeding initial inventory...');
            await connection.query('INSERT INTO inventory (product_id, quantity) VALUES ?', [
                [['apple', 100], ['banana', 50], ['orange', 75]]
            ]);
        }
    }

    async query(sql, params) {
        if (!this.pool) throw new Error('Database not ready');
        return this.pool.query(sql, params);
    }

    async getConnection() {
        if (!this.pool) throw new Error('Database not ready');
        return this.pool.getConnection();
    }
}

module.exports = new DatabaseService();
