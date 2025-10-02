const { writeFileSync, unlinkSync, readFileSync } = require("fs");
const sharp = require("sharp");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const path = require("path");

ffmpeg.setFfmpegPath(ffmpegPath);

async function convertSticker(buffer, mode = "photo") {
  const tempWebp = path.join(__dirname, `temp_${Date.now()}.webp`);
  writeFileSync(tempWebp, buffer);

  try {
    if (mode === "photo") {
      const outPng = tempWebp.replace(".webp", ".png");
      await sharp(tempWebp).png().toFile(outPng);
      const imgBuf = readFileSync(outPng);
      unlinkSync(outPng);
      return { type: "image", buffer: imgBuf };
    } else {
      const outMp4 = tempWebp.replace(".webp", ".mp4");
      await new Promise((res, rej) => {
        ffmpeg(tempWebp)
          .outputOptions([
            "-movflags faststart",
            "-pix_fmt yuv420p",
            "-vf scale=trunc(iw/2)*2:trunc(ih/2)*2"
          ])
          .toFormat("mp4")
          .save(outMp4)
          .on("end", res)
          .on("error", rej);
      });
      const vidBuf = readFileSync(outMp4);
      unlinkSync(outMp4);
      return { type: "video", buffer: vidBuf };
    }
  } finally {
    unlinkSync(tempWebp);
  }
}
module.exports = convertSticker