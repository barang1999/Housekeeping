const TelegramBot = require('node-telegram-bot-api');

const token = '8006688624:AAGAVT0Esbo3W5UqZDnM66jGeb7RN58kwHg'; // Replace with your bot's token
const bot = new TelegramBot(token, { polling: true });

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "Hello! Your bot is working! 🚀");
    console.log("📩 Received a message:", msg);
});

console.log("🤖 Telegram Bot is running...");
