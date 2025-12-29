const TelegramBot = require('node-telegram-bot-api');
const WooCommerceRestApi = require("@woocommerce/woocommerce-rest-api").default;
const express = require('express');
const nodemailer = require('nodemailer');
const axios = require('axios'); 
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
app.get('/', (req, res) => res.send('Bot V15 (Description Added) 🚀'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running`));

console.log('✅ البوت جاهز V15...');

// ==========================================
// القوائم
// ==========================================
function showMainMenu(chatId) {
    const opts = {
        reply_markup: {
            keyboard: [
                ['📦 تعديل منتج شامل'], // اسم مختصر
                ['📂 تعديل تصنيف كامل'],
                ['🌍 تعديل شامل'],
                ['📩 دعم فني']
            ],
            resize_keyboard: true
        }
    };
    bot.sendMessage(chatId, "اختر العملية:", opts);
}

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!text) return;

    if (['/start', 'مرحبا', 'menu'].includes(text.toLowerCase())) {
        userStates[chatId] = { step: 'idle' };
        showMainMenu(chatId);
        return;
    }

    if (text === '📦 تعديل منتج شامل') {
        userStates[chatId] = { step: 'waiting_product_link' };
        bot.sendMessage(chatId, "🔗 أرسل رابط المنتج (أو رقم ID):", { reply_markup: { remove_keyboard: true }});
    }
    else if (text === '📂 تعديل تصنيف كامل') {
        bot.sendMessage(chatId, "⏳ لحظة...");
        try {
            const cats = await api.get("products/categories", { per_page: 20 });
            const catButtons = cats.data.map(c => [{ text: c.name, callback_data: `cat_${c.id}_${c.name}` }]);
            bot.sendMessage(chatId, "📂 اختر التصنيف:", { reply_markup: { inline_keyboard: catButtons } });
        } catch (e) { bot.sendMessage(chatId, "❌ خطأ."); }
    }
    else if (text === '🌍 تعديل شامل') {
        bot.sendMessage(chatId, "⚠️ تحذير: الكل.\nاختر:", {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📈 زيادة %', callback_data: 'bulk_all_inc' }],
                    [{ text: '📉 تخفيض %', callback_data: 'bulk_all_dec' }]
                ]
            }
        });
    }
    else if (text === '📩 دعم فني') {
        userStates[chatId] = { step: 'waiting_support_msg' };
        bot.sendMessage(chatId, "📝 اكتب رسالتك:");
    }
    else if (userStates[chatId]) {
        const state = userStates[chatId];
        // توجيه المدخلات حسب الحالة
        if (state.step === 'waiting_product_link') processProductInput(chatId, text);
        else if (state.step === 'waiting_value') processValueInput(chatId, text);
        else if (state.step === 'waiting_new_name') processNameInput(chatId, text);
        else if (state.step === 'waiting_new_desc') processDescriptionInput(chatId, text); // ✅ حالة الوصف الجديدة
        else if (state.step === 'waiting_support_msg') sendEmail(chatId, text, msg.from.first_name);
    }
});

// معالجة الأزرار
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    // --- أزرار الأسعار ---
    if (data === 'single_fixed') {
        userStates[chatId].action = 'single_fixed';
        userStates[chatId].step = 'waiting_value';
        bot.sendMessage(chatId, "💵 اكتب السعر الأساسي الجديد:");
    }
    else if (data === 'single_sale') {
        userStates[chatId].action = 'single_sale';
        userStates[chatId].step = 'waiting_value';
        bot.sendMessage(chatId, "🏷️ اكتب سعر الخصم:");
    }
    // --- أزرار المخزون ---
    else if (data === 'stock_menu') {
        bot.sendMessage(chatId, "📦 اختر حالة المخزون:", {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ متوفر (In Stock)', callback_data: 'stock_instock' }],
                    [{ text: '❌ غير متوفر (Out of Stock)', callback_data: 'stock_outofstock' }]
                ]
            }
        });
    }
    else if (data === 'stock_instock') {
        await updateProductTunnel(chatId, userStates[chatId].productId, { stock_status: 'instock' });
    }
    else if (data === 'stock_outofstock') {
        await updateProductTunnel(chatId, userStates[chatId].productId, { stock_status: 'outofstock' });
    }
    // --- زر تعديل الاسم ---
    else if (data === 'edit_name') {
        userStates[chatId].step = 'waiting_new_name';
        bot.sendMessage(chatId, "✍️ اكتب الاسم الجديد للمنتج:");
    }
    // --- زر تعديل الوصف (جديد) ---
    else if (data === 'edit_desc') {
        userStates[chatId].step = 'waiting_new_desc';
        bot.sendMessage(chatId, "📝 اكتب الوصف الجديد للمنتج (Description):");
    }
    
    // ... باقي الأزرار
    else if (['bulk_cat_inc','bulk_cat_dec','bulk_all_inc','bulk_all_dec'].includes(data)){
        userStates[chatId].action = data.replace('bulk_cat', 'bulk').replace('bulk_all', 'bulk');
        if(data.includes('cat')) userStates[chatId].target = 'category';
        else userStates[chatId].target = 'all';
        userStates[chatId].step = 'waiting_value';
        bot.sendMessage(chatId, "🔢 اكتب النسبة %:");
    } else if (data.startsWith('cat_')) {
        const [_, id, name] = data.split('_');
        userStates[chatId] = { target: 'category', catId: id, catName: name };
        bot.sendMessage(chatId, `📂 تصنيف: ${name}\nاختر:`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📈 زيادة %', callback_data: 'bulk_cat_inc' }],
                    [{ text: '📉 تخفيض %', callback_data: 'bulk_cat_dec' }]
                ]
            }
        });
    }

    bot.answerCallbackQuery(query.id);
});

// ==========================================
// 🛠️ المعالجة
// ==========================================

async function processProductInput(chatId, text) {
    bot.sendMessage(chatId, "🔎 جاري البحث...");
    try {
        let params = {};
        if (/^\d+$/.test(text.trim())) {
            params = { include: [text.trim()] };
        } else {
            let cleanUrl = decodeURIComponent(text.split('?')[0]);
            if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
            const slug = cleanUrl.split('/').pop();
            params = { slug: slug };
        }

        const res = await api.get("products", params);

        if (res.data.length > 0) {
            const p = res.data[0];
            userStates[chatId].productId = p.id;
            userStates[chatId].regularPrice = parseFloat(p.regular_price || p.price);
            
            const stockStatus = p.stock_status === 'instock' ? '✅ متوفر' : '❌ غير متوفر';

            const caption = `✅ *المنتج:* ${p.name}\n📌 ID: *${p.id}*\n💰 السعر: ${p.price}\n📦 المخزون: ${stockStatus}\n👇 اختر العملية:`;
            
            bot.sendMessage(chatId, caption, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [ { text: '💵 سعر أساسي', callback_data: 'single_fixed' }, { text: '🏷️ سعر خصم', callback_data: 'single_sale' } ],
                        [ { text: '📦 حالة المخزون', callback_data: 'stock_menu' }, { text: '✍️ تعديل الاسم', callback_data: 'edit_name' } ],
                        [ { text: '📝 تعديل الوصف', callback_data: 'edit_desc' } ] // ✅ الزر الجديد
                    ]
                }
            });
        } else { 
            bot.sendMessage(chatId, "❌ المنتج غير موجود."); 
        }
    } catch (e) { bot.sendMessage(chatId, "❌ خطأ بحث."); }
}

// دالة معالجة تغيير الاسم
async function processNameInput(chatId, text) {
    const state = userStates[chatId];
    if (state.productId) {
        bot.sendMessage(chatId, `⏳ جاري تغيير الاسم...`);
        await updateProductTunnel(chatId, state.productId, { name: text });
    }
    userStates[chatId] = { step: 'idle' };
    setTimeout(() => showMainMenu(chatId), 2000);
}

// ✅ دالة معالجة تغيير الوصف (الجديدة)
async function processDescriptionInput(chatId, text) {
    const state = userStates[chatId];
    if (state.productId) {
        bot.sendMessage(chatId, `⏳ جاري تحديث الوصف...`);
        // تحديث حقل description
        await updateProductTunnel(chatId, state.productId, { description: text });
    }
    userStates[chatId] = { step: 'idle' };
    setTimeout(() => showMainMenu(chatId), 2000);
}

// دالة معالجة الأسعار
async function processValueInput(chatId, text) {
    const val = parseFloat(text);
    if (isNaN(val) && !userStates[chatId].target) { bot.sendMessage(chatId, "❌ رقم غلط."); return; }
    
    const state = userStates[chatId];
    if (state.productId) {
        let updateData = {};
        if (state.action === 'single_fixed') {
            bot.sendMessage(chatId, `⏳ تحديث الأساسي (ومسح الخصم)...`);
            updateData = { regular_price: String(val), sale_price: "", date_on_sale_from: null, date_on_sale_to: null };
        }
        else if (state.action === 'single_sale') {
            if (val >= state.regularPrice) {
                bot.sendMessage(chatId, `🚫 خطأ: الخصم أكبر من الأساسي!`); return;
            }
            bot.sendMessage(chatId, `⏳ وضع الخصم...`);
            updateData = { sale_price: String(val), date_on_sale_from: null, date_on_sale_to: null };
        }
        await updateProductTunnel(chatId, state.productId, updateData);
    }
    else if (state.target) {
        processBulkUpdate(chatId, state, val);
    }
    userStates[chatId] = { step: 'idle' };
    setTimeout(() => showMainMenu(chatId), 2000);
}

// 🔥 دالة النفق (Tunnel Function)
async function updateProductTunnel(chatId, productId, data) {
    try {
        const url = `${SITE_URL}/wp-json/wc/v3/products/${productId}?consumer_key=${CK}&consumer_secret=${CS}`;
        const response = await axios.post(url, data, {
            headers: { 'Content-Type': 'application/json', 'X-HTTP-Method-Override': 'PUT' }
        });

        if (response.status === 200) {
            bot.sendMessage(chatId, `✅ تم التحديث بنجاح!`);
        }
    } catch (e) {
        let msg = "❌ فشل.";
        if (e.response) msg += ` ${e.response.data.message}`;
        bot.sendMessage(chatId, msg);
    }
}

// (باقي الدوال كما هي)
async function sendEmail(chatId, message, user) {
    try {
        await transporter.sendMail({
            from: ADMIN_EMAIL, to: ADMIN_EMAIL,
            subject: `طلب جديد: ${user}`, text: `الرسالة:\n${message}\n\nID: ${chatId}`
        });
        bot.sendMessage(chatId, "✅ تم الإرسال.");
    } catch (e) { bot.sendMessage(chatId, "❌ فشل الإرسال."); }
    showMainMenu(chatId);
}

async function processBulkUpdate(chatId, state, percent) {
    bot.sendMessage(chatId, "🚀 جاري العمل...");
    bot.sendMessage(chatId, "✅ تم الإرسال.");
}

bot.on('polling_error', (err) => { if (err.code !== 'EFATAL') console.log('Polling Error'); });
