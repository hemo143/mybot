const TelegramBot = require('node-telegram-bot-api');
const WooCommerceRestApi = require("@woocommerce/woocommerce-rest-api").default;
const express = require('express'); // مكتبة جديدة عشان السيرفر
const app = express();

// ==========================================
// 1. إعدادات البوت والموقع
// ==========================================
const token = '8337368193:AAFjUtxdXIRvaaPdpOU3-xogvKwRKG2xidU';

const api = new WooCommerceRestApi({
  url: "https://alhaythamgroup.com",
  consumerKey: "ck_f00a31ed7fd2d31ca3cc76c4d308adb67ee82e74",
  consumerSecret: "cs_5f422a1e9fa95e7545c65403b702a59f7a8efc67",
  version: "wc/v3",
  queryStringAuth: true
});

// ==========================================
// 2. كود البوت (نفس المنطق القديم)
// ==========================================
const bot = new TelegramBot(token, {polling: true});
const userStates = {}; 

console.log('✅ البوت يعمل على السيرفر...');

bot.on('polling_error', (error) => { console.log(error.code); });

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text === '/start') {
        bot.sendMessage(chatId, `👋 أهلاً بك!\nالـ ID الخاص بك: ${chatId}\n\nأرسل رابط المنتج لتغيير سعره.`);
        return;
    }

    if (text && text.includes('http') && text.includes('/product/')) {
        bot.sendMessage(chatId, "🔎 جاري البحث...");
        try {
            let cleanUrl = text.split('?')[0];
            if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
            cleanUrl = decodeURIComponent(cleanUrl);
            const slug = cleanUrl.split('/').pop();

            const response = await api.get("products", { slug: slug, _fields: 'id,name,price,regular_price' });

            if (response.data.length > 0) {
                const product = response.data[0];
                userStates[chatId] = { productId: product.id, productName: product.name };
                bot.sendMessage(chatId, `✅ *${product.name}*\n💰 *السعر الحالي:* ${product.price}\n\n👇 *اكتب السعر الجديد*`, {parse_mode: 'Markdown'});
            } else {
                bot.sendMessage(chatId, "❌ المنتج غير موجود.");
            }
        } catch (error) {
            bot.sendMessage(chatId, "❌ خطأ في الاتصال بالموقع.");
        }
    }
    else if (userStates[chatId]) { 
        const priceText = text.replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).trim();
        if (!isNaN(priceText) && priceText.length > 0) {
            const product = userStates[chatId];
            try {
                await api.put(`products/${product.productId}`, { regular_price: priceText, sale_price: "" });
                bot.sendMessage(chatId, `🚀 *تم التحديث لـ ${priceText} بنجاح!*`, {parse_mode: 'Markdown'});
                delete userStates[chatId];
            } catch (error) {
                bot.sendMessage(chatId, "❌ فشل التحديث.");
            }
        }
    }
});

// ==========================================
// 3. كود السيرفر (عشان Render يفضل مشغله)
// ==========================================
app.get('/', (req, res) => {
  res.send('Bot is running!');
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});