require("dotenv").config();
const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);
const port = process.env.PORT || 3000;
const {
  default: makeWASocket,
  useMultiFileAuthState,
  makeInMemoryStore,
} = require("@whiskeysockets/baileys");
const { join } = require("path");
const P = require("pino");

/*const memory = makeInMemoryStore({
  logger: P().child({ level: "silent", store: "stream" }),
});*/

const logging = require("./lib/logging");

const connectReybotWhatsapp = async () => {
  let conn;
  try {
    conn = await useMultiFileAuthState(join(__dirname, "./auth"));
  } catch (err) {
    logging("error", "Session", err);
  }
  const reybot = makeWASocket({
    printQRInTerminal: true,
    logger: P({ level: "silent" }),
    browser: ["ReybotVIP", "Firefox", "1.0.0"],
    auth: conn.state,
    generateHighQualityLinkPreview: true,
  }); /*
  memory.bind(reybot.ev);*/
  reybot.ev.on("messages.upsert", (m) => {
    const msg = m.messages[0];
    if (msg.key.remoteJid === "status@broadcast") return;
    const isGroup = msg.key.remoteJid.endsWith("@g.us");
    require("./handler/messages")({
      reybot,
      msg,
      isGroup,
      connectReybotWhatsapp,
    });
  });
  reybot.ev.on("group-participants.update", (g) => {
    require("./handler/groups")({ reybot, g });
  });
  reybot.ev.on("call", (c) => {
    require("./handler/calls")({ reybot, c });
  });
  reybot.ev.on("creds.update", conn.saveCreds);
  reybot.ev.on("connection.update", async ({ connection }) => {
    if (connection === "close") connectReybotWhatsapp();
    if (connection === "connecting")
      logging("info", "Connection", "Connecting");
    if (connection === "open")
      logging("success", "Connected", reybot.user.id.split(":")[0]);
  });
};

app.get("/", (req, res) => {
  res.send("<h1>ReybotVIP</h1>");
});

server.listen(port, () => {
  connectReybotWhatsapp();
});
