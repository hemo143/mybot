const TelegramBot = require('node-telegram-bot-api');
const WooCommerceRestApi = require("@woocommerce/woocommerce-rest-api").default;
const express = require('express');
const nodemailer = require('nodemailer');
const app = express();

// ==========================================
// 1. الإعدادات
// ==========================================
const token = '8337368193:AAFjUtxdXIRvaaPdpOU3-xogvKwRKG2xidU';

const api = new WooCommerceRestApi({
  url: "https://alhaythamgroup.com",
  consumerKey: "ck_f00a31ed7fd2d31ca3cc76c4d308adb67ee82e74",
  consumerSecret: "cs_5f422a1e9fa95e7545c65403b702a59f7a8efc67",
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
app.get('/', (req, res) => res.send('Bot V9 (Smart Steps) Running...'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running`));

console.log('✅ البوت جاهز V9...');

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
        bot.sendMessage(chatId, "🔗 الرابط:", { reply_markup: { remove_keyboard: true }});
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
            if (text.includes('http')) processProductLink(chatId, text);
            else bot.sendMessage(chatId, "❌ رابط خطأ.");
        }
        else if (state.step === 'waiting_value') processValueInput(chatId, text);
        else if (state.step === 'waiting_support_msg') sendEmail(chatId, text, msg.from.first_name);
    }
});

// معالجة الأزرار
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data === 'single_fixed') {
        userStates[chatId].action = 'single_fixed';
        userStates[chatId].step = 'waiting_value';
        bot.sendMessage(chatId, "💵 اكتب السعر الأساسي الجديد (بدون شطب):");
    }
    else if (data === 'single_sale') {
        userStates[chatId].action = 'single_sale';
        userStates[chatId].step = 'waiting_value';
        bot.sendMessage(chatId, "🏷️ اكتب سعر الخصم (عشان يظهر الشطب):");
    }
    else if (data === 'single_inc') {
        userStates[chatId].action = 'single_increase';
        userStates[chatId].step = 'waiting_value';
        bot.sendMessage(chatId, "📈 نسبة الزيادة %:");
    }
    else if (data === 'single_dec') {
        userStates[chatId].action = 'single_decrease';
        userStates[chatId].step = 'waiting_value';
        bot.sendMessage(chatId, "📉 نسبة الخصم %:");
    }
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
// 🛠️ المعالجة (الذكية)
// ==========================================

async function processProductLink(chatId, text) {
    bot.sendMessage(chatId, "🔎...");
    try {
        let cleanUrl = decodeURIComponent(text.split('?')[0]);
        if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
        const slug = cleanUrl.split('/').pop();
        const res = await api.get("products", { slug: slug });

        if (res.data.length > 0) {
            const p = res.data[0];
            userStates[chatId].productId = p.id;
            userStates[chatId].regularPrice = parseFloat(p.regular_price || p.price);
            userStates[chatId].productType = p.type;

            const caption = `✅ *${p.name}*\n💵 الأساسي: ${p.regular_price || '-'}\n🏷️ الخصم: ${p.sale_price || '-'}\n👇 اختر:`;
            bot.sendMessage(chatId, caption, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [ { text: '💵 سعر أساسي (مسح الخصم)', callback_data: 'single_fixed' } ],
                        [ { text: '🏷️ سعر خصم (إبقاء الشطب)', callback_data: 'single_sale' } ],
                        [ { text: '📈 زيادة %', callback_data: 'single_inc' }, { text: '📉 خصم %', callback_data: 'single_dec' } ]
                    ]
                }
            });
        } else { bot.sendMessage(chatId, "❌ مش لاقيه."); }
    } catch (e) { bot.sendMessage(chatId, "❌ خطأ."); }
}

async function processValueInput(chatId, text) {
    const val = parseFloat(text);
    if (isNaN(val)) { bot.sendMessage(chatId, "❌ رقم غلط."); return; }

    const state = userStates[chatId];
    if (state.productId) {
        
        // 1. تثبيت السعر الأساسي (يمسح الخصم أولاً لتجنب الأخطاء)
        if (state.action === 'single_fixed') {
            bot.sendMessage(chatId, `⏳ (1/2) تنظيف الخصومات...`);
            await updateBatchStep(chatId, state, { sale_price: "", date_on_sale_from: null, date_on_sale_to: null });
            
            bot.sendMessage(chatId, `⏳ (2/2) وضع السعر الأساسي: ${val}...`);
            await updateBatchStep(chatId, state, { regular_price: String(val) });
            
            bot.sendMessage(chatId, `✅ تم.`);
        }

        // 2. وضع سعر خصم (يترك الأساسي كما هو)
        else if (state.action === 'single_sale') {
            // تحقق بسيط
            if (val >= state.regularPrice) {
                bot.sendMessage(chatId, `⚠️ تنبيه: سعر الخصم (${val}) أعلى من الأساسي (${state.regularPrice})! قد لا يقبله الموقع.`);
            }
            bot.sendMessage(chatId, `⏳ جاري وضع الخصم: ${val}...`);
            await updateBatchStep(chatId, state, { sale_price: String(val) });
            bot.sendMessage(chatId, `✅ تم.`);
        }

        // 3. زيادة
        else if (state.action === 'single_increase') {
            const newReg = Math.round(state.regularPrice * (1 + val / 100));
            bot.sendMessage(chatId, `⏳ (1/2) تنظيف...`);
            await updateBatchStep(chatId, state, { sale_price: "", date_on_sale_from: null, date_on_sale_to: null });
            
            bot.sendMessage(chatId, `⏳ (2/2) رفع السعر لـ ${newReg}...`);
            await updateBatchStep(chatId, state, { regular_price: String(newReg) });
            bot.sendMessage(chatId, `✅ تم.`);
        }

        // 4. خصم
        else if (state.action === 'single_decrease') {
            const newSale = Math.round(state.regularPrice * (1 - val / 100));
            bot.sendMessage(chatId, `⏳ جاري الخصم لـ ${newSale}...`);
            await updateBatchStep(chatId, state, { sale_price: String(newSale) });
            bot.sendMessage(chatId, `✅ تم.`);
        }
    }
    
    else if (state.target) {
        processBulkUpdate(chatId, state, val);
    }

    userStates[chatId] = { step: 'idle' };
    setTimeout(() => showMainMenu(chatId), 2000);
}

// دالة التحديث بالدفعات (Batch)
async function updateBatchStep(chatId, productState, data) {
    try {
        let updates = [];
        let parentData = { ...data, id: productState.id };
        
        if (productState.type === 'variable') {
            delete parentData.regular_price;
            delete parentData.sale_price;
        }
        if (Object.keys(parentData).length > 1) updates.push(parentData);

        if (productState.type === 'variable') {
            const vars = await api.get(`products/${productState.id}/variations`, { per_page: 50 });
            if (vars.data.length > 0) {
                vars.data.forEach(v => {
                    updates.push({ id: v.id, ...data });
                });
            }
        }

        if (updates.length > 0) {
            await api.post("products/batch", { update: updates });
        }

    } catch (e) { console.error(e); }
}

async function processBulkUpdate(chatId, state, percent) {
    bot.sendMessage(chatId, "🚀 جاري العمل...");
    let page = 1; let count = 0;
    while (true) {
        let params = { per_page: 20, page: page, status: 'publish' };
        if (state.target === 'category') params.category = state.catId;
        const res = await api.get("products", params);
        if (res.data.length === 0) break;

        if (state.action.includes('increase')) {
            // خطوتين للزيادة
            let cleanUpdates = res.data.map(p => ({ id: p.id, sale_price: "", date_on_sale_from: null, date_on_sale_to: null }));
            await api.post("products/batch", { update: cleanUpdates });

            let priceUpdates = [];
            for (const p of res.data) {
                let oldReg = parseFloat(p.regular_price || p.price);
                if (!oldReg) continue;
                priceUpdates.push({ id: p.id, regular_price: String(Math.round(oldReg * (1 + percent / 100))) });
                count++;
            }
            if (priceUpdates.length > 0) await api.post("products/batch", { update: priceUpdates });
        } else {
            // خطوة واحدة للتخفيض
            let saleUpdates = [];
            for (const p of res.data) {
                let oldReg = parseFloat(p.regular_price || p.price);
                if (!oldReg) continue;
                saleUpdates.push({ id: p.id, sale_price: String(Math.round(oldReg * (1 - percent / 100))) });
                count++;
            }
            if (saleUpdates.length > 0) await api.post("products/batch", { update: saleUpdates });
        }
        page++;
        await new Promise(r => setTimeout(r, 500));
    }
    bot.sendMessage(chatId, `✅ تم تحديث ${count} منتج.`);
}

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

bot.on('polling_error', (err) => { if (err.code !== 'EFATAL') console.log('Polling Error'); });
