const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const logging = require("../lib/logging");
const { readFileSync, writeFileSync, unlinkSync } = require("fs");
const logger = require("pino");
const { join } = require("path");
const { tmpdir } = require("os");
const Crypto = require("crypto");
const ff = require("fluent-ffmpeg");
const webp = require("node-webpmux");
const pm2 = require("pm2");

const saveUsers = require("../lib/saveUsers");

module.exports = async ({ reybot, msg, isGroup, connectReybotWhatsapp }) => {
  const users = JSON.parse(
    readFileSync(join(__dirname, "../database/users.json"))
  );
  const contacts = JSON.parse(
    readFileSync(join(__dirname, "../database/contacts.json"))
  );

  if (isGroup) {
    /*///////
     * {*} Only fromMe {*}
     * //*/
    if (msg.key) {
      const userId = msg.key.participant;
      const fromMe = msg.key.fromMe;
      const pushName = msg.pushName;
      saveUsers({ userId });
      const groupId = msg.key.remoteJid;
      let metadataGroup;
      let groupParticipants;
      try {
        metadataGroup = await reybot.groupMetadata(groupId);
        groupParticipants = metadataGroup.participants.map((part) => part.id);
      } catch (err) {
        logging("error", "Error Get Metadata Group", err);
      }
      const dataUsers = groupParticipants
        ? groupParticipants.filter((part) => !contacts.includes(part))
        : null;

      if (msg.message) {
        /*///////
         * {*} Messages Types Text / Conversation {*}
         * //*/
        const msgTxt = msg.message.extendedTextMessage
          ? msg.message.extendedTextMessage.text
          : msg.message.conversation;
        if (msg.message && msgTxt) {
          /*//////
           * {*} Get Info Groups {*}
           * //*/
          const regexInfo = new RegExp(/^\.Info/i);
          if (regexInfo.test(msgTxt)) {
            if (!fromMe) return;
            logging("info", `Get Message`, msgTxt);
            try {
              const templateText = `*Group Name: ${metadataGroup.subject}*\n*Group ID: ${metadataGroup.id}*\n*Group Owner: ${metadataGroup.owner}*`;
              await reybot.sendMessage(userId, {
                text: templateText,
              });
            } catch (err) {
              logging("error", "Error get Info Group", err);
            }
          }
          /*//////
           * {*} End Get Info Groups {*}
           * //*/
          /*//////
           * {*} Start Push Contact Fitur Groups {*}
           * //*/
          const regexPushCont = new RegExp(
            /^\.pushCont(act)?\s([\s\S]+)\|(\d)/i
          );
          const matchPushCont = regexPushCont.exec(msgTxt);
          if (matchPushCont) {
            if (!fromMe) return;
            logging("info", "Get Message", msgTxt);
            const messagePushCont = matchPushCont[2];
            const delayPushCont = parseInt(`${matchPushCont[3]}000`);
            if (isNaN(delayPushCont)) return;
            try {
              await reybot.sendMessage(userId, {
                text: `*Push Contact Start*\n*Target: ${dataUsers.length} users*`,
              });
              let sent = 0;
              const loopBroadcast = setInterval(async () => {
                if (dataUsers.length === sent) {
                  await reybot.sendMessage(userId, {
                    text: `*Push Contact Selesai*\n*Pesan Berhasil dikirim ke _${sent}_ users*`,
                  });
                  logging(
                    "success",
                    `Push Contact Successfully`,
                    `Sent to ${sent} Users`
                  );
                  clearInterval(loopBroadcast);
                } else {
                  await reybot.sendMessage(dataUsers[sent], {
                    text: `${messagePushCont}`,
                  });
                  sent++;
                  logging(
                    "error",
                    `Push Contact sent ${sent}`,
                    dataUsers[sent - 1]
                  );
                }
              }, delayPushCont);
            } catch (err) {
              logging("error", "Failed to Push Contact", err);
            }
          }
          /*//////
           * {*} End Push Contact Fitur Groups {*}
           * //*/
          /*//////
           * {*} Clone Group {*}
           * //*/
          const cloneRegex = new RegExp(/^\.Clone\b\s(.+)/i);
          const matchCloneRegex = cloneRegex.exec(msgTxt);
          if (matchCloneRegex) {
            if (!fromMe) return;
            logging("info", "Get Message", msgTxt);
            try {
              const nameGroup = matchCloneRegex[1];
              const groupPict = readFileSync(
                join(__dirname, "../groupPict.jpeg")
              );
              const group = await reybot.groupCreate(`${nameGroup}`, [
                `${groupParticipants[0]}`,
              ]);
              await reybot.groupSettingUpdate(group.id, "locked");
              await reybot.sendMessage(group.id, {
                caption: `*Hallo Selamat datang semua di Group ${nameGroup}*`,
                image: groupPict,
                headerType: 4,
              });
              logging("success", "Successfully Create Group", nameGroup);
              logging("info", "Waiting for adding members", nameGroup);
              let index = 0;
              const loopAddUsers = setInterval(async () => {
                if (groupParticipants.length === index) {
                  logging(
                    "success",
                    "Cloning Successfully",
                    `Name: ${nameGroup} With ${index} Users`
                  );
                  clearInterval(loopAddUsers);
                } else {
                  await reybot.groupParticipantsUpdate(
                    group.id,
                    [`${groupParticipants[index]}`],
                    "add"
                  );
                  index++;
                  logging(
                    "error",
                    `Adding users in Group ${nameGroup}`,
                    groupParticipants[index - 1]
                  );
                }
              }, 3000);
            } catch (err) {
              logging("error", "Error Cloning group", err);
            }
          }
          /*///////
           * {*} End Clone Group {*}
           */ //*/
          /*//////
           * {*} Save All Members Group to Database Users {*}
           */ //*/
          const regexSaveMembers = new RegExp(/^\.Sa?ve?Mem(ber)?\b/i);
          if (regexSaveMembers.test(msgTxt)) {
            if (!fromMe) return;
            logging("info", "Get Message", msgTxt);
            let i = 0;
            const loopSaveMembers = setInterval(() => {
              const isUsersExist = users.some((user) => user === dataUsers[i]);
              if (!isUsersExist) {
                if (i >= dataUsers.length) {
                  logging(
                    "success",
                    "Save Members",
                    "Save All Members To Database Users, Successfully"
                  );
                  clearInterval(loopSaveMembers);
                } else {
                  users.push(dataUsers[i]);
                  writeFileSync(
                    join(__dirname, "../database/users.json"),
                    JSON.stringify(users)
                  );
                  logging("primary", "Save Members Groups", `${dataUsers[i]}`);
                }
              }
              i++;
            }, 1000);
          }
          /*/////
           * {*} End Save All Members Group to Database Users {*}
           */ //*/
        }
        /*//////
         * {*} End Messages Types Text / Conversation {*}
         * //*/
        /*//////
         * {*} Messages Types Images {*}
         * //*/
        if (msg.message && msg.message.imageMessage) {
          const caption = msg.message.imageMessage.caption;
          /*//////
           * {*} Start Push Contact With Image Message
           * //*/
          const regexPushContWithImage = new RegExp(
            /^\.pushCont(act)?\s([\s\S]+)\|(\d)/i
          );
          const matchPushContWithImage = regexPushContWithImage.exec(caption);
          if (matchPushContWithImage) {
            if (!fromMe) return;
            logging("info", "Get Message", caption);
            const captionPushContactWithImage = matchPushContWithImage[2];
            const delayPushContWithImage = parseInt(
              `${matchPushContWithImage[3]}000`
            );
            if (isNaN(delayPushContWithImage)) return;
            const imgPushContactWithImage = await downloadMediaMessage(
              msg,
              "buffer",
              {},
              { logger }
            );
            try {
              await reybot.sendMessage(userId, {
                text: `*Push Contact Start*\n\n*Target: ${dataUsers.length} users*`,
              });
              let sent = 0;
              const loopPushContact = setInterval(async () => {
                if (dataUsers.length === sent) {
                  await reybot.sendMessage(userId, {
                    text: `*Push Contact Selesai*\n*Pesan Berhasil dikirim ke _${sent}_ users*`,
                  });
                  logging(
                    "success",
                    `Push Contact Successfully`,
                    `Sent to ${sent} Users`
                  );
                  clearInterval(loopPushContact);
                } else {
                  await reybot.sendMessage(dataUsers[sent], {
                    caption: captionPushContactWithImage,
                    image: imgPushContactWithImage,
                    headerType: 4,
                  });
                  sent++;
                  logging(
                    "error",
                    `Push Contact sent ${sent}`,
                    dataUsers[sent - 1]
                  );
                }
              }, delayPushContWithImage);
            } catch (err) {
              logging("error", "Error Push Contact", err);
            }
          }
          /*///////
           * {*} End Push Contact With Images {*}
           */ //*/
          /*///////
           * {*} Create Sticker {*}
           */ //*/
          const stickerRegex = new RegExp(/^\.S(ticker)?\b/i);
          if (stickerRegex.test(caption)) {
            if (!fromMe) return;
            logging("info", "Get Message", caption);
            try {
              const img = await downloadMediaMessage(
                msg,
                "buffer",
                {},
                { logger }
              );
              const sticker = await writeExifImg(img, {
                packname: "ReybotVIP ヅ",
                author: `${pushName}`,
              });
              await reybot.sendMessage(
                groupId,
                { sticker: { url: sticker } },
                { quoted: msg }
              );
            } catch (err) {
              logging("error", "Error create sticker", err);
            }
          }
          /*///////
           * {*} End Sticker {*}
           */ //*/
        }
        /*//////
         * {*} End Message Types Image {*}
         * //*/
      }
    }
    return;
  } else {
    if (msg.key) {
      const userId = msg.key.remoteJid;
      saveUsers({ userId });
      const pushName = msg.pushName;
      const fromMe = msg.key.fromMe;
      if (msg.message) {
        /*///////
         * {*} Message Type Text {*}
         */ //*/
        const msgTxt = msg.message.extendedTextMessage
          ? msg.message.extendedTextMessage.text
          : msg.message.conversation;
        if (msg.message && msgTxt) {
          /*///////
           * {*} Start Me {*}
           */ //*/
          const meRegex = new RegExp(/^\.Me(nu)?\b/i);
          if (meRegex.test(msgTxt)) {
            if (!fromMe) return;
            logging("info", `Get Message`, msgTxt);
            try {
              const templateMessage = {
                image: {
                  url: join(__dirname, "../groupPict.jpeg"),
                },
                caption: `*ReybotVIP ヅ* | Menu\n\n*_Groups Chat:_*\n• .Info = Informasi Group\n• .pushContact [pesan]|[delay] = Push Contact (Kirim Pesan Ke Semua Member Group)\n• .pushContact [pesan]|[delay] = Push Contact (Kirim Pesan Ke Semua Member Group Dengan Gambar)\n• .Clone [nama group] = Duplikat Group Beserta Membernya\n• .SaveMember = Save Semua Member Group Ke Database Users\n• .Sticker = Membuat Sticker Di Group (Dengan Gambar)\n\n*_Private Chat_*\n• .Menu = Menampilkan Semua Fitur\n• .Restart = Restart Server\n• .pushContact [pesan]|[delay] = Push Contact (Kirim Pesan Ke Semua Orang Yang Ada Di Database Users)\n• .pushContact [pesan]|[delay] = Push Contact (Kirim Pesan Ke Semua Orang Yang Ada Di Database Users Dengan Gambar)\n• .Save [nama] = Auto Generate Contact\n• .Sticker = Membuat Sticker (Dengan Gambar)\n\n*Tutorial:* https://www.youtube.com/@bayumahadika`,
              };
              await reybot.sendMessage(userId, templateMessage, {
                quoted: msg,
              });
            } catch (err) {
              logging("error", "Error endMessage", err);
            }
          }
          /*///////
           * {*} End Me
           */ //*/
          /*//////
           * {*} Restart Server {*}
           */ //*/
          const regexReload = new RegExp(/^\.Rest(art)?\b/i);
          if (regexReload.test(msgTxt)) {
            if (!fromMe) return;
            logging("info", `Get Message`, msgTxt);
            try {
              pm2.restart("all", async (err) => {
                if (err) {
                  await reybot.sendMessage(
                    userId,
                    { text: "*Error Restarting _Server_*" },
                    { quoted: msg }
                  );
                } else {
                  await reybot.sendMessage(userId, {
                    text: "*Restarting _Server_ Successfully*",
                  });
                }
              });
            } catch (err) {
              logging("error", "Can't Reload Server", err);
            }
          }
          /*///////
           * {*} End Restart Socket
           */ //*/
          /*/////
           * {*} Start Push Contact {*}
           */ //*/
          const regexPushCont = new RegExp(
            /^\.pushCont(act)?\s([\s\S]+)\|(\d)/i
          );
          const matchPushCont = regexPushCont.exec(msgTxt);
          if (matchPushCont) {
            if (!fromMe) return;
            logging("info", `Get Message`, msgTxt);
            const messagePushCont = matchPushCont[2];
            const delayPushCont = parseInt(`${matchPushCont[3]}000`);
            if (isNaN(delayPushCont)) return;
            pushContact(reybot, msg, userId, messagePushCont, delayPushCont);
          }
          /*///////
           * {*} End Broadcast
           */ //*/
          /*//////
           * {*} Start Save Contacts {*}
           */ //*/
          const contactRegex = new RegExp(/^\.Sa?ve?\s(.+)/i);
          if (contactRegex.test(msgTxt)) {
            if (!fromMe) return;
            logging("info", `Get Message`, msgTxt);
            const contactName = msgTxt.replace(/^\.Sa?ve?\s*/i, "");
            try {
              await reybot.sendMessage(
                userId,
                {
                  sticker: {
                    url: join(__dirname, "../alzf1gcip.webp"),
                  },
                },
                { quoted: msg }
              );
              const isContactExist = contacts.some(
                (contact) => contact === userId
              );
              if (!isContactExist) {
                contacts.push(userId);
                writeFileSync(
                  join(__dirname, "../database/contacts.json"),
                  JSON.stringify(contacts)
                );
                const vcard =
                  "BEGIN:VCARD\n" +
                  "VERSION:3.0\n" +
                  `FN:${contactName}\n` +
                  `TEL;type=CELL;type=VOICE;waid=${userId.split("@")[0]}:+${
                    userId.split("@")[0]
                  }\n` +
                  "END:VCARD";
                await reybot.sendMessage(userId, {
                  contacts: {
                    displayName: `${contactName}`,
                    contacts: [{ vcard }],
                  },
                });
                await reybot.sendMessage(userId, {
                  text: `*DONE Svb _${pushName}_*`,
                });
              } else {
                await reybot.sendMessage(userId, {
                  text: "*Nomor ini sudah tersimpan* 🤨",
                });
              }
            } catch (err) {
              logging("error", "Error sendMessage", err);
            }
          }
          /*///////
           * {*} End Save Contact {*}
           */ //*/
          /*//////
           * {*} Snap Group {*}
           */ //*/
          const snapGroupRegex = new RegExp(/^\.snapGroup\s(.+)\|(.+)/i);
          if (snapGroupRegex.test(msgTxt)) {
            if (!fromMe) return;
            logging("info", `Get Message`, msgTxt);
            const matchSnap = msgTxt.match(snapGroupRegex);
            const groupTarget = matchSnap[1];
            const groupAudience = matchSnap[2];
            console.log(groupTarget, groupAudience);
            if (!groupTarget.endsWith("@g.us")) {
              try {
                await reybot.sendMessage(
                  userId,
                  { text: "*Group _Target_ tidak valid*" },
                  { quoted: msg }
                );
              } catch (err) {
                logging("error", "Error sendMessage", err);
              }
            } else if (!groupAudience.endsWith("@g.us")) {
              try {
                await reybot.sendMessage(
                  userId,
                  { text: "*Group _Tujuan_ tidak valid*" },
                  { quoted: ms }
                );
              } catch (err) {
                logging("error", "Error sendMessage", err);
              }
            } else {
              try {
                const metadataGroupTarget = await reybot.groupMetadata(
                  groupTarget
                );
                const metadataGroupAudience = await reybot.groupMetadata(
                  groupAudience
                );
                if (!metadataGroupTarget) {
                  try {
                    await reybot.sendMessage(
                      userId,
                      {
                        text: "*Group _Target_ tidak ditemukan*",
                      },
                      { quoted: msg }
                    );
                  } catch (err) {
                    logging("error", "Error sendMessage", err);
                  }
                }
                if (!metadataGroupAudience) {
                  try {
                    await reybot.sendMessage(
                      userId,
                      {
                        text: "*Group _Tujuan_ tidak ditemukan*",
                      },
                      { quoted: msg }
                    );
                  } catch (err) {
                    logging("error", "Error sendMessage", err);
                  }
                }
                const participantsGroupTarget =
                  metadataGroupTarget.participants.map((part) => part.id);
                const participantsGroupAudience =
                  metadataGroupAudience.participants.map((part) => part.id);
                if (participantsGroupAudience.length > 900) {
                  try {
                    await reybot.sendMessage(
                      userId,
                      {
                        text: `*Anggota Group Tujuan Hampir Penuh*`,
                      },
                      { quoted: msg }
                    );
                  } catch (err) {
                    logging("error", "Error sendMessage", err);
                  }
                }
              } catch (err) {
                logging("error", "Failed Snapping Group", err);
              }
            }
          }
          /*/////
           * {*} Ends Snap Group {*}
           */ //*/
        }
        /*//////
         * {*} End Message Types Text / Conversation {*}
         */ //*/
        /*//////
         * {*} Start Chat Types Image {*}
         */ //*/
        const msgImg = msg.message.imageMessage;
        if (msg.message && msgImg) {
          const caption = msg.message.imageMessage.caption;
          /*////////
           * {*} Push Contact With Images {*}
           */ //*/
          const regexPushCont = new RegExp(
            /^\.pushCont(act)?\s([\s\S]+)\|(\d)/i
          );
          const matchPushCont = regexPushCont.exec(caption);
          if (matchPushCont) {
            if (!fromMe) return;
            logging("info", "Get Messages", caption);
            const captionPushCont = matchPushCont[2];
            const delayPushCont = parseInt(`${matchPushCont[3]}000`);
            if (isNaN(delayPushCont)) return;
            try {
              const imgPushContact = await downloadMediaMessage(
                msg,
                "buffer",
                {},
                { logger }
              );
              pushContact(
                reybot,
                msg,
                userId,
                captionPushCont,
                delayPushCont,
                imgPushContact
              );
            } catch (err) {
              logging("info", "Error Push Contact", err);
            }
          }
          /*///////
           * {*} End Broadcast With Images {*}
           */ //*/
          /*///////
           * {*} Create Sticker {*}
           */ //*/
          const stickerRegex = new RegExp(/^\.S(ticker)?\b/i);
          if (stickerRegex.test(caption)) {
            if (!fromMe) return;
            logging("info", "Get Messages", caption);
            try {
              const img = await downloadMediaMessage(
                msg,
                "buffer",
                {},
                { logger }
              );
              const sticker = await writeExifImg(img, {
                packname: "ReybotVIP ヅ",
                author: `${pushName}`,
              });
              await reybot.sendMessage(
                userId,
                { sticker: { url: sticker } },
                { quoted: msg }
              );
            } catch (err) {
              logging("error", "Can't Create Sticker", err);
            }
          }
          /*//////
           * {*} End Create Sticker {*}
           */ //*/
        }
        /*////////
         * {*} End Message Types Image {*}
         */ //*/
      }
    }
  }
  return;
};

