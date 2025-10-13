const Message = require("./base");
const Database = require("better-sqlite3");
const newdb = new Database("function.db");
const db = require("./db");
const WCGIntegration = require('../wcg');
const axios = require("axios");
const { enableLinkDetection, disableLinkDetection } = require("./antilink");
const apikey = process.env.SOPHIA_API_KEY;
async function getMainNumber() {
	const results = await db.query(
		"SELECT main_phone FROM users WHERE api_key = $1",
		[apikey]
	);
	if (results.length === 0) {
		throw new Error("Main Phone Number Not found");
	}
	return results[0].main_phone + "@s.whatsapp.net";
}

function isGroup(message) {
  return message.key.remoteJid.endsWith("@g.us");
}

async function getUsersPlan() {
  const results = await db.query("SELECT s.plan AS plan FROM subscriptions AS s JOIN users ON users.id = s.user_id  WHERE users.api_key = $1",[apikey])
  return results[0].plan
}

async function getBotName() {
  const results = await db.query("SELECT bot_name FROM users WHERE api_key = $1",[apikey])
  return results[0].bot_name
}
async function isGroupUser(message) {
	if (!isGroup(message)) {
    return;
  }
  return (await getMainNumber()) == message?.key?.participantPn;
}

class Functions {
  constructor(sock, message,messageInstance) {
	  this.sock = sock;
	  this.msg = message;
	 this.m = messageInstance;
   if (!Functions.wcgIntegration) {
      Functions.wcgIntegration = new WCGIntegration();
    }
    Functions.wcgIntegration.initWCGFunctions(this);
	}


	changeTone(tone) {
		newdb
		.prepare(
			`
CREATE TABLE IF NOT EXISTS settings(
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	tone TEXT NOT NULL DEFAULT "default"
)
		`
      )
      .run();
    const row = newdb.prepare("SELECT id FROM settings WHERE id = 1").get();
    if (row) {
		newdb.prepare("UPDATE settings SET tone = ? WHERE id = 1").run(tone);
    } else {
		newdb.prepare("INSERT INTO settings (id, tone) VALUES (1, ?)").run(tone);
    }
}
getTone() {
	try {
		const row = newdb
        .prepare("SELECT tone FROM settings WHERE id = ?")
        .get(1);
		const tone = row ? row.tone : "default";
		return tone;
    } catch (error) {
		return "default";
    }
}
async tagAll() {
	try {
		if (!isGroup(this.msg)) {
        const response = await this.m.callAI(
          "TOOLS",
          "Tell the user that He is not in a group therefore he cannot use the tagAll tool yet"
        );
        await this.m.reply(response?.reply);
        return;
      }

      const { participants } = await this.sock.groupMetadata(
        this.msg.key.remoteJid
      );

      const content = participants
        .map((p) => `@${p.jid.split("@")[0]}`)
        .join("\n");

      const response = await this.m.callAI(
        "TOOLS",
        "Say: you have successfully tagged all members of the group and add your tone."
      );

      await this.sock.sendMessage(this.msg.key.remoteJid, {
        text: `${response?.reply}\n\n${content}`,
        mentions: participants.map((p) => p.jid),
      });
    } catch (error) {
      console.error("Error tagging all: ", error);
      await this.m.reply("Looks like I couldn't tag all.. Try again?");
    }
  }

  async tagMessage(messageText) {
  try {
    if (!isGroup(this.msg)) {
      const response = await this.m.callAI(
        "TOOLS",
        "Tell the user that he is not in a group therefore he cannot use the tagMessage tool yet."
      );
      await this.m.reply(response?.reply);
      return;
    }

    const { participants } = await this.sock.groupMetadata(this.msg.key.remoteJid);

    const response = await this.m.callAI(
      "TOOLS",
      "Tell the user that you have successfully tagged everyone with the message they provided."
    );

    await this.sock.sendMessage(this.msg.key.remoteJid, {
      text: `${messageText}`,
      mentions: participants.map((p) => p.id || p.jid),
    });
  } catch (error) {
    console.error("Error tagging message: ", error);
    await this.m.reply("Looks like I couldn't tag the message.. Try again?");
  }
}


