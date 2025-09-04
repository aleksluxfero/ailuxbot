import { Bot } from "grammy";
import Redis from "ioredis";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is unset");
const redisUrl = process.env.UPSTASH_REDIS_URL;
if (!redisUrl) throw new Error("UPSTASH_REDIS_URL is unset");

export const bot = new Bot(token);
const redis = new Redis(redisUrl);

let lastUpdateId = 0;

// Команда /start (оставляем как есть, она быстрая)
bot.command("start", async (ctx) => {
  await ctx.reply("👋 Добро пожаловать! ...");
});

// Обработчик сообщений (не async, чтобы не блокировать)
bot.on("message:text", (ctx) => {
  const chatId = ctx.chat.id;
  const userMessage = ctx.message.text;
  const messageId = ctx.message.message_id;

  if (userMessage.startsWith("/") || ctx.update.update_id <= lastUpdateId) return;
  lastUpdateId = ctx.update.update_id;

  // Fire-and-forget для редактирования сообщения (не ждем)
  ctx.api.editMessageText(chatId, messageId, "⏳ Запрос обрабатывается...").catch((err) => console.error("Ошибка редактирования:", err));

  // Сохраняем задачу в Redis (then/catch вместо await)
  const taskId = `task:${Date.now()}:${chatId}:${messageId}`;
  redis.setex(taskId, 3600, JSON.stringify({ chatId, messageId, userMessage }))
    .then(() => {
      // Запускаем асинхронную обработку после сохранения
      processTask(taskId, chatId, messageId, userMessage);
    })
    .catch((err) => {
      console.error("Ошибка сохранения в Redis:", err);
      // Fallback: редактируем на ошибку
      ctx.api.editMessageText(chatId, messageId, "❌ Ошибка сохранения задачи.").catch(console.error);
    });
});

// Функция для обработки задачи (выносим отдельно)
async function processTask(taskId: string, chatId: number, messageId: number, userMessage: string) {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.YOUR_SITE_URL || "",
        "X-Title": process.env.YOUR_SITE_NAME || "",
      },
      body: JSON.stringify({
        model: "qwen/qwen3-235b-a22b:free",
        messages: [
          { role: "system", content: "Отвечай на русском языке, используя понятный и естественный стиль. Не используй тег <think> в ответах." },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API Error: ${response.status} - ${errorData.message || response.statusText}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0]?.message?.content?.trim();

    if (!aiResponse) {
      throw new Error("Пустой ответ от AI");
    }

    const cleanedResponse = aiResponse.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    await bot.api.editMessageText(chatId, messageId, cleanedResponse, {
      parse_mode: "Markdown",
    });
  } catch (error) {
    console.error("Ошибка при обработке запроса:", error);
    await bot.api.editMessageText(
      chatId,
      messageId,
      "❌ Ошибка при обработке запроса. Пожалуйста, попробуйте снова."
    );
  } finally {
    await redis.del(taskId);
  }
}