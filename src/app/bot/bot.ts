import { Bot } from "grammy";
import Redis from "ioredis";

// Убедимся, что переменные окружения доступны
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is unset");
const redisUrl = process.env.UPSTASH_REDIS_URL;
if (!redisUrl) throw new Error("UPSTASH_REDIS_URL is unset");

// Создаем и экспортируем экземпляр бота
export const bot = new Bot(token);

// Инициализация Redis клиента
const redis = new Redis(redisUrl);

// Обрабатываем команду /start
bot.command("start", async (ctx) => {
  await ctx.reply(
    "👋 Добро пожаловать! Я бот, который отвечает на ваши вопросы с помощью ИИ. Просто напишите мне сообщение, и я постараюсь ответить максимально полезно на русском языке!"
  );
});

// Обработчик текстовых сообщений с контролем дубликатов
let lastUpdateId = 0;
bot.on("message:text", async (ctx) => {
  const chatId = ctx.chat.id;
  const userMessage = ctx.message.text;
  const messageId = ctx.message.message_id;

  // Пропускаем команды и дубликаты
  if (userMessage.startsWith("/") || ctx.update.update_id <= lastUpdateId) return;
  lastUpdateId = ctx.update.update_id;

  // Редактируем исходное сообщение пользователя
  await ctx.api.editMessageText(chatId, messageId, "⏳ Запрос обрабатывается...");

  // Сохраняем задачу в Redis для асинхронной обработки
  const taskId = `task:${Date.now()}:${chatId}:${messageId}`;
  await redis.setex(taskId, 3600, JSON.stringify({ chatId, messageId, userMessage }));

  // Асинхронная обработка
  (async () => {
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

      // Удаляем <think>-блок, если он есть
      const cleanedResponse = aiResponse.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

      // Редактируем исходное сообщение с очищенным ответом
      await ctx.api.editMessageText(chatId, messageId, cleanedResponse, {
        parse_mode: "Markdown",
      });
    } catch (error) {
      console.error("Ошибка при обработке запроса:", error);
      await ctx.api.editMessageText(
        chatId,
        messageId,
        "❌ Ошибка при обработке запроса. Пожалуйста, попробуйте снова."
      );
    } finally {
      // Удаляем задачу из Redis после обработки
      await redis.del(taskId);
    }
  })();
});