   decodeJid(jid) {
    if (!jid) return jid;
    if (/:\d+@/gi.test(jid)) {
      const decode = jidDecode(jid) || {};
      return decode.user && decode.server
        ? `${decode.user}@${decode.server}`
        : jid;
    } else {
      return jid;
    }
  }

  async searchAnime(query) {
  // Get data from API
  const response = await fetch(`https://api.jikan.moe/v4/anime?q=${query}`);
  const fullData = await response.json();
  
  // Filter to only what's needed
  const simplifiedData = fullData.data.map(anime => ({
    title: anime.title,
    title_english: anime.title_english,
    synopsis: anime.synopsis,
    score: anime.score,
    episodes: anime.episodes,
    year: anime.year,
    genres: anime.genres.map(g => g.name).join(', '),
    url: anime.url,
    image: anime.images.jpg.image_url
  }));
  
  // Send ONLY the filtered data to AI
  return simplifiedData;
}

  // Add this to your Functions class
async downloadMedia() {
  const { downloadMediaMessage } = require('baileys');
  const Pino = require('pino');
  const logger = Pino({level:'error'});
  
  const participant = this.msg.key.participant;
  const mess = {
    key: {
      id: this.msg.key.id,
      fromMe: this.msg.key.fromMe,
      remoteJid: this.msg.key.remoteJid,
      ...(participant && {participant}),
    },
    message: this.msg.message.extendedTextMessage?.contextInfo?.quotedMessage,
  };
  
  if (this.msg) {
    try {
      const buffer = await downloadMediaMessage(
        mess,
        'buffer',
        { }
      );
      return buffer;
    } catch (e) {
      await this.m.reply('An error occurred while trying to download');
      logger.error('error downloading media message', e);
      throw e;
    }
  } else {
    await this.m.reply('there is no message to download');
    return null;
  }
}

async unlockViewOnceToDM() {
  try {
    // Check if there's a quoted message
    if (!this.m.quoted) {
      const response = await this.m.callAI(
        "TOOLS",
        "Tell the user they need to reply to a view once message to unlock it."
      );
      await this.m.reply(response?.reply);
      return;
    }

    const quoted = this.m.quoted;
    
    // Check if it's actually a view once message
    const media = quoted?.viewOnceMessageV2?.message || quoted;
    const content = media?.imageMessage ||
                    media?.videoMessage ||
                    media?.audioMessage ||
                    quoted?.viewOnceMessageV2Extension?.message?.audioMessage;
    
    if (!content?.viewOnce && !quoted.viewOnceMessageV2 && !quoted.viewOnceMessageV2Extension) {
      const response = await this.m.callAI(
        "TOOLS",
        "Tell the user that the message they replied to is not a view once message."
      );
      await this.m.reply(response?.reply);
      return;
    }

    // Download the media using your existing function
    const buffer = await this.downloadMedia(); // Assuming you have this in your Functions class
    
    let mediaType = 'image';
    let options = {};
    
    // Determine media type and options
    if (content.mimetype?.includes('video')) {
      mediaType = 'video';
      if (content.caption) options.caption = content.caption;
    } else if (content.mimetype?.includes('audio')) {
      mediaType = 'audio';
      options.ptt = content.ptt || false;
      options.mimetype = content.mimetype;
    } else {
      if (content.caption) options.caption = content.caption;
    }
    
    // Send the unlocked media
    await this.sock.sendMessage(await getMainNumber(), {
      [mediaType]: buffer,
      ...options
    });
    
    const response = await this.m.callAI(
      "TOOLS",
      "Tell the user that you have successfully unlocked the view once message"
    );
    await this.m.reply(response?.reply);
    
  } catch (error) {
    console.error("Error unlocking view once message: ", error);
    const response = await this.m.callAI(
      "TOOLS",
      "Tell the user there was an error unlocking the view once message and they should try again."
    );
    await this.m.reply(response?.reply);
  }
}
async unlockViewOnce() {
  try {
    // Check if there's a quoted message
    if (!this.m.quoted) {
      const response = await this.m.callAI(
        "TOOLS",
        "Tell the user they need to reply to a view once message to unlock it."
      );
      await this.m.reply(response?.reply);
      return;
    }

    const quoted = this.m.quoted;
    
    // Check if it's actually a view once message
    const media = quoted?.viewOnceMessageV2?.message || quoted;
    const content = media?.imageMessage ||
                    media?.videoMessage ||
                    media?.audioMessage ||
                    quoted?.viewOnceMessageV2Extension?.message?.audioMessage;
    
    if (!content?.viewOnce && !quoted.viewOnceMessageV2 && !quoted.viewOnceMessageV2Extension) {
      const response = await this.m.callAI(
        "TOOLS",
        "Tell the user that the message they replied to is not a view once message."
      );
      await this.m.reply(response?.reply);
      return;
    }

    // Download the media using your existing function
    const buffer = await this.downloadMedia(); // Assuming you have this in your Functions class
    
    let mediaType = 'image';
    let options = {};
    
    // Determine media type and options
    if (content.mimetype?.includes('video')) {
      mediaType = 'video';
      if (content.caption) options.caption = content.caption;
    } else if (content.mimetype?.includes('audio')) {
      mediaType = 'audio';
      options.ptt = content.ptt || false;
      options.mimetype = content.mimetype;
    } else {
      if (content.caption) options.caption = content.caption;
    }
    
    // Send the unlocked media
    await this.sock.sendMessage(this.msg.key.remoteJid, {
      [mediaType]: buffer,
      ...options
    });
    
    const response = await this.m.callAI(
      "TOOLS",
      "Tell the user that you have successfully unlocked the view once message."
    );
    await this.m.reply(response?.reply);
    
  } catch (error) {
    console.error("Error unlocking view once message: ", error);
    const response = await this.m.callAI(
      "TOOLS",
      "Tell the user there was an error unlocking the view once message and they should try again."
    );
    await this.m.reply(response?.reply);
  }
}

async statusSaverCommand() {
    try {
        // Skip if message is from ourselves or is a status update
        if (
          this.m.jid === "status@broadcast"
        ) {
          return;
        }

        // Check if the message has a quoted message
        const quotedParticipant =
          this.msg.message?.extendedTextMessage?.contextInfo?.participant;
        const quotedRemoteJid =
          this.msg.message?.extendedTextMessage?.contextInfo?.remoteJid;
          const quotedMessage = this.m.quoted

        // Check if the quoted message is from status@broadcast
        if (this.m.quoted && quotedRemoteJid === "status@broadcast") {
          console.log("📱 Detected quoted status message");

          // Check if the quoted message contains media
          const hasMedia =
            this.m.quoted.imageMessage ||
            this.m.quoted.videoMessage ||
            this.m.quoted.audioMessage ||
            this.m.quoted.documentMessage ||
            this.m.quoted.stickerMessage;

          if (hasMedia) {
            console.log("📎 Quoted status contains media, downloading...");

            try {
             const buffer = await this.downloadMedia();
              if (buffer) {
                console.log("✅ Media downloaded successfully");
                // Determine media type and prepare message
                let mediaMessage = {};
                let fileName = "";

                if (quotedMessage.imageMessage) {
                  mediaMessage.image = buffer;
                  mediaMessage.caption =
                    quotedMessage.imageMessage.caption || "Status image";
                  fileName = "status_image.jpg";
                } else if (quotedMessage.videoMessage) {
                  mediaMessage.video = buffer;
                  mediaMessage.caption =
                    quotedMessage.videoMessage.caption || "Status video";
                  fileName = "status_video.mp4";
                } else if (quotedMessage.audioMessage) {
                  mediaMessage.audio = buffer;
                  mediaMessage.mimetype =
                    quotedMessage.audioMessage.mimetype || "audio/mpeg";
                  fileName = "status_audio.mp3";
                } else if (quotedMessage.documentMessage) {
                  mediaMessage.document = buffer;
                  mediaMessage.mimetype =
                    quotedMessage.documentMessage.mimetype;
                  mediaMessage.fileName =
                    quotedMessage.documentMessage.fileName || "status_document";
                  fileName =
                    quotedMessage.documentMessage.fileName || "status_document";
                } else if (quotedMessage.stickerMessage) {
                  mediaMessage.sticker = buffer;
                  fileName = "status_sticker.webp";
                }

                // Send the media back to the user
                await this.sock.sendMessage(await getMainNumber(), mediaMessage);
                console.log("📤 Media sent back to user successfully");
              } else {
                console.log("❌ Failed to download media");
              }
            } catch (downloadError) {
              console.error("❌ Error downloading media:", downloadError);

              // Send error message to user
              await this.sock.sendMessage(await getMainNumber(), {
                text: "❌ Failed to download the quoted status media. The status might have expired or been deleted.",
              });
            }
          } else {
            // Handle text-only status
            const statusText =
              quotedMessage.conversation ||
              quotedMessage.extendedTextMessage?.text ||
              "Status message (no text content)";

            console.log("📝 Quoted status is text-only");

            // Send the text status back to user
            await this.sock.sendMessage(await getMainNumber(), {
              text: `📱 Quoted Status:\n\n"${statusText}"\n\n_Originally posted by: ${
                quotedParticipant || "Unknown"
              }_`,
            });
          }
        }
      
    } catch (error) {
      console.error("❌ Error in message handler:", error);
    }
}

async turnOnAntilink() {
    try {
      if (!this.isInGroup()) {
        const response = await this.m.callAI(
          "TOOLS",
          "Tell the user: He is not in a group therefore he cannot use the antilink tool"
        );
        await this.m.reply(response?.reply);
        return;
      }

      // Check if the user issuing the command is an admin
      const userJid = this.msg.key.participant || this.msg.key.remoteJid;
      const isUserAdmin = await this.isAdmin(userJid);
      
      if (!isUserAdmin) {
        const response = await this.m.callAI(
          "TOOLS",
          "Tell the user: Only group admins can enable or disable antilink protection"
        );
        await this.m.reply(response?.reply);
        return;
      }

      // Check if the bot is an admin (needed to delete messages)
      const botJid = this.sock.user.lid;
      const isBotAdmin = await this.isAdmin(botJid);
      
      if (!isBotAdmin) {
        const response = await this.m.callAI(
          "TOOLS",
          "Tell the user: I need to be a group admin to use antilink protection effectively (to delete unwanted messages)"
        );
        await this.m.reply(response?.reply);
        return;
      }

      enableLinkDetection(this.m.jid);
      const response = await this.m.callAI(
        "TOOLS",
        "Tell the user antilink has been successfully activated"
      );
      await this.m.reply(response?.reply)
    } catch (error) {
      console.error("Antilink error Occured: ", error)
      const response = await this.m.callAI(
        "TOOLS",
        "Tell the user there was an error enabling antilink. Please try again."
      );
      await this.m.reply(response?.reply)
    }
  }

  async turnOffAntilink() {
    try {
      if (!this.isInGroup()) {
        const response = await this.m.callAI(
          "TOOLS",
          "Tell the user: He is not in a group therefore he cannot use the antilink tool"
        );
        await this.m.reply(response?.reply);
        return;
      }

      // Check if the user issuing the command is an admin
      const userJid = this.msg.key.participant || this.msg.key.remoteJid;
      const isUserAdmin = await this.isAdmin(userJid);
      
      if (!isUserAdmin) {
        const response = await this.m.callAI(
          "TOOLS",
          "Tell the user: Only group admins can enable or disable antilink protection"
        );
        await this.m.reply(response?.reply);
        return;
      }

      disableLinkDetection(this.m.jid);
      const response = await this.m.callAI(
        "TOOLS",
        "Tell the user antilink has been successfully deactivated"
      );
      await this.m.reply(response?.reply)
    } catch (error) {
      console.error("Antilink error Occured: ", error)
      const response = await this.m.callAI(
        "TOOLS",
        "Tell the user there was an error disabling antilink. Please try again."
      );
      await this.m.reply(response?.reply)
    }
  }

}
module.exports = { getMainNumber, Functions,getBotName, isGroup,getUsersPlan ,isGroupUser };