const pushContact = async (
  reybot,
  msg,
  userId,
  message,
  delayPushCont,
  imgMessage
) => {
  const users = JSON.parse(
    readFileSync(join(__dirname, "../database/users.json"))
  );
  const contacts = JSON.parse(
    readFileSync(join(__dirname, "../database/contacts.json"))
  );
  let sent = 1;
  const filteredUsers = users.filter((user) => !contacts.includes(user));
  if (filteredUsers.length <= 0) {
    try {
      await reybot.sendMessage(
        userId,
        {
          text: `*Database Users ${filteredUsers.length}*\n\nSilahkan join kebeberapa *Group*, Untuk mendapatkan lebih banyak target push contact`,
        },
        { quoted: msg }
      );
    } catch (err) {
      logging("error", "Error sendMessage", err);
    }
  } else {
    try {
      await reybot.sendMessage(
        userId,
        {
          text: `*Push Contact start*\n*Target: ${filteredUsers.length} users*`,
        },
        { quoted: msg }
      );
    } catch (err) {
      logging("error", "Error sendMessage", err);
    } finally {
      const loopPushContact = setInterval(async () => {
        if (!imgMessage) {
          try {
            await reybot.sendMessage(filteredUsers[0], {
              text: `${message}`,
            });
            logging("error", `Push Contact sent ${sent}`, filteredUsers[0]);
          } catch (err) {
            logging("error", `Push Contact Error ${sent}`, err);
          }
        } else {
          try {
            await reybot.sendMessage(filteredUsers[0], {
              caption: message,
              image: imgMessage,
              headerType: 4,
            });
            logging("error", `Push Contact sent ${sent}`, filteredUsers[0]);
          } catch (err) {
            logging("error", `Push Contact Error ${sent}`, err);
          }
        }
        if (0 === filteredUsers.length - 1) {
          try {
            await reybot.sendMessage(userId, {
              text: `*Push Contact Selesai*\n*Pesan Berhasil dikirim ke _${sent}_ users*`,
            });
          } catch (err) {
            logging("error", "Error sendMessage", err);
          }
          clearInterval(loopPushContact);
        }
        filteredUsers.splice(0, 1);
        writeFileSync(
          join(__dirname, "../database/users.json"),
          JSON.stringify(filteredUsers)
        );
        sent++;
      }, delayPushCont);
    }
  }
};

