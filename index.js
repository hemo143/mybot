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

app.get('/', (req, res) => res.send('Bot V25 (Stable Version) 🚀'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running`));

console.log('✅ البوت جاهز V25...');

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
    // منع معالجة الرسائل القديمة أو الفارغة
    if (!msg || !msg.text && !msg.photo) return;
    
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
            bot.sendMessage(chatId, "🔗 *أرسل رابط المنتج المنافس:*\n(أو أرسل اسم المنتج مباشرة للإضافة اليدوية).", { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } });
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
                    bot.sendMessage(chatId, `✅ *نجح السحب!*\n\n1️⃣ *الاسم:* \n${scrapedData.name}\n\n(أرسل "تم" للموافقة، أو أرسل اسماً جديداً).`, { parse_mode: 'Markdown' });
                } catch (e) {
                    console.error("Scrape Error:", e.message);
                    userStates[chatId].tempProduct = { images: [] };
                    userStates[chatId].step = 'manual_name'; 
                    bot.sendMessage(chatId, "⚠️ *الموقع محمي.* هنكمل يدوي.\n\n1️⃣ *اكتب اسم المنتج:*");
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

        // --- خطوات الإدخال اليدوي ---
        if (userStates[chatId].step === 'manual_name') {
            userStates[chatId].tempProduct.name = text;
            userStates[chatId].step = 'manual_price';
            bot.sendMessage(chatId, "✅ الاسم تمام.\n\n2️⃣ *اكتب السعر الأساسي:*");
            return;
        }
        if (userStates[chatId].step === 'manual_price') {
            userStates[chatId].tempProduct.price = extractNumber(text);
            userStates[chatId].step = 'manual_desc';
            bot.sendMessage(chatId, "✅ السعر تمام.\n\n3️⃣ *اكتب الوصف:*");
            return;
        }
        if (userStates[chatId].step === 'manual_desc') {
            userStates[chatId].tempProduct.description = text;
            userStates[chatId].tempProduct.short_description = text;
            userStates[chatId].step = 'upload_images';
            bot.sendMessage(chatId, "✅ البيانات تمام.\n\n4️⃣ *أرسل صور المنتج الآن (لما تخلص اكتب 'تم'):*");
            return;
        }

        // --- خطوات المراجعة (بعد النسخ) ---
        if (userStates[chatId].step === 'review_name') {
            if (text !== 'تم' && text !== 'موافق') userStates[chatId].tempProduct.name = text;
            userStates[chatId].step = 'review_desc';
            const desc = userStates[chatId].tempProduct.description || "لا يوجد وصف";
            bot.sendMessage(chatId, `2️⃣ *الوصف:*\n${desc.substring(0,100)}...\n\n(أرسل "تم" أو وصفاً جديداً).`);
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
            
            if (!userStates[chatId].tempProduct.image_url) {
                userStates[chatId].step = 'upload_images';
                bot.sendMessage(chatId, "⚠️ مفيش صور مسحوبة.\n\n4️⃣ *أرسل صور من عندك (ثم اكتب 'تم'):*");
            } else {
                bot.sendMessage(chatId, "🚀 جاري الرفع للموقع...");
                await createScrapedProduct(chatId, userStates[chatId].tempProduct);
            }
            return;
        }

        // --- رفع الصور ---
        if (userStates[chatId].step === 'upload_images') {
            if (text === 'تم') {
                bot.sendMessage(chatId, "🚀 جاري الإنشاء...");
                await createScrapedProduct(chatId, userStates[chatId].tempProduct);
                return;
            }
            if (msg.photo) {
                bot.sendMessage(chatId, "⏳ جاري رفع الصورة...");
                const fileId = msg.photo[msg.photo.length - 1].file_id;
                const wpId = await uploadImageFromTelegram(fileId);
                if (wpId) {
                    if (!userStates[chatId].tempProduct.images) userStates[chatId].tempProduct.images = [];
                    userStates[chatId].tempProduct.images.push({ id: wpId });
                    bot.sendMessage(chatId, `✅ صورة ${userStates[chatId].tempProduct.images.length} جاهزة. (ابعت تاني أو اكتب تم)`);
                } else {
                    bot.sendMessage(chatId, "❌ فشل رفع الصورة، حاول تاني.");
                }
            }
            return;
        }

        // ========================
        // 2. منطق الحذف
        // ========================
        if (text === '🗑️ حذف منتج') { 
            userStates[chatId].step = 'waiting_delete_link'; 
            bot.sendMessage(chatId, "🗑️ أرسل رقم الـ ID أو رابط المنتج للحذف:");
            return;
        }
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
                    bot.sendMessage(chatId, `⚠️ *تأكيد الحذف:* ${p.name}؟`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{text:'✅ نعم احذفه',callback_data:'confirm_delete_yes'},{text:'❌ إلغاء',callback_data:'confirm_delete_no'}]] } });
                } else bot.sendMessage(chatId, "❌ غير موجود.");
            } catch(e) { bot.sendMessage(chatId, "❌ خطأ."); }
            return;
        }

        // ========================
        // 3. منطق التعديل الشامل
        // ========================
        if (text === '📦 تعديل منتج شامل') { 
            userStates[chatId].step = 'waiting_product_link'; 
            bot.sendMessage(chatId, "🔗 أرسل الرابط أو الـ ID:"); 
            return;
        }
        if(userStates[chatId].step === 'waiting_product_link') {
            processProductInput(chatId, text);
            return;
        }
        
        // لو المستخدم في مرحلة تعديل القيم
        if (userStates[chatId].step === 'waiting_value') processValueInput(chatId, text);
        else if (userStates[chatId].step === 'waiting_new_name') processNameInput(chatId, text);
        else if (userStates[chatId].step === 'waiting_new_desc') processDescriptionInput(chatId, text);

    } catch (error) {
        console.error("Main Handler Error:", error);
        bot.sendMessage(chatId, "❌ حدث خطأ غير متوقع. حاول مرة أخرى /start");
    }
});

// ==========================================
// Callback Query (الأزرار)
// ==========================================
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data === 'confirm_delete_yes') {
        bot.sendMessage(chatId, "⏳ جاري الحذف...");
        try {
            await api.delete(`products/${userStates[chatId].deleteId}`, { force: true });
            bot.sendMessage(chatId, "🗑️✅ تم الحذف.");
        } catch (e) { bot.sendMessage(chatId, "❌ فشل."); }
        userStates[chatId] = { step: 'idle' };
    } 
    else if (data === 'confirm_delete_no') {
        bot.sendMessage(chatId, "✅ تم الإلغاء.");
        userStates[chatId] = { step: 'idle' };
    }
    // معالجة أزرار التعديل (كما في الأكواد السابقة)
    else if (['single_fixed', 'single_sale', 'stock_menu', 'edit_name', 'edit_desc'].includes(data)) {
        handleProductActions(chatId, data);
    } 
    else if (data.startsWith('cat_') || data.includes('bulk')) {
        // منطق التعديل الجماعي
    }
    else if (data === 'stock_instock' || data === 'stock_outofstock') {
        await updateProductTunnel(chatId, userStates[chatId].productId, { stock_status: data === 'stock_instock' ? 'instock' : 'outofstock' });
    }

    bot.answerCallbackQuery(query.id);
});

async function handleProductActions(chatId, data) {
    if (data === 'single_fixed') {
        userStates[chatId].action = 'single_fixed'; userStates[chatId].step = 'waiting_value';
        bot.sendMessage(chatId, "💵 السعر الأساسي الجديد:");
    } else if (data === 'single_sale') {
        userStates[chatId].action = 'single_sale'; userStates[chatId].step = 'waiting_value';
        bot.sendMessage(chatId, "🏷️ سعر الخصم:");
    } else if (data === 'edit_name') {
        userStates[chatId].step = 'waiting_new_name'; bot.sendMessage(chatId, "✍️ الاسم الجديد:");
    } else if (data === 'edit_desc') {
        userStates[chatId].step = 'waiting_new_desc'; bot.sendMessage(chatId, "📝 الوصف الجديد:");
    } else if (data === 'stock_menu') {
        bot.sendMessage(chatId, "📦 الحالة:", { reply_markup: { inline_keyboard: [[{text:'✅ متوفر',callback_data:'stock_instock'}],[{text:'❌ غير متوفر',callback_data:'stock_outofstock'}]] } });
    }
}

// ==========================================
// الدوال المساعدة (Helper Functions)
// ==========================================

// 1. السحب (Scraping)
async function scrapeProduct(url) {
    const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' };
    try {
        const { data } = await axios.get(url, { headers, timeout: 8000 });
        const $ = cheerio.load(data);
        let product = { name: "", price: "", image_url: "", description: "" };

        product.name = $('meta[property="og:title"]').attr('content') || $('h1').first().text().trim();
        
        // فلتر الأسماء المرفوضة (الموافقة / الحماية)
        const badNames = ['الموافقة', 'الموافقه', 'Access Denied', 'Attention Required', 'Security Check', 'Cloudflare', 'Just a moment'];
        if (!product.name || badNames.some(bad => product.name.includes(bad))) {
            throw new Error("Bad Name Detected");
        }

        product.image_url = $('meta[property="og:image"]').attr('content');
        product.description = $('meta[property="og:description"]').attr('content');
        let priceText = $('meta[property="product:price:amount"]').attr('content') || $('.price').text();
        product.price = extractNumber(priceText);
        
        return product;
    } catch (error) { throw error; }
}

// 2. الإنشاء (Create)
async function createScrapedProduct(chatId, productData) {
    try {
        let finalImages = productData.images || [];
        // محاولة رفع الصورة من الرابط لو مفيش صور مرفوعة
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

// 3. رفع الصور (Upload)
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

// 4. أدوات مساعدة
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

async function processValueInput(chatId, text) {
    const val = parseFloat(text);
    if (isNaN(val)) { bot.sendMessage(chatId, "❌ رقم غلط."); return; }
    const state = userStates[chatId];
    if (state.productId) {
        let d = {};
        if (state.action === 'single_fixed') d = {regular_price: String(val), sale_price: "", date_on_sale_from: null, date_on_sale_to: null};
        else if (state.action === 'single_sale') {
            if(val>=state.regularPrice){bot.sendMessage(chatId,"❌ الخصم أكبر من السعر!");return;}
            d = {sale_price: String(val), date_on_sale_from: null, date_on_sale_to: null};
        }
        await updateProductTunnel(chatId, state.productId, d);
    }
    userStates[chatId] = {step: 'idle'}; setTimeout(()=>showMainMenu(chatId),2000);
}

async function updateProductTunnel(chatId, productId, data) {
    try {
        const url = `${SITE_URL}/wp-json/wc/v3/products/${productId}?consumer_key=${CK}&consumer_secret=${CS}`;
        await axios.post(url, data, { headers: { 'Content-Type': 'application/json', 'X-HTTP-Method-Override': 'PUT' } });
        bot.sendMessage(chatId, `✅ تم التحديث!`);
    } catch (e) { bot.sendMessage(chatId, "❌ فشل."); }
}
async function processNameInput(chatId, text) { await updateProductTunnel(chatId, userStates[chatId].productId, {name: text}); userStates[chatId] = {step: 'idle'}; setTimeout(()=>showMainMenu(chatId),2000); }
async function processDescriptionInput(chatId, text) { await updateProductTunnel(chatId, userStates[chatId].productId, {description: text, short_description: text}); userStates[chatId] = {step: 'idle'}; setTimeout(()=>showMainMenu(chatId),2000); }

bot.on('polling_error', (err) => { if (err.code !== 'EFATAL') console.log('Polling Error'); });
