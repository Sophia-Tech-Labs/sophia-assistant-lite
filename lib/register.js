const { getUsersPlan } = require("./functions")

// register.js
const commands = new Map()

function register({ name, plan, execute }) {
  if (!name || !execute) throw new Error("Command must have a name and an execute function")
  commands.set(name, { plan, execute })
}

function getCommand(name) {
  return commands.get(name)
}

// Define plan hierarchy (higher number = higher tier)
const PLAN_LEVELS = {
  lite: 1,
  basic: 2,
  premium: 3
};

async function runCommand(name, m, params) {
  const cmd = getCommand(name);
  if (!cmd) {
    return await m.sock.sendMessage(m.jid, { text: "❌ Command not found!" });
  }

  // Check user's plan
  const userPlan = await getUsersPlan(); // your own function
  
  // If command requires a specific plan, check if user has access
  if (cmd.plan) {
    const requiredLevel = PLAN_LEVELS[cmd.plan];
    const userLevel = PLAN_LEVELS[userPlan];
    
    // User needs to have a plan level >= required level
    if (!userLevel || userLevel < requiredLevel) {
      return await m.sock.sendMessage(m.jid, { 
        text: `⚠️ You do not have access to this command. This requires the '${cmd.plan}' plan or higher. Upgrade your plan to use it.` 
      });
    }
  }

  // Run the command
  await cmd.execute(m, params);
}


module.exports = { register,getCommand,commands,runCommand}