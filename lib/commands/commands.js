const { default: axios } = require("axios");
const { register } = require("../register");
const sticker = require('../sticker')
const tiktok_url = "https://a-y-a-n-o-k-o-j-i-dnd-api.hf.space/dl/tiktok"
const instagram_url = "https://a-y-a-n-o-k-o-j-i-dnd-api.hf.space/dl/insta"
const facebook_url = "https://a-y-a-n-o-k-o-j-i-dnd-api.hf.space/dl/fb"
const youtube_url = "https://a-y-a-n-o-k-o-j-i-dnd-api.hf.space/dl/ytdl"
const path = require("path");
const filePath = path.join(__dirname,"..","temp",`${Date.now()}.jpg`);
const fs = require('fs').promises
const metaData = 'Sophia Assistant,STL';
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

register({
  name: "search-anime",
  plan: "lite",
  execute: async function searchAnime(mClass, param) {
    const response = await mClass.f.searchAnime(param.query);
    if (response.length === 0) {
      await mClass.aiReply("Say: Anime was not found and add your tone");
    }

    const animeData = `Here's the anime info:
${JSON.stringify(response[0], null, 2)}
Please format this nicely, answer the user's question and add your tone..`;
await mClass.aiReply(animeData)
  },
});

register({
  name:"tag-message",
  plan:"lite",
  execute:async function tagMessage(mClass,param) {
    await mClass.f.tagMessage(param.message)
  }
})

register({
  name:"download-tiktok-video",
  plan:"lite",
  execute:async function downloadTiktok(mClass,param) {
    try {
      const response = await axios.get(tiktok_url,{
        params:{
          "url":param.link
        }
      })
      console.log(response.data)
      if(!response.data?.download_url){
        return await mClass.aiReply("Say: There is No Download Link available for this tiktok link maybe they should try again and use ur tone to make your response unique")
      }
      await mClass.sendFile({
        video:{
        url: response.data?.download_url
      }
    })
    await mClass.aiReply("Say:The tiktok video downloaded successfully and add your tone")
    } catch (error) {
      console.error("Titkok downloader error",error)
      const response = await mClass.callAI("TEST","say : An error occured while downloading the tiktok video and and use ur tone to make your response unique");
      await mClass.reply(response?.reply);
    }
  }
})
register({
  name:"download-instagram-video",
  plan:"lite",
  execute:async function downloadInstagram(mClass,param) {
    try {
      const response = await axios.get(instagram_url,{
        params:{
          "url":param.link
        }
      })
      console.log(response.data)
      if(!response.data?.download_url){
        return await mClass.aiReply("Say: There is No Download Link available for this instagram link maybe they should try again and use ur tone to make your response unique")
      }
      await mClass.sendFile({
        video:{
        url: response.data?.download_url
      }
    })
    await mClass.aiReply("Say:The instagram video downloaded successfully and add your tone")
    } catch (error) {
      console.error("Instagram downloader error",error)
      const response = await mClass.callAI("TEST","say : An error occured while downloading the tiktok video and and use ur tone to make your response unique");
      await mClass.reply(response?.reply);
    }
  }
})

register({
  name: "create-sticker",
  plan: "lite",
  execute: async function createSticker(mClass) {
    const image = mClass.quoted?.imageMessage;
    const video = mClass.quoted?.videoMessage;
    if (image) {
      try {
        const buffer = await mClass.f.downloadMedia();
        await fs.writeFile(filePath,buffer)
        const webPBuffer = await sticker.createImgSticker(filePath,metaData)
        await mClass.sendSticker(webPBuffer)
        await fs.unlink(filePath)
        const response = await mClass.callAI("TEST","say: Sticker created successfully, and and use ur tone to make your response unique")
        await mClass.reply(response?.reply);
      } catch (error) {
        console.error('error handling sticker',error)
        const response = await mClass.callAI("TEST","say : An error occured while creating the sticker and and use ur tone to make your response unique");
        await mClass.reply(response?.reply);
      }
    } else if(video){
        try {
            const buffer = await mClass.f.downloadMedia();
            const webPbuffer = await sticker.createVidSticker(buffer,metaData);
            await mClass.sendSticker(webPbuffer);
            const response = await mClass.callAI("TEST","say: Sticker created successfully,and use ur tone to make your response unique")
            await mClass.reply(response?.reply);
        } catch (error) {
             console.error("error handling sticker", error);
             const response = await mClass.callAI(
               "TEST",
               "say : An error occured while creating the sticker and use ur tone to make your response unique"
             );
             await mClass.reply(response?.reply);
        }
    } else {
         const response = await mClass.callAI(
               "TEST",
               "say : I couldn't find an image or video and and use ur tone to make your response unique"
             );
             await mClass.reply(response?.reply)
    }
  },
});