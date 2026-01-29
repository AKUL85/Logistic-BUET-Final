const axios = require('axios');

const INVENTORY_API = 'http://localhost:3001/inventory';
const products = [
    { productId: 'apple', quantity: 100 },
    { productId: 'banana', quantity: 50 },
    { productId: 'orange', quantity: 75 },
    { productId: 'mango', quantity: 200 },
    { productId: 'grape', quantity: 150 }
];

async function seed() {
    console.log('Seeding Inventory...');
    for (const p of products) {
        try {
            await axios.post(INVENTORY_API, p);
            console.log(`Added ${p.productId}: ${p.quantity}`);
        } catch (err) {
            if (err.response && err.response.status === 409) {
                console.log(`Skipped ${p.productId}: Already exists`);
            } else {
                console.error(`Failed to add ${p.productId}:`, err.message);
            }
        }
    }
    console.log('Seeding Complete.');
}

seed();
