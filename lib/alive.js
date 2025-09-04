const axios = require('axios')

const keepAlive = () => {
 const myUrl = process.env.RENDER_EXTERNAL_URL
 if (myUrl) {
   setInterval(() => {
     axios.get(myUrl).catch(() => {})
   }, 3 * 60 * 1000)
 }
};
module.exports = keepAlive