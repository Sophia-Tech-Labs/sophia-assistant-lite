require("dotenv").config()
const keepAlive = require("./lib/alive");
const startBot = require("./lib/connect");
const express = require("express");

const app = express();

app.get("/",(req,res)=>{
	res.send("Whatsapp bot working")
})
startBot()
keepAlive()
 const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
	console.log("Server Running On Port: ",PORT)
})
