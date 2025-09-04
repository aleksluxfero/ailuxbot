import { Bot } from "grammy";

// Убеждаемся, что переменные окружения доступны
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is unset");

// Создаем и экспортируем экземпляр бота
export const bot = new Bot(token);

// Здесь размещаем всю логику обработки сообщений
bot.on("message:text", async (ctx) => {
  const chatId = ctx.chat.id;
  const userMessage = ctx.message.text;

  // 1. Отправляем временное сообщение и сохраняем его ID
  const placeholderMessage = await ctx.reply("⏳ Запрос обрабатывается...");
  const messageId = placeholderMessage.message_id;

  try {
    // 2. Отправляем запрос к OpenRouter AI
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.YOUR_SITE_URL || "",
        "X-Title": process.env.YOUR_SITE_NAME || "",
      },
      body: JSON.stringify({
        model: "qwen/qwen3-235b-a22b:free", // Или любая другая модель
        messages: [
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        console.error("OpenRouter API Error:", errorData);
        throw new Error(`API Error: ${response.statusText}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0]?.message?.content?.trim();

    if (aiResponse) {
      // 3. Редактируем исходное сообщение готовым ответом от AI
      await ctx.api.editMessageText(chatId, messageId, aiResponse);
    } else {
      throw new Error("Не удалось получить ответ от AI.");
    }

  } catch (error) {
    console.error("Ошибка при обработке запроса:", error);
    // 4. В случае ошибки, также редактируем сообщение, чтобы уведомить пользователя
    await ctx.api.editMessageText(
      chatId,
      messageId,
      "❌ Произошла ошибка. Попробуйте позже."
    );
  }
});