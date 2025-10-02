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
        mClass.f.turnOffAntilink()
    }
})