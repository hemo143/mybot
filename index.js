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

const bot = new TelegramBot(token, {polling: true});
const userStates = {}; 

app.get('/', (req, res) => res.send('Bot V27 (Smart URL Parser) 🧠'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running`));

console.log('✅ البوت جاهز V27...');

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
                ['🌍 تعديل شامل']
            ],
            resize_keyboard: true
        }
    };
    bot.sendMessage(chatId, "⚙️ اختر العملية:", opts);
}

// ==========================================
// استقبال الرسائل
// ==========================================
bot.on('message', async (msg) => {
    if (!msg || (!msg.text && !msg.photo)) return;
    const chatId = msg.chat.id;
    const text = msg.text;

    try {
        if (!userStates[chatId]) userStates[chatId] = { step: 'idle' };

        // الأوامر العامة
        if (text && ['/start', 'مرحبا', 'menu', 'الغاء', 'إلغاء', 'رجوع'].includes(text.toLowerCase())) {
            userStates[chatId] = { step: 'idle' };
            showMainMenu(chatId);
            return;
        }

        // ========================
        // 1. منطق النسخ / الإضافة
        // ========================
        if (text === '🔗 نسخ منتج / إضافة سريع') {
            userStates[chatId] = { step: 'waiting_link_or_manual' };
            bot.sendMessage(chatId, "🔗 *أرسل رابط المنتج المنافس:*\n(سأحاول سحب البيانات، ولو محمية سأستخرج الاسم من الرابط).", { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } });
            return;
        }

        if (userStates[chatId].step === 'waiting_link_or_manual') {
            // لو رابط
            if (text && text.startsWith('http')) {
                bot.sendMessage(chatId, "⏳ جاري الفحص...");
                try {
                    const scrapedData = await scrapeProduct(text);
                    userStates[chatId].tempProduct = scrapedData;
                    userStates[chatId].step = 'review_name';
                    bot.sendMessage(chatId, `✅ *تم السحب بنجاح!*\n\n1️⃣ *الاسم:* \n${scrapedData.name}\n\n(أرسل "تم" للموافقة، أو أرسل اسماً جديداً).`, { parse_mode: 'Markdown' });
                } catch (e) {
                    // 🔥 هنا الذكاء: استخراج الاسم من الرابط بدلاً من الفشل
                    console.log("Scrape failed, trying URL parse:", e.message);
                    
                    const nameFromUrl = extractNameFromUrl(text);
                    userStates[chatId].tempProduct = { images: [], name: nameFromUrl };
                    userStates[chatId].step = 'review_name'; // نذهب للمراجعة مباشرة بدل اليدوي
                    
                    bot.sendMessage(chatId, `⚠️ الموقع محمي، لكن استخرجت الاسم من الرابط!\n\n1️⃣ *الاسم المقترح:* \n${nameFromUrl}\n\n(أرسل "تم" للموافقة، أو عدله).`);
                }
            } 
            // لو نص عادي (يدوي)
            else {
                userStates[chatId].tempProduct = { images: [], name: text };
                userStates[chatId].step = 'manual_price';
                bot.sendMessage(chatId, "✅ تمام.\n\n2️⃣ *اكتب السعر الأساسي:*");
            }
            return;
        }

        // --- خطوات المراجعة (للنسخ والرابط) ---
        if (userStates[chatId].step === 'review_name') {
            if (text !== 'تم' && text !== 'موافق') userStates[chatId].tempProduct.name = text;
            userStates[chatId].step = 'review_desc'; // تخطينا السعر مؤقتاً
            // لو مفيش سعر، نطلبه
            if (!userStates[chatId].tempProduct.price) {
                userStates[chatId].step = 'manual_price_check';
                bot.sendMessage(chatId, "💰 *اكتب السعر الأساسي للمنتج:*");
            } else {
                 // لو فيه سعر (من السحب) نراجع الوصف
                 const desc = userStates[chatId].tempProduct.description || "لا يوجد وصف";
                 bot.sendMessage(chatId, `2️⃣ *الوصف:*\n${desc.substring(0,100)}...\n\n(أرسل "تم" أو وصفاً جديداً).`);
            }
            return;
        }

        // حالة خاصة: طلب السعر لو فشل السحب
        if (userStates[chatId].step === 'manual_price_check') {
            userStates[chatId].tempProduct.price = extractNumber(text);
            userStates[chatId].step = 'review_desc';
            bot.sendMessage(chatId, "✅ تم حفظ السعر.\n\n3️⃣ *اكتب وصف المنتج (أو 'تم' لتركه فارغاً):*");
            return;
        }

        if (userStates[chatId].step === 'review_desc') {
            if (text !== 'تم' && text !== 'موافق') {
                userStates[chatId].tempProduct.description = text;
                userStates[chatId].tempProduct.short_description = text;
            }
            // فحص الصور
            if (!userStates[chatId].tempProduct.image_url) {
                userStates[chatId].step = 'upload_images';
                bot.sendMessage(chatId, "⚠️ الصور محمية.\n\n4️⃣ *أرسل صور المنتج الآن من عندك (ثم اكتب 'تم'):*");
            } else {
                // محاولة أخيرة لرفع الصورة المسحوبة
                bot.sendMessage(chatId, "⏳ بحاول ارفع الصورة...");
                const imgId = await uploadImageFromUrlToWP(userStates[chatId].tempProduct.image_url);
                if (imgId) {
                    userStates[chatId].tempProduct.images = [{ id: imgId }];
                    bot.sendMessage(chatId, "🚀 الصورة تمام! جاري النشر...");
                    await createFinalProduct(chatId, userStates[chatId].tempProduct);
                    return;
                } else {
                    userStates[chatId].step = 'upload_images';
                    bot.sendMessage(chatId, "❌ فشل سحب الصورة (محمية).\n\n4️⃣ *أرسل الصور من عندك يدوياً:*");
                    return;
                }
            }
            return;
        }

        // --- رفع الصور اليدوي ---
        if (userStates[chatId].step === 'upload_images') {
            if (text === 'تم') {
                const imgs = userStates[chatId].tempProduct.images || [];
                if (imgs.length === 0) {
                    bot.sendMessage(chatId, "❌ لازم صورة واحدة على الأقل!");
                    return;
                }
                bot.sendMessage(chatId, "🚀 جاري النشر...");
                await createFinalProduct(chatId, userStates[chatId].tempProduct);
                return;
            }
            if (msg.photo) {
                bot.sendMessage(chatId, "⏳ جاري الرفع...");
                const fileId = msg.photo[msg.photo.length - 1].file_id;
                const wpId = await uploadImageFromTelegram(fileId);
                if (wpId) {
                    if (!userStates[chatId].tempProduct.images) userStates[chatId].tempProduct.images = [];
                    userStates[chatId].tempProduct.images.push({ id: wpId });
                    bot.sendMessage(chatId, `✅ تم رفع صورة (${userStates[chatId].tempProduct.images.length}).`);
                }
            }
            return;
        }
        
        // (باقي الأكواد اليدوية والحذف...)
        if (text === '🗑️ حذف منتج') { userStates[chatId].step = 'waiting_delete_link'; bot.sendMessage(chatId, "الرقم ID:"); }
        if (userStates[chatId].step === 'waiting_delete_link') { /* كود الحذف */ } // (انسخ كود الحذف من النسخ السابقة)
        if (text === '📦 تعديل منتج شامل') { userStates[chatId].step = 'waiting_product_link'; bot.sendMessage(chatId, "الرابط:"); }
        if(userStates[chatId].step === 'waiting_product_link') processProductInput(chatId, text);
        if (userStates[chatId].step === 'waiting_value') processValueInput(chatId, text);

    } catch (error) {
        console.error("Main Error:", error);
        bot.sendMessage(chatId, "❌ حدث خطأ.");
    }
});

// ==========================================
// 🧠 دوال ذكية (Smart Functions)
// ==========================================

// دالة استخراج الاسم من الرابط (المنقذ!)
function extractNameFromUrl(url) {
    try {
        // تنظيف الرابط من الباراميترز
        let cleanUrl = url.split('?')[0];
        if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
        
        // أخذ آخر جزء (slug)
        let slug = cleanUrl.split('/').pop();
        
        // تحويل الشرط (-) إلى مسافات
        let name = slug.replace(/-/g, ' ');
        
        // تكبير أول حرف (اختياري، يفيد في الإنجليزي)
        return name;
    } catch (e) {
        return "منتج جديد (اسم غير معروف)";
    }
}

async function scrapeProduct(url) {
    const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' };
    try {
        const { data } = await axios.get(url, { headers, timeout: 8000 });
        const $ = cheerio.load(data);
        let product = { name: "", price: "", image_url: "", description: "" };

        product.name = $('meta[property="og:title"]').attr('content') || $('h1').first().text().trim();
        
        // فلتر الأسماء المحظورة
        const badKeywords = ['الموافقة', 'الموافقه', 'cookies', 'moment', 'denied', 'security', 'cloudflare'];
        if (!product.name || badKeywords.some(bad => product.name.toLowerCase().includes(bad))) {
            throw new Error("Bad Name");
        }

        product.image_url = $('meta[property="og:image"]').attr('content');
        product.description = $('meta[property="og:description"]').attr('content');
        let priceText = $('meta[property="product:price:amount"]').attr('content') || $('.price').text();
        product.price = extractNumber(priceText);

        return product;
    } catch (error) { throw error; }
}

async function createFinalProduct(chatId, productData) {
    try {
        const wcData = {
            name: productData.name,
            type: "simple",
            regular_price: productData.price,
            description: productData.description || "",
            short_description: productData.description || "",
            status: "publish",
            images: productData.images
        };
        const response = await api.post("products", wcData);
        if (response.status === 201) {
            const p = response.data;
            bot.sendMessage(chatId, `🎉 *تم النشر!*\n\n📄 ${p.name}\n💰 ${p.price}\n🔗 ${p.permalink}`, { parse_mode: 'Markdown' });
        }
    } catch (e) { bot.sendMessage(chatId, "❌ خطأ نشر: " + e.message); }
    userStates[chatId] = { step: 'idle' };
    setTimeout(() => showMainMenu(chatId), 3000);
}

// دوال رفع الصور
async function uploadImageFromUrlToWP(imgUrl) {
    try {
        if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
        const headers = { 'User-Agent': 'Mozilla/5.0' };
        const response = await axios.get(imgUrl, { responseType: 'arraybuffer', headers, timeout: 5000 });
        const buffer = Buffer.from(response.data, 'binary');
        const form = new FormData();
        form.append('file', buffer, { filename: `scraped_${Date.now()}.jpg` });
        const wpUploadUrl = `${SITE_URL}/wp-json/wp/v2/media?consumer_key=${CK}&consumer_secret=${CS}`;
        const uploadRes = await axios.post(wpUploadUrl, form, { headers: { ...form.getHeaders() } });
        return uploadRes.data.id;
    } catch (e) { return null; }
}

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
function extractNumber(str) { if(!str) return ""; return str.replace(/[^0-9.]/g, ''); }
// (تأكد من وجود processProductInput, processValueInput, updateProductTunnel هنا كما في السابق)
async function processProductInput(chatId, text) { /* ... */ }
async function processValueInput(chatId, text) { /* ... */ }
async function updateProductTunnel(chatId, productId, data) { /* ... */ }

bot.on('polling_error', (err) => { if (err.code !== 'EFATAL') console.log('Polling Error'); });
