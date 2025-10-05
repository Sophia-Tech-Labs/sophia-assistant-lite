require("dotenv").config()
const keepAlive = require("./lib/alive");
const startBot = require("./lib/connect");
const express = require("express");

const app = express();

app.get("/",(req,res)=>{
	res.send("Whatsapp bot working")
})
keepAlive()
startBot()
 const PORT = process.env.PORT || 8000;
app.listen(PORT, async () => {
	console.log("Server Running On Port: ",PORT)
})
