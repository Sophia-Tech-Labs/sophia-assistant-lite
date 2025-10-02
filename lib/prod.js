require("dotenv").config();
const { Pool } = require('pg');
const pool = new Pool({
  connectionString:process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  }
});

async function close() {
  await pool.end(); // this closes the entire pool
}
module.exports = {
  async query(text, params) {
    const res = await pool.query(text, params);
    return res.rows; // return array of rows
  },close
};
