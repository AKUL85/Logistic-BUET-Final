const mysql = require('mysql2/promise');

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'password',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

const dbName = process.env.DB_NAME || 'order_db';

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
            const poolConn = await this.pool.getConnection();
            console.log('Database connected!');

            await poolConn.query(`
                CREATE TABLE IF NOT EXISTS orders (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    product_id VARCHAR(255) NOT NULL,
                    quantity INT NOT NULL,
                    status VARCHAR(50) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            poolConn.release();
            return true;
        } catch (err) {
            console.error('Failed to connect to database:', err.message);
            return false;
        }
    }

    async query(sql, params) {
        if (!this.pool) throw new Error('Database not ready');
        return this.pool.query(sql, params);
    }
}

module.exports = new DatabaseService();
