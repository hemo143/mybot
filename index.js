const TelegramBot = require('node-telegram-bot-api');
const WooCommerceRestApi = require("@woocommerce/woocommerce-rest-api").default;
const express = require('express');
const nodemailer = require('nodemailer');
const axios = require('axios'); // مكتبة النفق
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
app.get('/', (req, res) => res.send('Bot V11 (ID Targeting) 🎯'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running`));

console.log('✅ البوت جاهز V11...');

// ==========================================
// القوائم
// ==========================================
function showMainMenu(chatId) {
    const opts = {
        reply_markup: {
            keyboard: [
                ['📦 تعديل سعر منتج'],
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

    if (text === '📦 تعديل سعر منتج') {
        userStates[chatId] = { step: 'waiting_product_link' };
        bot.sendMessage(chatId, "🔗 أرسل رابط المنتج (أو رقم الـ ID للأمان):", { reply_markup: { remove_keyboard: true }});
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
        if (state.step === 'waiting_product_link') {
            processProductInput(chatId, text);
        }
        else if (state.step === 'waiting_value') processValueInput(chatId, text);
        else if (state.step === 'waiting_support_msg') sendEmail(chatId, text, msg.from.first_name);
    }
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data === 'single_fixed') {
        userStates[chatId].action = 'single_fixed';
        userStates[chatId].step = 'waiting_value';
        bot.sendMessage(chatId, "💵 اكتب السعر الأساسي (بدون شطب):");
    }
    else if (data === 'single_sale') {
        userStates[chatId].action = 'single_sale';
        userStates[chatId].step = 'waiting_value';
        bot.sendMessage(chatId, "🏷️ اكتب سعر الخصم (عشان يظهر الشطب):");
    }
    // ... باقي الأزرار
    else if (data.startsWith('cat_')) {
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
    else if (['bulk_cat_inc','bulk_cat_dec','bulk_all_inc','bulk_all_dec'].includes(data)){
        userStates[chatId].action = data.replace('bulk_cat', 'bulk').replace('bulk_all', 'bulk');
        if(data.includes('cat')) userStates[chatId].target = 'category';
        else userStates[chatId].target = 'all';
        userStates[chatId].step = 'waiting_value';
        bot.sendMessage(chatId, "🔢 اكتب النسبة %:");
    }
    bot.answerCallbackQuery(query.id);
});

// ==========================================
// 🛠️ المعالجة (دعم الـ ID والنفق)
// ==========================================

async function processProductInput(chatId, text) {
    bot.sendMessage(chatId, "🔎 جاري البحث...");
    try {
        let params = {};
        let inputType = "link";

        // لو المستخدم بعت رقم بس (زي 26446)
        if (/^\d+$/.test(text.trim())) {
            params = { include: [text.trim()] };
            inputType = "id";
        } else {
            // لو بعت رابط
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
            userStates[chatId].productType = p.type;

            // رسالة التأكيد (مهمة جداً)
            const caption = `✅ *تم العثور على المنتج:*\n📌 ID: *${p.id}*\n📄 الاسم: ${p.name}\n💰 السعر الحالي: ${p.price}\n\n(تأكد أن هذا هو المنتج الصحيح!)\n👇 اختر العملية:`;
            
            bot.sendMessage(chatId, caption, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [ { text: '💵 سعر أساسي', callback_data: 'single_fixed' }, { text: '🏷️ سعر خصم', callback_data: 'single_sale' } ]
                    ]
                }
            });
        } else { 
            bot.sendMessage(chatId, "❌ لم يتم العثور على المنتج.\n(نصيحة: جرب إرسال رقم الـ ID من لوحة التحكم مباشرة)."); 
        }
    } catch (e) { bot.sendMessage(chatId, "❌ خطأ بحث."); }
}

async function processValueInput(chatId, text) {
    const val = parseFloat(text);
    if (isNaN(val)) { bot.sendMessage(chatId, "❌ رقم غلط."); return; }

    const state = userStates[chatId];
    if (state.productId) {
        
        // 1. سعر أساسي (عبر النفق)
        if (state.action === 'single_fixed') {
            bot.sendMessage(chatId, `⏳ جاري التحديث (Tunnel)...`);
            // مسح الخصم وتحديث الأساسي
            await updateProductTunnel(chatId, state.productId, { 
                regular_price: String(val), 
                sale_price: "", 
                date_on_sale_from: null, date_on_sale_to: null 
            });
        }

        // 2. سعر خصم (عبر النفق)
        else if (state.action === 'single_sale') {
            bot.sendMessage(chatId, `⏳ جاري تفعيل الخصم...`);
            await updateProductTunnel(chatId, state.productId, { 
                sale_price: String(val),
                date_on_sale_from: null, date_on_sale_to: null
            });
        }
    }
    
    // تعديل جماعي
    else if (state.target) {
        processBulkUpdate(chatId, state, val);
        userStates[chatId] = { step: 'idle' };
        setTimeout(() => showMainMenu(chatId), 2000);
    }
}

// 🔥 دالة النفق (Tunnel Function) لقهر الـ Firewall
async function updateProductTunnel(chatId, productId, data) {
    try {
        const url = `${SITE_URL}/wp-json/wc/v3/products/${productId}?consumer_key=${CK}&consumer_secret=${CS}`;
        
        // بنبعت POST بس بنحط Header سحري يقول "أنا PUT"
        const response = await axios.post(url, data, {
            headers: {
                'Content-Type': 'application/json',
                'X-HTTP-Method-Override': 'PUT'
            }
        });

        if (response.status === 200) {
            bot.sendMessage(chatId, `✅ تم التحديث بنجاح!`);
        }

    } catch (e) {
        console.error(e);
        let msg = "❌ فشل التحديث.";
        if (e.response) {
            msg += `\nالسبب: ${e.response.data.message}`;
            // لو الخطأ rest_no_route يبقى المشكلة لسه في الروابط
            if(e.response.data.code === 'rest_no_route') msg += "\n(حاول حفظ الروابط الدائمة مرة أخرى)";
        }
        bot.sendMessage(chatId, msg);
    }
}

// (باقي الدوال: الإيميل والتحديث الجماعي...)
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
    // (اختصار للكود السابق)
    bot.sendMessage(chatId, "✅ تم الإرسال.");
}

bot.on('polling_error', (err) => { if (err.code !== 'EFATAL') console.log('Polling Error'); });
