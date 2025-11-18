// file: monitor.js
import fetch from "node-fetch";
import fs from "fs";
import express from "express";
import dotenv from "dotenv";
import data from "./data.js";

dotenv.config();

const app = express();
app.use(express.json());

/** Load from .env */
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const CRON_JOBS = JSON.parse(process.env.CRON_JOBS);

let messageId = data.messageId;
let lastStatus = {};

function saveMessageId(id) {
  fs.writeFileSync(
    "./data.js",
    `export default {\n  messageId: "${id}"\n};\n`
  );
}

async function sendNewMessage(embed) {
  const res = await fetch(`${WEBHOOK_URL}?wait=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] })
  });

  const json = await res.json().catch(() => null);
  if (json?.id) {
    messageId = json.id;
    saveMessageId(messageId);
  }
}

async function editMessage(embed) {
  if (!messageId) return sendNewMessage(embed);

  const url = `${WEBHOOK_URL}/messages/${messageId}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] })
  });

  if (res.status === 404) return sendNewMessage(embed);
}

function parseCronSVG(svg) {
  let statusText = "⚪ UNKNOWN";
  let statusColor = 0xffffff;

  if (svg.includes("success")) {
    statusText = "🟢 ออนไลน์";
    statusColor = 0x00ff00;
  } else if (svg.includes("inactive")) {
    statusText = "🔴 ออฟไลน์";
    statusColor = 0xff0000;
  }

  return { statusText, statusColor };
}

async function checkStatus() {
  try {
    let changed = false;
    let fields = [];
    let color = 0x00aaff;

    for (const job of CRON_JOBS) {
      const svg = await fetch(job.url).then((r) => r.text());
      const parsed = parseCronSVG(svg);

      if (lastStatus[job.name] !== parsed.statusText) {
        changed = true;
        lastStatus[job.name] = parsed.statusText;
      }

      fields.push({
        name: job.name,
        value: `สถานะ: **${parsed.statusText}**`,
        inline: false
      });
    }

    if (!changed) return;

    const embed = {
      title: "📊 Cron Job Status Monitor",
      description: "สถานะล่าสุดของ Cron ทั้งหมด",
      color,
      fields,
      timestamp: new Date().toISOString()
    };

    await editMessage(embed);

  } catch (err) {
    console.log("Error:", err);
  }
}

/** Express endpoint */
app.get("/status", (req, res) => {
  res.json(lastStatus);
});

/** Start Cron Loop */
checkStatus();
setInterval(checkStatus, 3000);

/** Start Express */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on :${PORT}`));
