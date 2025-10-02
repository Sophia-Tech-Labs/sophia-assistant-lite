const { isLinkDetectionEnabled } = require("./antilink");
const {
  incrementWarning,
  resetWarning,
  getWarningCount,
} = require("./libtest3");
const { jidDecode } = require("baileys");

// Helper function to decode JID
const decodeJid = (jid) => {
  if (!jid) return jid;
  if (/:\d+@/gi.test(jid)) {
    const decode = jidDecode(jid) || {};
    return decode.user && decode.server
      ? `${decode.user}@${decode.server}`
      : jid;
  } else {
    return jid;
  }
};

// Helper function to check if bot is admin
const isBotAdmin = async (sock, groupJid) => {
  try {
    const groupMetadata = await sock.groupMetadata(groupJid);
    const botJid = decodeJid(sock.user.lid);

    const groupAdmins = groupMetadata.participants
      .filter((participant) => participant.admin !== null)
      .map((participant) => decodeJid(participant.id));

    return groupAdmins.includes(botJid);
  } catch (error) {
    console.error("Error checking bot admin status:", error);
    return false;
  }
};

// Helper function to check if user is admin
const isUserAdmin = async (sock, groupJid, userJid) => {
  try {
    const groupMetadata = await sock.groupMetadata(groupJid);
    const decodedUserJid = decodeJid(userJid);

    const groupAdmins = groupMetadata.participants
      .filter((participant) => participant.admin !== null)
      .map((participant) => decodeJid(participant.id));

    return groupAdmins.includes(decodedUserJid);
  } catch (error) {
    console.error("Error checking user admin status:", error);
    return false;
  }
};

const setupLinkDetection = (sock) => {
  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const message of messages) {
      const groupJid = message.key.remoteJid;

      // Ignore non-group messages or bot's own messages
      if (!groupJid.endsWith("@g.us") || message.key.fromMe) continue;

      // Check if link detection is enabled for this group
      if (isLinkDetectionEnabled(groupJid)) {
        const msgText =
          message.message?.conversation ||
          message.message?.extendedTextMessage?.text ||
          "";

        // Check for links in the message
        const linkRegex = /(https?:\/\/[^\s]+)/g;
        if (linkRegex.test(msgText)) {
          console.log(`Detected link in group ${groupJid}: ${msgText}`);

          // Get participant details
          const participant =
            message?.key?.participantPn || message.key.remoteJid;

          // Check if the user who sent the link is an admin
          const userIsAdmin = await isUserAdmin(sock, groupJid, participant);

          if (userIsAdmin) {
            // Skip link detection for admins
            continue;
          }

          // Check if bot is admin before trying to delete message
          const botIsAdmin = await isBotAdmin(sock, groupJid);

          if (!botIsAdmin) {
            // Bot is not admin, send warning but can't delete message or remove user
            await sock.sendMessage(groupJid, {
              text: `⚠️ Links are not allowed here!\n\nNote: I need admin privileges to delete messages and manage group members effectively. Please make me an admin for full antilink protection.`,
            });
            continue;
          }

          // Bot is admin, proceed with full antilink protection
          try {
            // Delete the message
            await sock.sendMessage(groupJid, { delete: message.key });
          } catch (deleteError) {
            console.error("Failed to delete message:", deleteError);
            // Continue with warning even if deletion fails
          }

          // Increment warning count
          const warningCount = incrementWarning(groupJid, participant);

          // Warn the user
          await sock.sendMessage(groupJid, {
            text: `@${
              participant.split("@")[0]
            }, links are not allowed here!\nWarning count: ${warningCount}/3`,
            mentions: [participant],
          });

          // Take action based on warning count
          if (warningCount >= 3) {
            // Double-check bot is still admin before removal
            const stillAdmin = await isBotAdmin(sock, groupJid);

            if (stillAdmin) {
              try {
                // Remove the participant
                await sock.groupParticipantsUpdate(
                  groupJid,
                  [participant],
                  "remove"
                );
                await sock.sendMessage(groupJid, {
                  text: `@${
                    participant.split("@")[0]
                  } has been removed for sending links too many times.`,
                  mentions: [participant],
                });

                // Reset warnings after removal
                resetWarning(groupJid, participant);
              } catch (removeError) {
                console.error("Failed to remove participant:", removeError);
                await sock.sendMessage(groupJid, {
                  text: `⚠️ Failed to remove @${
                    participant.split("@")[0]
                  } - I may have lost admin privileges or there was an error.\n\nWarning count has been reset. Please check my admin status.`,
                  mentions: [participant],
                });
                // Reset warnings since removal failed
                resetWarning(groupJid, participant);
              }
            } else {
              // Bot lost admin privileges
              await sock.sendMessage(groupJid, {
                text: `⚠️ @${
                  participant.split("@")[0]
                } should be removed for violating link policy (3/3 warnings), but I'm no longer an admin!\n\nPlease make me an admin again for full antilink protection, or manually remove the user.`,
                mentions: [participant],
              });
              // Don't reset warnings so the count persists when admin is restored
            }
          }
        }
      }
    }
  });
};

module.exports = { setupLinkDetection };
