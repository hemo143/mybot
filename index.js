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

app.get('/', (req, res) => res.send('Bot V20 (Stealth Mode) 🥷'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running`));

console.log('✅ البوت جاهز V20...');

// ==========================================
// القوائم
// ==========================================
function showMainMenu(chatId) {
    const opts = {
        reply_markup: {
            keyboard: [
                ['🔗 نسخ منتج (خطوة بخطوة)'], 
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
        bot.sendMessage(chatId, "🕵️‍♂️ *هات رابط المنتج المنافس:*\nسأحاول اختراق الحماية وسحب البيانات.", { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } });
        return;
    }

    // 2. معالجة الرابط وسحب البيانات
    if (userStates[chatId].step === 'waiting_competitor_link' && text && text.startsWith('http')) {
        bot.sendMessage(chatId, "⏳ جاري محاولة سحب البيانات... (قد تستغرق ثواني)");
        
        try {
            const scrapedData = await scrapeProduct(text);
            
            // لو فشل السحب (رجع فاضي)
            if (!scrapedData || !scrapedData.name) {
                throw new Error("No data found");
            }
            
            // حفظ البيانات مؤقتاً
            userStates[chatId].tempProduct = scrapedData;
            
            // 🔹 الخطوة 1: مراجعة الاسم
            userStates[chatId].step = 'review_name';
            bot.sendMessage(chatId, `✅ *نجحت في سحب البيانات!*\n\n1️⃣ *الاسم:* \n${scrapedData.name}\n\n(أرسل "تم" للموافقة، أو أرسل اسماً جديداً للتعديل).`, { parse_mode: 'Markdown' });
            
        } catch (e) {
            console.log("Scraping Failed:", e.message);
            // 🔥 الخطة البديلة: التحويل للإضافة اليدوية فوراً
            userStates[chatId].step = 'manual_name_fallback';
            userStates[chatId].tempProduct = { images: [] }; // منتج فارغ
            
            bot.sendMessage(chatId, "⚠️ *الموقع المنافس محمي جداً ومنع البوت!*\n\nلا تقلق، سنكمل يدوياً.\n\n1️⃣ *أدخل اسم المنتج:*", { parse_mode: 'Markdown' });
        }
        return;
    }

    // --- (مسار النسخ اليدوي البديل) ---
    if (userStates[chatId].step === 'manual_name_fallback') {
        userStates[chatId].tempProduct.name = text;
        userStates[chatId].step = 'review_desc'; // ننتقل للوصف كأننا في المسار العادي
        bot.sendMessage(chatId, "✅ تم حفظ الاسم.\n\n2️⃣ *أدخل وصف المنتج:*");
        return;
    }
    // ----------------------------------

    // 3. مراجعة الاسم (للمسار التلقائي)
    if (userStates[chatId].step === 'review_name') {
        if (text !== 'تم' && text !== 'موافق') {
            userStates[chatId].tempProduct.name = text;
            bot.sendMessage(chatId, "✅ تم تعديل الاسم.");
        } else {
            bot.sendMessage(chatId, "✅ تم اعتماد الاسم.");
        }

        userStates[chatId].step = 'review_desc';
        const currentDesc = userStates[chatId].tempProduct.description || "لا يوجد وصف";
        const previewDesc = currentDesc.length > 200 ? currentDesc.substring(0, 200) + "..." : currentDesc;
        bot.sendMessage(chatId, `2️⃣ *الوصف:*\n${previewDesc}\n\n(أرسل "تم" للموافقة، أو وصفاً جديداً).`);
        return;
    }

    // 4. مراجعة الوصف
    if (userStates[chatId].step === 'review_desc') {
        if (text !== 'تم' && text !== 'موافق') {
            userStates[chatId].tempProduct.description = text;
            userStates[chatId].tempProduct.short_description = text;
            bot.sendMessage(chatId, "✅ تم تعديل الوصف.");
        } else {
            bot.sendMessage(chatId, "✅ تم اعتماد الوصف.");
        }

        userStates[chatId].step = 'review_price';
        const currentPrice = userStates[chatId].tempProduct.price || "0";
        bot.sendMessage(chatId, `3️⃣ *السعر:* ${currentPrice}\n\n(أرسل "تم" للموافقة، أو سعراً جديداً بالأرقام).`);
        return;
    }

    // 5. مراجعة السعر والإنهاء
    if (userStates[chatId].step === 'review_price') {
        if (text !== 'تم' && text !== 'موافق') {
            userStates[chatId].tempProduct.price = extractNumber(text);
        }
        
        bot.sendMessage(chatId, "🚀 جاري الرفع للموقع...");
        await createScrapedProduct(chatId, userStates[chatId].tempProduct);
        return;
    }

    // (باقي الأكواد القديمة للإضافة اليدوية والتعديل - مختصرة)
    if (text === '➕ إضافة منتج يدوي') { /* ... */ }
    else if (text === '📦 تعديل منتج شامل') { userStates[chatId].step = 'waiting_product_link'; bot.sendMessage(chatId, "الرابط:"); }
    
    if(userStates[chatId].step === 'waiting_product_link') processProductInput(chatId, text);
    // ...
});

// ==========================================
// 🕵️‍♂️ دوال السحب المحسنة (Stealth Scraping)
// ==========================================

async function scrapeProduct(url) {
    // 🥷 رؤوس تمويه قوية جداً كأننا متصفح حقيقي
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0'
    };

    try {
        const { data } = await axios.get(url, { headers, timeout: 10000 }); // مهلة 10 ثواني
        const $ = cheerio.load(data);

        let product = { name: "", price: "", image_url: "", description: "" };

        // 1. الاسم
        product.name = $('meta[property="og:title"]').attr('content') || $('h1').first().text().trim();
        
        // 2. الصورة
        product.image_url = $('meta[property="og:image"]').attr('content') || $('.product-image img').attr('src') || $('img[itemprop="image"]').attr('src');
        
        // 3. الوصف
        product.description = $('meta[property="og:description"]').attr('content') || $('#description').text().trim() || $('.product-description').text().trim();
        
        // 4. السعر (محاولات متعددة)
        let priceText = $('meta[property="product:price:amount"]').attr('content') || 
                        $('.price .amount').first().text() || 
                        $('.product-price').first().text() ||
                        $('.price').first().text();
                        
        product.price = extractNumber(priceText);

        return product;
    } catch (error) {
        // لو حصل خطأ، نرجعه عشان الدالة الرئيسية تعرف وتحول ليدوي
        throw error;
    }
}

async function createScrapedProduct(chatId, productData) {
    try {
        let imageId = null;
        // لو فيه صورة جاية من الرابط، نرفعها
        if (productData.image_url && productData.image_url.startsWith('http')) {
            bot.sendMessage(chatId, "📥 جاري نقل الصورة...");
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
            bot.sendMessage(chatId, `🎉 *تم النشر بنجاح!*\n\n📄 ${p.name}\n💰 ${p.price}\n🔗 *الرابط الجديد:*\n${p.permalink}`, { parse_mode: 'Markdown' });
        }
    } catch (e) {
        console.error(e);
        bot.sendMessage(chatId, "❌ فشل الإنشاء: " + e.message);
    }
    userStates[chatId] = { step: 'idle' };
    setTimeout(() => showMainMenu(chatId), 3000);
}

// دالة رفع الصورة (مع التمويه أيضاً)
async function uploadImageFromUrlToWP(imgUrl) {
    try {
        if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
        
        // تمويه عند تحميل الصورة أيضاً
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };

        const response = await axios.get(imgUrl, { responseType: 'arraybuffer', headers });
        const buffer = Buffer.from(response.data, 'binary');
        const form = new FormData();
        form.append('file', buffer, { filename: `scraped_${Date.now()}.jpg` });
        
        const wpUploadUrl = `${SITE_URL}/wp-json/wp/v2/media?consumer_key=${CK}&consumer_secret=${CS}`;
        const uploadRes = await axios.post(wpUploadUrl, form, { headers: { ...form.getHeaders() } });
        return uploadRes.data.id;
    } catch (e) { return null; }
}

function extractNumber(str) { if(!str) return ""; return str.replace(/[^0-9.]/g, ''); }

// (ضع هنا باقي دوال التعديل processProductInput وغيرها...)
// ...

bot.on('polling_error', (err) => { if (err.code !== 'EFATAL') console.log('Polling Error'); });
