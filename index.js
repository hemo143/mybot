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

app.get('/', (req, res) => res.send('Bot V28 (Full Feature Set - No Abbreviations) 🚀'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running`));

console.log('✅ البوت جاهز V28...');

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
    bot.sendMessage(chatId, "⚙️ اختر العملية:", opts);
}

// ==========================================
// استقبال الرسائل (Main Handler)
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
            bot.sendMessage(chatId, "🔗 *أرسل رابط المنافس:*\n(سأحاول سحب البيانات، لو محمية سأستخرج الاسم من الرابط).", { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } });
            return;
        }

        if (userStates[chatId].step === 'waiting_link_or_manual') {
            if (text && text.startsWith('http')) {
                bot.sendMessage(chatId, "⏳ جاري الفحص...");
                try {
                    const scrapedData = await scrapeProduct(text);
                    userStates[chatId].tempProduct = scrapedData;
                    userStates[chatId].step = 'review_name';
                    bot.sendMessage(chatId, `✅ *تم السحب بنجاح!*\n\n1️⃣ *الاسم:* \n${scrapedData.name}\n\n(أرسل "تم" للموافقة، أو أرسل اسماً جديداً).`, { parse_mode: 'Markdown' });
                } catch (e) {
                    // استخراج الاسم من الرابط عند الفشل
                    const nameFromUrl = extractNameFromUrl(text);
                    userStates[chatId].tempProduct = { images: [], name: nameFromUrl };
                    userStates[chatId].step = 'review_name'; 
                    bot.sendMessage(chatId, `⚠️ الموقع محمي، استخرجت الاسم من الرابط!\n\n1️⃣ *الاسم المقترح:* \n${nameFromUrl}\n\n(أرسل "تم" للموافقة، أو عدله).`);
                }
            } else {
                // إدخال يدوي مباشر
                userStates[chatId].tempProduct = { images: [], name: text };
                userStates[chatId].step = 'manual_price';
                bot.sendMessage(chatId, "✅ تمام.\n\n2️⃣ *اكتب السعر الأساسي:*");
            }
            return;
        }

        // خطوات الإدخال اليدوي / المراجعة
        if (userStates[chatId].step === 'manual_price') {
            userStates[chatId].tempProduct.price = extractNumber(text);
            userStates[chatId].step = 'manual_desc';
            bot.sendMessage(chatId, "✅ تم حفظ السعر.\n\n3️⃣ *اكتب الوصف:*");
            return;
        }
        if (userStates[chatId].step === 'manual_desc') {
            userStates[chatId].tempProduct.description = text;
            userStates[chatId].tempProduct.short_description = text;
            userStates[chatId].step = 'upload_images';
            bot.sendMessage(chatId, "✅ تم حفظ البيانات.\n\n4️⃣ *أرسل صور المنتج الآن (لما تخلص اكتب 'تم'):*");
            return;
        }

        // مراجعة الاسم
        if (userStates[chatId].step === 'review_name') {
            if (text !== 'تم' && text !== 'موافق') userStates[chatId].tempProduct.name = text;
            
            // لو السعر مش موجود نطلبه
            if (!userStates[chatId].tempProduct.price) {
                userStates[chatId].step = 'manual_price_check';
                bot.sendMessage(chatId, "💰 *اكتب السعر الأساسي للمنتج:*");
            } else {
                userStates[chatId].step = 'review_desc';
                const desc = userStates[chatId].tempProduct.description || "لا يوجد وصف";
                bot.sendMessage(chatId, `2️⃣ *الوصف:*\n${desc.substring(0,100)}...\n\n(أرسل "تم" أو وصفاً جديداً).`);
            }
            return;
        }

        // مراجعة السعر (حالة خاصة)
        if (userStates[chatId].step === 'manual_price_check') {
            userStates[chatId].tempProduct.price = extractNumber(text);
            userStates[chatId].step = 'review_desc';
            bot.sendMessage(chatId, "✅ تم حفظ السعر.\n\n3️⃣ *اكتب الوصف (أو 'تم'):*");
            return;
        }

        // مراجعة الوصف
        if (userStates[chatId].step === 'review_desc') {
            if (text !== 'تم' && text !== 'موافق') {
                userStates[chatId].tempProduct.description = text;
                userStates[chatId].tempProduct.short_description = text;
            }
            
            // فحص الصور
            if (!userStates[chatId].tempProduct.image_url) {
                userStates[chatId].step = 'upload_images';
                bot.sendMessage(chatId, "⚠️ الصور محمية.\n\n4️⃣ *أرسل صور المنتج من عندك (ثم اكتب 'تم'):*");
            } else {
                bot.sendMessage(chatId, "⏳ بحاول ارفع الصورة...");
                const imgId = await uploadImageFromUrlToWP(userStates[chatId].tempProduct.image_url);
                if (imgId) {
                    userStates[chatId].tempProduct.images = [{ id: imgId }];
                    bot.sendMessage(chatId, "🚀 الصورة تمام! جاري النشر...");
                    await createFinalProduct(chatId, userStates[chatId].tempProduct);
                } else {
                    userStates[chatId].step = 'upload_images';
                    bot.sendMessage(chatId, "❌ فشل سحب الصورة.\n\n4️⃣ *أرسل الصور يدوياً:*");
                }
            }
            return;
        }

        // رفع الصور اليدوي
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

        // ========================
        // 2. منطق الحذف
        // ========================
        if (text === '🗑️ حذف منتج') { 
            userStates[chatId].step = 'waiting_delete_link'; 
            bot.sendMessage(chatId, "🗑️ أرسل رقم الـ ID أو الرابط للحذف:");
            return;
        }
        if (userStates[chatId].step === 'waiting_delete_link') {
            bot.sendMessage(chatId, "🔎 جاري البحث...");
            let params = {};
            if (/^\d+$/.test(text.trim())) params = { include: [text.trim()] };
            else {
                let cleanUrl = decodeURIComponent(text.split('?')[0]);
                if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
                params = { slug: cleanUrl.split('/').pop() };
            }
            try {
                const res = await api.get("products", params);
                if (res.data.length > 0) {
                    const p = res.data[0];
                    userStates[chatId].deleteId = p.id;
                    bot.sendMessage(chatId, `⚠️ *تأكيد الحذف:* ${p.name}؟`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{text:'✅ نعم',callback_data:'confirm_delete_yes'},{text:'❌ لا',callback_data:'confirm_delete_no'}]] } });
                } else bot.sendMessage(chatId, "❌ غير موجود.");
            } catch(e) { bot.sendMessage(chatId, "❌ خطأ."); }
            return;
        }

        // ========================
        // 3. منطق التعديل الشامل (هنا كان الخطأ السابق وتم إصلاحه)
        // ========================
        if (text === '📦 تعديل منتج شامل') { 
            userStates[chatId].step = 'waiting_product_link'; 
            bot.sendMessage(chatId, "🔗 أرسل رابط المنتج أو رقم الـ ID للتعديل:"); 
            return;
        }
        if(userStates[chatId].step === 'waiting_product_link') {
            await processProductInput(chatId, text); // ✅ تم إصلاح الدالة
            return;
        }
        
        // استكمال خطوات التعديل
        if (userStates[chatId].step === 'waiting_value') await processValueInput(chatId, text);
        else if (userStates[chatId].step === 'waiting_new_name') await processNameInput(chatId, text);
        else if (userStates[chatId].step === 'waiting_new_desc') await processDescriptionInput(chatId, text);

    } catch (error) {
        console.error("Main Handler Error:", error);
        bot.sendMessage(chatId, "❌ حدث خطأ غير متوقع.");
    }
});

// ==========================================
// Callback Query (الأزرار)
// ==========================================
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    // الحذف
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
    
    // التعديل
    else if (['single_fixed', 'single_sale', 'stock_menu', 'edit_name', 'edit_desc'].includes(data)) {
        handleProductActions(chatId, data);
    } 
    else if (data === 'stock_instock' || data === 'stock_outofstock') {
        await updateProductTunnel(chatId, userStates[chatId].productId, { stock_status: data === 'stock_instock' ? 'instock' : 'outofstock' });
    }

    bot.answerCallbackQuery(query.id);
});

// ==========================================
// الدوال الكاملة (بدون اختصارات) ✅
// ==========================================

// 1. دوال التعديل (Edit Functions)
async function processProductInput(chatId, text) {
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
            userStates[chatId].productId = p.id;
            userStates[chatId].regularPrice = parseFloat(p.regular_price || p.price);
            
            const caption = `✅ *المنتج:* ${p.name}\n📌 ID: *${p.id}*\n💰 السعر: ${p.price}\n👇 اختر التعديل:`;
            bot.sendMessage(chatId, caption, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [ { text: '💵 سعر أساسي', callback_data: 'single_fixed' }, { text: '🏷️ سعر خصم', callback_data: 'single_sale' } ],
                        [ { text: '📦 حالة المخزون', callback_data: 'stock_menu' }, { text: '✍️ تعديل الاسم', callback_data: 'edit_name' } ],
                        [ { text: '📝 تعديل الوصف', callback_data: 'edit_desc' } ]
                    ]
                }
            });
        } else {
            bot.sendMessage(chatId, "❌ المنتج غير موجود.");
        }
    } catch (e) { bot.sendMessage(chatId, "❌ خطأ في البحث."); }
}

function handleProductActions(chatId, data) {
    if (data === 'single_fixed') {
        userStates[chatId].action = 'single_fixed';
        userStates[chatId].step = 'waiting_value';
        bot.sendMessage(chatId, "💵 اكتب السعر الأساسي الجديد:");
    } else if (data === 'single_sale') {
        userStates[chatId].action = 'single_sale';
        userStates[chatId].step = 'waiting_value';
        bot.sendMessage(chatId, "🏷️ اكتب سعر الخصم:");
    } else if (data === 'edit_name') {
        userStates[chatId].step = 'waiting_new_name';
        bot.sendMessage(chatId, "✍️ اكتب الاسم الجديد:");
    } else if (data === 'edit_desc') {
        userStates[chatId].step = 'waiting_new_desc';
        bot.sendMessage(chatId, "📝 اكتب الوصف الجديد:");
    } else if (data === 'stock_menu') {
        bot.sendMessage(chatId, "📦 اختر الحالة:", {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ متوفر', callback_data: 'stock_instock' }],
                    [{ text: '❌ غير متوفر', callback_data: 'stock_outofstock' }]
                ]
            }
        });
    }
}

async function processValueInput(chatId, text) {
    const val = parseFloat(text);
    if (isNaN(val)) { bot.sendMessage(chatId, "❌ رقم غلط."); return; }
    const state = userStates[chatId];
    if (state.productId) {
        let updateData = {};
        if (state.action === 'single_fixed') {
            bot.sendMessage(chatId, `⏳ تحديث الأساسي...`);
            updateData = { regular_price: String(val), sale_price: "" };
        } else if (state.action === 'single_sale') {
            bot.sendMessage(chatId, `⏳ وضع الخصم...`);
            updateData = { sale_price: String(val) };
        }
        await updateProductTunnel(chatId, state.productId, updateData);
    }
    userStates[chatId] = { step: 'idle' };
    setTimeout(() => showMainMenu(chatId), 2000);
}

async function processNameInput(chatId, text) {
    bot.sendMessage(chatId, "⏳ تحديث الاسم...");
    await updateProductTunnel(chatId, userStates[chatId].productId, { name: text });
    userStates[chatId] = { step: 'idle' };
    setTimeout(() => showMainMenu(chatId), 2000);
}

async function processDescriptionInput(chatId, text) {
    bot.sendMessage(chatId, "⏳ تحديث الوصف...");
    await updateProductTunnel(chatId, userStates[chatId].productId, { description: text, short_description: text });
    userStates[chatId] = { step: 'idle' };
    setTimeout(() => showMainMenu(chatId), 2000);
}

// 2. دوال السحب والنشر (Scraping & Create)
function extractNameFromUrl(url) {
    try {
        let cleanUrl = url.split('?')[0];
        if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
        let slug = cleanUrl.split('/').pop();
        return slug.replace(/-/g, ' ');
    } catch (e) { return "اسم غير معروف"; }
}

async function scrapeProduct(url) {
    const headers = { 'User-Agent': 'Mozilla/5.0' };
    try {
        const { data } = await axios.get(url, { headers, timeout: 8000 });
        const $ = cheerio.load(data);
        let product = { name: "", price: "", image_url: "", description: "" };

        product.name = $('meta[property="og:title"]').attr('content') || $('h1').first().text().trim();
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
            bot.sendMessage(chatId, `🎉 *تم النشر بنجاح!*\n\n📄 ${p.name}\n💰 ${p.price}\n🔗 ${p.permalink}`, { parse_mode: 'Markdown' });
        }
    } catch (e) { bot.sendMessage(chatId, "❌ خطأ في النشر."); }
    userStates[chatId] = { step: 'idle' };
    setTimeout(() => showMainMenu(chatId), 3000);
}

// 3. دوال عامة (Utilities)
async function updateProductTunnel(chatId, productId, data) {
    try {
        const url = `${SITE_URL}/wp-json/wc/v3/products/${productId}?consumer
