require("dotenv").config();
const { Pool } = require('pg');
const pool = new Pool({
  connectionString:"postgresql://sophia_2zbx_user:EZDG6npXCvwJbStj5kUIrP83dby7aSNB@dpg-d2g4k53uibrs73dvmsgg-a.oregon-postgres.render.com/sophia_2zbx",
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
