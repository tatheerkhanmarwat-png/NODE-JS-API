require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Auto-detect primary key & table name helper for Products
let productMeta = null;

async function getProductMeta() {
  if (productMeta) return productMeta;
  const tableRes = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND lower(table_name) = 'products'
    LIMIT 1
  `);
  const tableName = tableRes.rows[0] ? `"${tableRes.rows[0].table_name}"` : 'products';

  const colRes = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND lower(table_name) = 'products'
  `);
  const cols = colRes.rows.map(r => r.column_name);
  const pk =
    cols.find(c => c.toLowerCase() === 'product_id') ||
    cols.find(c => c.toLowerCase() === 'id') ||
    cols[0];

  productMeta = { tableName, pk: `"${pk}"`, rawPk: pk };
  return productMeta;
}

// READ: Get all products
app.get('/api/products', async (req, res) => {
  try {
    const { tableName, pk } = await getProductMeta();
    const result = await pool.query(`SELECT * FROM ${tableName} ORDER BY ${pk} DESC`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE: Add a new product
app.post('/api/products', async (req, res) => {
  try {
    const { name, price, stock_quantity, category_id, supplier_id } = req.body;
    const { tableName } = await getProductMeta();
    const result = await pool.query(
      `INSERT INTO ${tableName} (name, price, stock_quantity, category_id, supplier_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, Number(price), Number(stock_quantity), Number(category_id), Number(supplier_id)]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE: Edit an existing product
app.put('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, stock_quantity, category_id, supplier_id } = req.body;
    const { tableName, pk } = await getProductMeta();
    const result = await pool.query(
      `UPDATE ${tableName}
       SET name = $1, price = $2, stock_quantity = $3, category_id = $4, supplier_id = $5
       WHERE ${pk} = $6 RETURNING *`,
      [name, Number(price), Number(stock_quantity), Number(category_id), Number(supplier_id), Number(id)]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE: Delete a product
app.delete('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { tableName, pk } = await getProductMeta();
    const result = await pool.query(
      `DELETE FROM ${tableName} WHERE ${pk} = $1 RETURNING *`,
      [Number(id)]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});