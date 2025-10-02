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

async function runCommand(name,m,params) {
  const cmd = getCommand(name)
  console.log(name)
  console.log(cmd)
  if (!cmd) {
    return await m.sock.sendMessage(m.jid, { text: "❌ Command not found!" })
  }

  // check user’s plan
  const userPlan = getUsersPlan() // your own function
  if (cmd.plan && cmd.plan !== userPlan) {
    return await m.sock.sendMessage(m.jid, { 
      text: "⚠️ You do not have access to this command. Upgrade your plan to use it." 
    })
  }

  // run the command
  await cmd.execute(m,params)
}


module.exports = { register,getCommand,commands,runCommand}