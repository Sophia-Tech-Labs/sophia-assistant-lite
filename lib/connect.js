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
    const sock = makeWASocket({
      auth: state,
      logger: pino({ level: "silent" }).child({ level: "fatal" }),
      browser: Browsers.macOS("Safari"),
      markOnlineOnConnect: true,
      msgRetryCounterCache,
      cachedGroupMetadata: async (jid) => groupCache.get(jid),
      generateHighQualityLinkPreview: true,
    });
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
            "SELECT name FROM users WHERE api_key = $1",
            [apikey]
          );
          await sock.sendMessage(sock.user.id,{text:`Heya ${userName[0].name} 😚, Sophia Assistant Here. Surprise Surprise i'm Alive 🥳🥳 soo hyd`});
        }
        if (connection === "close") {
          const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
          if (reason === DisconnectReason.loggedOut) {
            console.error(
              "❌ Bot logged out. Deleting session and stopping..."
            );
            await db.query("UPDATE subscriptions SET is_linked = $1 WHERE user_id = $2", [falseBool,checkUser[0].id]);
            await db.query("UPDATE subscriptions SET bot_status = $1 WHERE user_id = $2", ["inactive",checkUser[0].id]);
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
            console.error("multideviceMismatch... Restarting connection...");
            connect();
          }
        }
      } catch (error) {
        console.error("Connection Error: ", error);
      }
    });
    //sock.ev.removeAllListeners();
    messageListener(sock);
    groupListener(sock, groupCache);
  }
  await connect();
}
module.exports = startBot;
