import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const DISCOGS_TOKEN = process.env.DISCOGS_TOKEN;
const GIST_ID = process.env.GIST_ID;
const GIST_TOKEN = process.env.GIST_TOKEN;

const albumsToWatch = process.env.ALBUMS_TO_WATCH
  ? process.env.ALBUMS_TO_WATCH.split(",").map((id) => Number(id.trim()))
  : [];

async function loadSentData() {
  try {
    const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      headers: {
        Authorization: `token ${GIST_TOKEN}`,
        "User-Agent": "discogs-bot",
      },
    });
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    const data = await res.json();
    const fileContent = data.files["sent.json"].content;
    return JSON.parse(fileContent);
  } catch (err) {
    console.error("Помилка завантаження з gist:", err.message);
    return {};
  }
}

async function saveSentData(data) {
  try {
    const body = {
      files: {
        "sent.json": {
          content: JSON.stringify(data, null, 2),
        },
      },
    };
    const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: "PATCH",
      headers: {
        Authorization: `token ${GIST_TOKEN}`,
        "User-Agent": "discogs-telegram-bot",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  } catch (err) {
    console.error("Помилка збереження в gist:", err.message);
  }
}

async function sendTelegramMessage(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const body = {
    chat_id: TELEGRAM_CHAT_ID,
    text,
    parse_mode: "Markdown",
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Telegram API error: ${errorText}`);
    }
  } catch (err) {
    console.error("Помилка при надсиланні повідомлення:", err.message);
  }
}

async function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function checkAlbumAvailability(releaseId) {
  const url = `https://api.discogs.com/releases/${releaseId}`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Discogs token=${DISCOGS_TOKEN}`,
      },
    });

    const data = await res.json();

    if (data.num_for_sale && data.num_for_sale > 0) {
      const title = data.title;
      const link = data.uri;

      return {
        found: true,
        message: `💿 Знайшли альбом: *${title}*\n[Посилання на Discogs](${link})`,
      };
    } else {
      return { found: false };
    }
  } catch (err) {
    console.error(
      `Помилка під час отримання інфи з реліза ${releaseId}:`,
      err.message
    );
    return { found: false };
  }
}

async function checkAllAlbums() {
  console.log(`[${new Date().toISOString()}] Перевірка наявності альбомів...`);

  const sentData = await loadSentData();
  let hasChanges = false;

  for (const releaseId of albumsToWatch) {
    const result = await checkAlbumAvailability(releaseId);

    if (result.found) {
      const count = sentData[releaseId] || 0;
      if (count < 3) {
        await sendTelegramMessage(result.message);
        sentData[releaseId] = count + 1;
        hasChanges = true;
      } else {
        console.log(
          `Пропускаємо ID ${releaseId} — вже відправлено 3 повідомлення`
        );
      }
    }

    await delay(1000);
  }

  if (hasChanges) {
    await saveSentData(sentData);
    console.log("✅ Дані оновлено в Gist");
  }
}

(async () => {
  await checkAllAlbums();
  process.exit(0);
})();
