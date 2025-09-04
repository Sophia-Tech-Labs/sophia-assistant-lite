const Message = require("./base");
const Database = require("better-sqlite3");
const newdb = new Database("function.db");
const db = require("./db");
const WCGIntegration = require('../wcg');
const axios = require("axios");
async function getMainNumber() {
	const apikey = process.env.SOPHIA_API_KEY;
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
        "Tell the user that you have successfully tagged all members of the group."
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
}
module.exports = { getMainNumber, Functions, isGroup, isGroupUser };
