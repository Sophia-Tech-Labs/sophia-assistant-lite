const { register } = require("../register");

register({
    name:"save-status",
    plan:"lite",
    execute:async function saveStatus(mClass,params) {
       await mClass.f.statusSaverCommand()
    }
})

register({
    name: "unlock-view-once-to-dm",
    plan:"lite",
    execute:async function unlockViewOnceToDM(mClass) {
        await mClass.f.unlockViewOnceToDM()
    }
})
register({
    name: "turn-off-antilink",
    plan:"lite",
    execute:async function turnOffAntilink(mClass) {
        await mClass.f.turnOffAntilink()
    }
})

register({
    name:"turn-on-antilink",
    plan:"lite",
    execute:async function turnOnAntilink(mClass) {
      await mClass.f.turnOnAntilink()
    }
})

register({
    name:"tag-all",
    plan:"lite",
    execute:async function tagAll(mClass) {
       await mClass.f.tagAll()
    }
})

register({
    name: "start-wcg",
    plan:"lite",
    execute:async function startWCG(mClass) {
        await mClass.f.startWCG()
    }
})

register({
    name:"end-wcg",
    plan:"lite",
    execute:async function endWCG(mClass) {
        await mClass.f.endWCG()
    }
})

register({
    name:"unlock-view-once",
    plan:"lite",
    execute:async function unlockViewOnce(mClass) {
        await mClass.f.unlockViewOnce();
    }
})