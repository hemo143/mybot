const TelegramBot = require('node-telegram-bot-api');
const WooCommerceRestApi = require("@woocommerce/woocommerce-rest-api").default;
const express = require('express');
const nodemailer = require('nodemailer');
const axios = require('axios');
const FormData = require('form-data');
const cheerio = require('cheerio'); 
const app = express();

// ==========================================
// 1. الإعدادات
// ==========================================
const token = '8337368193:AAFjUtxdXIRvaaPdpOU3-xogvKwRKG2xidU';
const SITE_URL = "https://alhaythamgroup.com";
const CK = "ck_f00a31ed7fd2d31ca3cc76c4d308adb67ee82e74";
const CS = "cs_5f422a1e9fa95e7545c65403b702a59f7a8efc67";

const api = new WooCommerceRestApi({
  url: SITE_URL,
  consumerKey: CK,
  consumerSecret: CS,
  version: "wc/v3",
  queryStringAuth: true,
  timeout: 60000 
});

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'influencetargetingmarketing3@gmail.com',
    pass: 'cfsq nuen hozc mucu' 
  }
});
const ADMIN_EMAIL = 'influencetargetingmarketing3@gmail.com';

const bot = new TelegramBot(token, {polling: true});
const userStates = {}; 

app.get('/', (req, res) => res.send('Bot V19 (Interactive Cloner) 🗣️'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running`));

console.log('✅ البوت جاهز V19...');

// ==========================================
// القوائم
// ==========================================
function showMainMenu(chatId) {
    const opts = {
        reply_markup: {
            keyboard: [
                ['🔗 نسخ منتج (خطوة بخطوة)'], // ✅ الزر الجديد
                ['➕ إضافة منتج يدوي'],
                ['📦 تعديل منتج شامل'],
                ['🌍 تعديل شامل']
            ],
            resize_keyboard: true
        }
    };
    bot.sendMessage(chatId, "👋 أهلاً بك! اختر العملية:", opts);
}

// ==========================================
// استقبال الرسائل
// ==========================================
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!userStates[chatId]) userStates[chatId] = { step: 'idle' };

    // الأوامر العامة
    if (text && ['/start', 'مرحبا', 'menu', 'الغاء', 'إلغاء', 'رجوع'].includes(text.toLowerCase())) {
        userStates[chatId] = { step: 'idle' };
        showMainMenu(chatId);
        return;
    }

    // 1. بداية النسخ
    if (text === '🔗 نسخ منتج (خطوة بخطوة)') {
        userStates[chatId] = { step: 'waiting_competitor_link' };
        bot.sendMessage(chatId, "🕵️‍♂️ *هات رابط المنتج المنافس:*\nسأقوم بسحب البيانات ومراجعتها معك خطوة بخطوة.", { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } });
        return;
    }

    // 2. معالجة الرابط وسحب البيانات
    if (userStates[chatId].step === 'waiting_competitor_link' && text && text.startsWith('http')) {
        bot.sendMessage(chatId, "⏳ جاري سحب البيانات... لحظة واحدة.");
        
        try {
            const scrapedData = await scrapeProduct(text);
            if (!scrapedData.name) {
                bot.sendMessage(chatId, "❌ لم أستطع قراءة الموقع. جرب الإضافة اليدوية.");
                showMainMenu(chatId);
                return;
            }
            
            // حفظ البيانات مؤقتاً
            userStates[chatId].tempProduct = scrapedData;
            
            // 🔹 الخطوة 1: مراجعة الاسم
            userStates[chatId].step = 'review_name';
            bot.sendMessage(chatId, `1️⃣ *الاسم الذي وجدته:*\n${scrapedData.name}\n\n✅ إذا موافق أرسل "تم".\n✍️ إذا تريد تغييره، أرسل الاسم الجديد الآن.`, { parse_mode: 'Markdown' });
            
        } catch (e) {
            bot.sendMessage(chatId, "❌ خطأ في الرابط.");
        }
        return;
    }

    // 3. مراجعة الاسم
    if (userStates[chatId].step === 'review_name') {
        if (text !== 'تم' && text !== 'موافق') {
            userStates[chatId].tempProduct.name = text; // تحديث الاسم
            bot.sendMessage(chatId, "✅ تم تحديث الاسم.");
        } else {
            bot.sendMessage(chatId, "✅ تم اعتماد الاسم.");
        }

        // 🔹 الانتقال للخطوة 2: الوصف
        userStates[chatId].step = 'review_desc';
        const currentDesc = userStates[chatId].tempProduct.description || "لا يوجد وصف";
        // نرسل جزء من الوصف لو طويل
        const previewDesc = currentDesc.length > 200 ? currentDesc.substring(0, 200) + "..." : currentDesc;
        
        bot.sendMessage(chatId, `2️⃣ *الوصف الذي وجدته:*\n${previewDesc}\n\n✅ إذا موافق أرسل "تم".\n✍️ إذا تريد تغييره، أرسل الوصف الجديد.`);
        return;
    }

    // 4. مراجعة الوصف
    if (userStates[chatId].step === 'review_desc') {
        if (text !== 'تم' && text !== 'موافق') {
            userStates[chatId].tempProduct.description = text;
            bot.sendMessage(chatId, "✅ تم تحديث الوصف.");
        } else {
            bot.sendMessage(chatId, "✅ تم اعتماد الوصف.");
        }

        // 🔹 الانتقال للخطوة 3: السعر
        userStates[chatId].step = 'review_price';
        const currentPrice = userStates[chatId].tempProduct.price || "0";
        bot.sendMessage(chatId, `3️⃣ *السعر الذي وجدته:* ${currentPrice}\n\n✅ إذا موافق أرسل "تم".\n💰 إذا تريد تغييره، أرسل السعر الجديد (أرقام فقط).`);
        return;
    }

    // 5. مراجعة السعر والإنهاء
    if (userStates[chatId].step === 'review_price') {
        if (text !== 'تم' && text !== 'موافق') {
            userStates[chatId].tempProduct.price = extractNumber(text);
        }
        
        // التنفيذ النهائي
        bot.sendMessage(chatId, "🚀 جاري رفع الصورة وإنشاء المنتج على موقع الهيثم...");
        await createScrapedProduct(chatId, userStates[chatId].tempProduct);
        return;
    }

    // --- (باقي الأكواد القديمة للإضافة اليدوية والتعديل - مختصرة هنا) ---
    if (text === '➕ إضافة منتج يدوي') { /* كود الإضافة اليدوية السابق */ }
    else if (text === '📦 تعديل منتج شامل') { /* كود التعديل السابق */ }
    
    // (لعدم تكرار الكود الطويل، افترض أن باقي الدوال موجودة كما هي في V17/V18)
    if(userStates[chatId].step === 'waiting_product_link') processProductInput(chatId, text);
    // ... الخ
});

// ==========================================
// 🕵️‍♂️ دوال السحب والإنشاء
// ==========================================

async function scrapeProduct(url) {
    const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0.4472.124 Safari/537.36' };
    const { data } = await axios.get(url, { headers });
    const $ = cheerio.load(data);

    let product = { name: "", price: "", image_url: "", description: "" };

    // سحب البيانات
    product.name = $('meta[property="og:title"]').attr('content') || $('h1').first().text().trim();
    product.image_url = $('meta[property="og:image"]').attr('content') || $('.product-image img').attr('src');
    product.description = $('meta[property="og:description"]').attr('content') || $('.product-description').text().trim();
    
    // محاولة ذكية للسعر
    const priceText = $('meta[property="product:price:amount"]').attr('content') || $('.price').first().text() || $('.amount').first().text();
    if (priceText) product.price = extractNumber(priceText);

    return product;
}

async function createScrapedProduct(chatId, productData) {
    try {
        let imageId = null;
        // رفع الصورة
        if (productData.image_url) {
            imageId = await uploadImageFromUrlToWP(productData.image_url);
        }

        const wcData = {
            name: productData.name,
            type: "simple",
            regular_price: productData.price,
            description: productData.description || "",
            short_description: productData.description || "",
            status: "publish"
        };
        if (imageId) wcData.images = [{ id: imageId }];

        const response = await api.post("products", wcData);

        if (response.status === 201) {
            const p = response.data;
            // ✅ هنا الرد على سؤالك: إرسال الرابط الجديد
            bot.sendMessage(chatId, `🎉 *تم النشر بنجاح على الهيثم جروب!*\n\n📄 الاسم: ${p.name}\n💰 السعر: ${p.price}\n🔗 *رابط المنتج الجديد:*\n${p.permalink}`, { parse_mode: 'Markdown' });
        }
    } catch (e) {
        console.error(e);
        bot.sendMessage(chatId, "❌ حدث خطأ أثناء الإنشاء.");
    }
    userStates[chatId] = { step: 'idle' };
    setTimeout(() => showMainMenu(chatId), 3000);
}

// دالة رفع الصورة من الرابط
async function uploadImageFromUrlToWP(imgUrl) {
    try {
        if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
        const response = await axios.get(imgUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data, 'binary');
        const form = new FormData();
        form.append('file', buffer, { filename: `scraped_${Date.now()}.jpg` });
        const wpUploadUrl = `${SITE_URL}/wp-json/wp/v2/media?consumer_key=${CK}&consumer_secret=${CS}`;
        const uploadRes = await axios.post(wpUploadUrl, form, { headers: { ...form.getHeaders() } });
        return uploadRes.data.id;
    } catch (e) { return null; }
}

function extractNumber(str) { if(!str) return ""; return str.replace(/[^0-9.]/g, ''); }

// (أضف هنا باقي دوال التعديل القديمة processProductInput وغيرها لكي يعمل البوت بالكامل)
// ...

bot.on('polling_error', (err) => { if (err.code !== 'EFATAL') console.log('Polling Error'); });
