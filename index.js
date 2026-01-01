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

app.get('/', (req, res) => res.send('Bot V24 (Fix Dependencies & Filter) 🛡️'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running`));

console.log('✅ البوت جاهز V24...');

// ==========================================
// القوائم
// ==========================================
function showMainMenu(chatId) {
    const opts = {
        reply_markup: {
            keyboard: [
                ['🔗 نسخ منتج / إضافة سريع'], 
                ['📦 تعديل منتج شامل'],
                ['🗑️ حذف منتج'],
                ['📂 تعديل تصنيف'],
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

    // ========================
    // 🔗 نسخ / إضافة
    // ========================
    if (text === '🔗 نسخ منتج / إضافة سريع') {
        userStates[chatId] = { step: 'waiting_link_or_manual' };
        bot.sendMessage(chatId, "🕵️‍♂️ *أرسل رابط المنتج المنافس:*\n(سأقوم بفحص الرابط، وإذا كان محمياً سننتقل للإدخال اليدوي فوراً).", { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } });
        return;
    }

    if (userStates[chatId].step === 'waiting_link_or_manual') {
        // لو رابط
        if (text && text.startsWith('http')) {
            bot.sendMessage(chatId, "⏳ جاري الفحص وسحب البيانات...");
            try {
                const scrapedData = await scrapeProduct(text);
                
                // نجاح السحب
                userStates[chatId].tempProduct = scrapedData;
                userStates[chatId].step = 'review_name';
                
                bot.sendMessage(chatId, `✅ *نجحت العملية!*\n\n1️⃣ *الاسم:* \n${scrapedData.name}\n\n(أرسل "تم" للموافقة، أو أرسل اسماً جديداً).`, { parse_mode: 'Markdown' });
                
            } catch (e) {
                // 🔥 الفلتر اشتغل: الموقع محمي أو الاسم غلط
                console.log("Fallback triggered:", e.message);
                
                userStates[chatId].tempProduct = { images: [] };
                userStates[chatId].step = 'manual_name'; 
                
                bot.sendMessage(chatId, "⚠️ *الموقع محمي (أو البيانات غير واضحة).*\n\n✋ ولا يهمك، هنكمل يدوي.\n\n1️⃣ *اكتب اسم المنتج:*");
            }
        } 
        // لو نص عادي (إدخال يدوي مباشر)
        else {
            userStates[chatId].tempProduct = { images: [], name: text };
            userStates[chatId].step = 'manual_price';
            bot.sendMessage(chatId, "✅ تمام.\n\n2️⃣ *اكتب السعر الأساسي:*");
        }
        return;
    }

    // --- مسار الإدخال اليدوي ---
    if (userStates[chatId].step === 'manual_name') {
        userStates[chatId].tempProduct.name = text;
        userStates[chatId].step = 'manual_price';
        bot.sendMessage(chatId, "✅ تم حفظ الاسم.\n\n2️⃣ *اكتب السعر الأساسي (أرقام فقط):*");
        return;
    }
    if (userStates[chatId].step === 'manual_price') {
        userStates[chatId].tempProduct.price = extractNumber(text);
        userStates[chatId].step = 'manual_desc';
        bot.sendMessage(chatId, "✅ تم حفظ السعر.\n\n3️⃣ *اكتب وصف المنتج:*");
        return;
    }
    if (userStates[chatId].step === 'manual_desc') {
        userStates[chatId].tempProduct.description = text;
        userStates[chatId].tempProduct.short_description = text;
        userStates[chatId].step = 'upload_images';
        bot.sendMessage(chatId, "✅ تم حفظ البيانات.\n\n4️⃣ *الآن صور المنتج (مهم جداً):*\nأرسل الصور من المعرض، ولما تخلص اكتب 'تم'.");
        return;
    }

    // --- مسار المراجعة (لو النسخ نجح) ---
    if (userStates[chatId].step === 'review_name') {
        if (text !== 'تم' && text !== 'موافق') userStates[chatId].tempProduct.name = text;
        userStates[chatId].step = 'review_desc';
        const desc = userStates[chatId].tempProduct.description || "لا يوجد وصف";
        bot.sendMessage(chatId, `2️⃣ *الوصف:*\n${desc.substring(0,200)}...\n\n(أرسل "تم" أو وصفاً جديداً).`);
        return;
    }
    if (userStates[chatId].step === 'review_desc') {
        if (text !== 'تم' && text !== 'موافق') {
            userStates[chatId].tempProduct.description = text;
            userStates[chatId].tempProduct.short_description = text;
        }
        userStates[chatId].step = 'review_price';
        const price = userStates[chatId].tempProduct.price || "0";
        bot.sendMessage(chatId, `3️⃣ *السعر:* ${price}\n\n(أرسل "تم" أو سعراً جديداً).`);
        return;
    }
    if (userStates[chatId].step === 'review_price') {
        if (text !== 'تم' && text !== 'موافق') userStates[chatId].tempProduct.price = extractNumber(text);
        
        // فحص الصور: لو مفيش صورة مسحوبة، نحول للرفع اليدوي
        if (!userStates[chatId].tempProduct.image_url) {
            userStates[chatId].step = 'upload_images';
            bot.sendMessage(chatId, "⚠️ لم يتم سحب صور.\n\n4️⃣ *أرسل صور المنتج الآن ثم اكتب 'تم':*");
        } else {
            bot.sendMessage(chatId, "🚀 جاري الرفع للموقع...");
            await createScrapedProduct(chatId, userStates[chatId].tempProduct);
        }
        return;
    }

    // --- مرحلة رفع الصور ---
    if (userStates[chatId].step === 'upload_images') {
        if (text === 'تم') {
            const imgs = userStates[chatId].tempProduct.images || [];
            if (imgs.length === 0) {
                bot.sendMessage(chatId, "⚠️ لازم ترفع صورة واحدة على الأقل! ابعت صورة.");
                return;
            }
            bot.sendMessage(chatId, "🚀 جاري إنشاء المنتج...");
            await createScrapedProduct(chatId, userStates[chatId].tempProduct);
            return;
        }
        if (msg.photo) {
            bot.sendMessage(chatId, "⏳ جاري الرفع...");
            const fileId = msg.photo[msg.photo.length - 1].file_id;
            const wpId = await uploadImageFromTelegram(fileId);
            if (wpId) {
                if (!userStates[chatId].tempProduct.images) userStates[chatId].tempProduct.images = [];
                userStates[chatId].tempProduct.images.push({ id: wpId });
                bot.sendMessage(chatId, `✅ تم رفع صورة رقم (${userStates[chatId].tempProduct.images.length}).`);
            }
        }
        return;
    }

    // (باقي الأكواد: حذف وتعديل)
    if (text === '🗑️ حذف منتج') { userStates[chatId].step = 'waiting_delete_link'; bot.sendMessage(chatId, "رقم الـ ID للحذف:"); }
    if (userStates[chatId].step === 'waiting_delete_link') { 
        bot.sendMessage(chatId, "🔎 جاري البحث...");
        try {
            let params = {};
            if (/^\d+$/.test(text.trim())) params = { include: [text.trim()] };
            else {
                let cleanUrl = decodeURIComponent(text.split('?')[0]);
                if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
                params = { slug: cleanUrl.split('/').pop() };
            }
            const res = await api.get("products", params);
            if (res.data.length > 0) {
                const p = res.data[0];
                userStates[chatId].deleteId = p.id;
                bot.sendMessage(chatId, `⚠️ *حذف:* ${p.name}؟`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{text:'✅ نعم',callback_data:'confirm_delete_yes'},{text:'❌ لا',callback_data:'confirm_delete_no'}]] } });
            } else bot.sendMessage(chatId, "❌ غير موجود.");
        } catch(e) { bot.sendMessage(chatId, "❌ خطأ."); }
    }

    if (text === '📦 تعديل منتج شامل') { userStates[chatId].step = 'waiting_product_link'; bot.sendMessage(chatId, "الرابط:"); }
    if(userStates[chatId].step === 'waiting_product_link') processProductInput(chatId, text);
});

// Callback Query (للحذف)
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data === 'confirm_delete_yes') {
        const idToDelete = userStates[chatId].deleteId;
        bot.sendMessage(chatId, "⏳ جاري الحذف...");
        try {
            await api.delete(`products/${idToDelete}`, { force: true });
            bot.sendMessage(chatId, "🗑️✅ تم الحذف.");
        } catch (e) { bot.sendMessage(chatId, "❌ فشل."); }
        userStates[chatId] = { step: 'idle' };
    } 
    else if (data === 'confirm_delete_no') {
        bot.sendMessage(chatId, "✅ تم الإلغاء.");
        userStates[chatId] = { step: 'idle' };
    }
    bot.answerCallbackQuery(query.id);
});


// ==========================================
// 🕵️‍♂️ دوال السحب (مع الفلتر الذكي)
// ==========================================

async function scrapeProduct(url) {
    const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' };
    try {
        const { data } = await axios.get(url, { headers, timeout: 8000 });
        const $ = cheerio.load(data);
        let product = { name: "", price: "", image_url: "", description: "" };

        // 1. سحب الاسم
        product.name = $('meta[property="og:title"]').attr('content') || $('h1').first().text().trim();
        
        // 🛑 فلتر الأسماء المرفوضة
        const badNames = ['الموافقة', 'الموافقه', 'Just a moment', 'Access Denied', 'Attention Required', 'Security Check', 'Cloudflare'];
        if (!product.name || badNames.some(bad => product.name.includes(bad))) {
            throw new Error("Bad Name Detected");
        }

        // 2. سحب الصورة
        product.image_url = $('meta[property="og:image"]').attr('content');

        // 3. سحب الوصف
        product.description = $('meta[property="og:description"]').attr('content');
        
        // 4. سحب السعر
        let priceText = $('meta[property="product:price:amount"]').attr('content') || $('.price').text();
        product.price = extractNumber(priceText);

        return product;
    } catch (error) {
        throw error;
    }
}

async function createScrapedProduct(chatId, productData) {
    try {
        let finalImages = productData.images || [];
        if (finalImages.length === 0 && productData.image_url) {
            const imgId = await uploadImageFromUrlToWP(productData.image_url);
            if (imgId) finalImages.push({ id: imgId });
        }

        const wcData = {
            name: productData.name,
            type: "simple",
            regular_price: productData.price,
            description: productData.description || "",
            short_description: productData.description || "",
            status: "publish",
            images: finalImages
        };
        const response = await api.post("products", wcData);
        if (response.status === 201) {
            const p = response.data;
            bot.sendMessage(chatId, `🎉 *تم النشر بنجاح!*\n\n📄 ${p.name}\n💰 ${p.price}\n🔗 ${p.permalink}`, { parse_mode: 'Markdown' });
        }
    } catch (e) {
        bot.sendMessage(chatId, "❌ خطأ: " + e.message);
    }
    userStates[chatId] = { step: 'idle' };
    setTimeout(() => showMainMenu(chatId), 3000);
}

// دوال رفع الصور
async function uploadImageFromTelegram(fileId) {
    try {
        const fileLink = await bot.getFileLink(fileId);
        const response = await axios.get(fileLink, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data, 'binary');
        const form = new FormData();
        form.append('file', buffer, { filename: `tg_img_${Date.now()}.jpg` });
        const wpUploadUrl = `${SITE_URL}/wp-json/wp/v2/media?consumer_key=${CK}&consumer_secret=${CS}`;
        const uploadRes = await axios.post(wpUploadUrl, form, { headers: { ...form.getHeaders() } });
        return uploadRes.data.id;
    } catch (e) { return null; }
}
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

async function processProductInput(chatId, text) {
    bot.sendMessage(chatId, "🔎...");
    try {
        let params = {};
        if (/^\d+$/.test(text.trim())) params = { include: [text.trim()] };
        else {
            let cleanUrl = decodeURIComponent(text.split('?')[0]);
            if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
            params = { slug: cleanUrl.split('/').pop() };
        }
        const res = await api.get("products", params);
        if (res.data.length > 0) {
            const p = res.data[0];
            userStates[chatId].productId = p.id;
            userStates[chatId].regularPrice = parseFloat(p.regular_price || p.price);
            bot.sendMessage(chatId, `✅ *${p.name}*\nID: ${p.id}\n💰 ${p.price}\n👇 اختر:`, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{text:'💵 سعر أساسي',callback_data:'single_fixed'},{text:'🏷️ خصم',callback_data:'single_sale'}],[{text:'📦 مخزون',callback_data:'stock_menu'},{text:'✍️ اسم',callback_data:'edit_name'}],[{text:'📝 وصف',callback_data:'edit_desc'}]] }
            });
        } else bot.sendMessage(chatId, "❌ غير موجود.");
    } catch (e) { bot.sendMessage(chatId, "❌ خطأ."); }
}

bot.on('polling_error', (err) => { if (err.code !== 'EFATAL') console.log('Polling Error'); });