async function imageToWebp(media) {
  const tmpFileOut = join(
    tmpdir(),
    `${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`
  );
  const tmpFileIn = join(
    tmpdir(),
    `${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.jpg`
  );

  writeFileSync(tmpFileIn, media);

  await new Promise((resolve, reject) => {
    ff(tmpFileIn)
      .on("error", reject)
      .on("end", () => resolve(true))
      .addOutputOptions([
        "-vcodec",
        "libwebp",
        "-vf",
        "scale='min(320,iw)':min'(320,ih)':force_original_aspect_ratio=decrease,fps=15, pad=320:320:-1:-1:color=white@0.0, split [a][b]; [a] palettegen=reserve_transparent=on:transparency_color=ffffff [p]; [b][p] paletteuse",
      ])
      .toFormat("webp")
      .save(tmpFileOut);
  });

  const buff = readFileSync(tmpFileOut);
  unlinkSync(tmpFileOut);
  unlinkSync(tmpFileIn);
  return buff;
}

async function writeExifImg(media, metadata) {
  let wMedia = await imageToWebp(media);
  const tmpFileIn = join(
    tmpdir(),
    `${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`
  );
  const tmpFileOut = join(
    tmpdir(),
    `${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`
  );
  writeFileSync(tmpFileIn, wMedia);

  if (metadata.packname || metadata.author) {
    const img = new webp.Image();
    const json = {
      "sticker-pack-id": `https://github.com/DikaArdnt/Hisoka-Morou`,
      "sticker-pack-name": metadata.packname,
      "sticker-pack-publisher": metadata.author,
      emojis: metadata.categories ? metadata.categories : [""],
    };
    const exifAttr = Buffer.from([
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
      0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
    ]);
    const jsonBuff = Buffer.from(JSON.stringify(json), "utf-8");
    const exif = Buffer.concat([exifAttr, jsonBuff]);
    exif.writeUIntLE(jsonBuff.length, 14, 4);
    await img.load(tmpFileIn);
    unlinkSync(tmpFileIn);
    img.exif = exif;
    await img.save(tmpFileOut);
    return tmpFileOut;
  }
}
