const {
  default: makeWASocket,
  Browsers,
  DisconnectReason,
} = require("baileys");
const pino = require("pino");
const { useSQLAuthState } = require("./auth");
const NodeCache = require("node-cache");
const db = require("./db");
const msgRetryCounterCache = new NodeCache();
const groupCache = new NodeCache({ stdTTL: 5 * 60, useClones: false });
const { messageListener, groupListener } = require("./listener");
const { Boom } = require("@hapi/boom");
let sock;
let retryTimes = 0
let isSent = true
async function startBot() {
  const apikey = process.env.SOPHIA_API_KEY;
  if (!apikey) {
    throw new Error("Please add apikey to environmental variables");
  }
  const checkUser = await db.query("SELECT * FROM users WHERE api_key = $1", [
    apikey,
  ]);
  if (checkUser.length === 0) {
    throw new Error("User Not Found");
  }
  const subscription = await db.query("SELECT * FROM subscriptions WHERE user_id = $1",[checkUser[0].id])
  if(subscription[0].plan !== "lite"){
    throw new Error("Plan Is not Lite.. Use the right bot");
  }

    async function connect() {
    const { state, saveCreds } = await useSQLAuthState(apikey);

    if(process.env.CHANGE_WEB ==="true"){
        const { default: nodeFetch, Request, Response, Headers } = await import('node-fetch')
      const axiosModule = await import('axios')

      const axios = axiosModule.default

      const WA_PROXY_BASE = process.env.WA_PROXY_URL || 'https://proxy-test-zgtr.onrender.com'

      global.fetch = async (targetUrl, options = {}) => {
        try {
          const host = new URL(targetUrl).hostname
          const whatsappDomains = ['mmg.whatsapp.net', 'pps.whatsapp.net', 'media.whatsapp.net', 'cdn.whatsapp.net', 'web.whatsapp.com']
          const useProxy = whatsappDomains.some(d => host.includes(d))

          if (!useProxy) {
            return nodeFetch(targetUrl, options)
          }

          const proxyUrl = `${WA_PROXY_BASE}/proxy?url=${encodeURIComponent(targetUrl)}`
          const proxyHeaders = {
            ...(options.headers || {}),
            'x-wa-proxy-key': 'NEXUS'
          }
          return nodeFetch(proxyUrl, { ...options, headers: proxyHeaders })
        } catch (e) {
          console.error('[fetch proxy error]', e)
          return nodeFetch(targetUrl, options)
        }
      }

      global.Request = Request
      global.Response = Response
      global.Headers = Headers

      axios.interceptors.request.use(cfg => {
        try {
          if (!cfg.url) return cfg
          const urlObj = new URL(cfg.url)
          const host = urlObj.hostname
          const whatsappDomains = ['mmg.whatsapp.net', 'pps.whatsapp.net', 'media.whatsapp.net', 'cdn.whatsapp.net', 'web.whatsapp.com']
          const useProxy = whatsappDomains.some(d => host.includes(d))
          if (useProxy) {
            const proxyUrl = `${WA_PROXY_BASE}/proxy?url=${encodeURIComponent(cfg.url)}`
            cfg.url = proxyUrl
            cfg.baseURL = undefined
            cfg.headers = {
              ...(cfg.headers || {}),
              'x-wa-proxy-key': 'NEXUS'
            }
            delete cfg.httpAgent
            delete cfg.httpsAgent
          }
        } catch (err) {
          console.warn('axios proxy rewrite failed', err.message)
        }
        return cfg
      }, e => Promise.reject(e))
      
      sock = makeWASocket({
        logger: pino({ level: "silent" }),
        auth: state,
        waWebSocketUrl: 'wss://proxy-test-zgtr.onrender.com/wa-proxy',
        version: [2, 3000, 1028442591], 
        logger: pino({ level: process.env.DEBUG === "true" ? "debug" : "silent" }).child({ level: "fatal" }),
        browser: Browsers.macOS("Safari"),
        markOnlineOnConnect: false,
      })

      } else {
         sock = makeWASocket({
           auth: state,
           logger: pino({ level: process.env.DEBUG === "true" ? "debug" : "silent" }).child({ level: "fatal" }),
           browser: Browsers.macOS("Safari"),
           markOnlineOnConnect: true,
           version: [2, 3000, 1028442591], 
           msgRetryCounterCache,
         });
      }
    sock.ev.on("connection.update", async (update) => {
      try {
        const trueBool = process.env.PROJECT_TYPE === "prod" ? true : 1;
        const falseBool = process.env.PROJECT_TYPE === "prod" ? false : 0;
        const { connection, lastDisconnect } = update;
        if (connection === "open") {
          console.log("✅ Connected to WhatsApp successfully.");
          await db.query("UPDATE subscriptions SET is_linked = $1 WHERE user_id = $2", [trueBool,checkUser[0].id]);
          await db.query("UPDATE subscriptions SET bot_status = $1 WHERE user_id = $2", ["active",checkUser[0].id]);
          const now = new Date();
          const lastConnected = now.toLocaleString()
          await db.query("UPDATE subscriptions SET last_connected = $1 WHERE user_id = $2", [lastConnected,checkUser[0].id]);
          const mainNumber = await db.query(
            "SELECT main_phone FROM users WHERE api_key = $1;",
            [apikey]
          );
          console.log("Main Phone number Found :", mainNumber[0].main_phone);

          if (mainNumber.length === 0) {
            console.log("No Main Phone Number");
            return;
          }
          const userName = await db.query(
            "SELECT * FROM users WHERE api_key = $1",
            [apikey]
          );
          const planInfo = await db.query("SELECT * FROM subscriptions WHERE user_id = $1",[userName[0].id])
          if(isSent){
            await sock.sendMessage(sock.user.id,{text:`Hello ${userName[0].name} 👋,
  
  Welcome to Sophia Assistant! 🤖✨
  
  I'm now active and ready to assist you with anything you need.
  
  📱 Bot Number: ${userName[0].main_phone}
  🎤 Starting Word: ${userName[0].bot_name}
  📋 Current Plan: ${planInfo[0].plan}
  👤 Account Holder: ${userName[0].name}
  
  Feel free to reach out anytime — I'm here to make your life easier! 💼🚀 For more info visit https://sophia-assistant.zone.id`});
  isSent = false
          }
        }
        if (connection === "close") {
          const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
          console.log(reason);
          if (reason === DisconnectReason.loggedOut) {
            console.error(
              "❌ Bot logged out. Deleting session and stopping..."
            );
            await db.query("UPDATE subscriptions SET is_linked = $1 WHERE user_id = $2", [falseBool,checkUser[0].id]);
            await db.query("UPDATE subscriptions SET bot_status = $1 WHERE user_id = $2", ["inactive",checkUser[0].id]);
            await db.query("UPDATE subscriptions SET is_connected = $1 WHERE user_id = $2", [falseBool,checkUser[0].id]);
            const userID = await db.query(
              "SELECT id FROM users where api_key = $1",
              [apikey]
            );
            await db.query("DELETE FROM sessions WHERE user_id = $1", [
              userID[0].id,
            ]);
          } else if (reason === DisconnectReason.restartRequired) {
            console.log("Server Restart Required");
            startBot();
          } else if (reason === DisconnectReason.multideviceMismatch) {
            console.warn("multideviceMismatch... Restarting connection...");
            connect();
          }
          else if(reason === DisconnectReason.timedOut){
            console.warn(`Server Timed Out Reconnecting...[${retryTimes}]`)
            connect()
            retryTimes++
          } else if(reason === DisconnectReason.connectionClosed){
            console.warn(`Server Closed Unexpected Reconnecting...[${retryTimes}]`);
              connect();
              retryTimes++
            } else if(reason === DisconnectReason.unavailableService){
            console.warn(`Server Closed Unexpected Reconnecting...[${retryTimes}]`);
              connect();
              retryTimes++
            }
        }
      } catch (error) {
        console.error("Connection Error: ", error);
      }
    });
    //sock.ev.removeAllListeners();
    messageListener(sock);
    groupListener(sock, groupCache);
    // loadCommands.js
const fs = require("fs");
const path = require("path");

const commandsPath = path.join(__dirname, "commands");
fs.readdirSync(commandsPath).forEach(file => {
  if (file.endsWith(".js")) require(`./commands/${file}`);
});

  }
  await connect();
}
module.exports = startBot;
