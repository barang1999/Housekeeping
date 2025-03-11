const express = require("express");
const axios = require("axios");
const router = express.Router();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

router.post("/send-telegram", async (req, res) => {
    const { message } = req.body;

    if (!message) {
        return res.status(400).json({ error: "Message is required" });
    }

    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        await axios.post(url, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message
        });

        res.json({ success: true, message: "Message sent to Telegram" });
    } catch (error) {
        console.error("❌ Error sending message to Telegram:", error);
        res.status(500).json({ error: "Failed to send message to Telegram" });
    }
});

module.exports = router;
