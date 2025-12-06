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
app.get('/', (req, res) => res.send('Bot Running (Debug Mode)'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running`));

console.log('✅ البوت جاهز (وضع كشف الأخطاء)...');

// ==========================================
// منطق البوت
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
        bot.sendMessage(chatId, "🔗 هات الرابط:", { reply_markup: { remove_keyboard: true }});
    }
    else if (text === '📂 تعديل تصنيف كامل') {
        bot.sendMessage(chatId, "⏳ لحظة...");
        try {
            const cats = await api.get("products/categories", { per_page: 20 });
            const catButtons = cats.data.map(c => [{ text: c.name, callback_data: `cat_${c.id}_${c.name}` }]);
            bot.sendMessage(chatId, "📂 اختر التصنيف:", { reply_markup: { inline_keyboard: catButtons } });
        } catch (e) { bot.sendMessage(chatId, "❌ خطأ."); }
    }
    else if (text === '📩 دعم فني') {
        userStates[chatId] = { step: 'waiting_support_msg' };
        bot.sendMessage(chatId, "📝 اكتب رسالتك:");
    }
    else if (userStates[chatId]) {
        const state = userStates[chatId];
        if (state.step === 'waiting_product_link') {
            if (text.includes('http')) processProductLink(chatId, text);
            else bot.sendMessage(chatId, "❌ رابط غلط.");
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
        bot.sendMessage(chatId, "💰 اكتب السعر الجديد (Regular):");
    }
    else if (data === 'single_sale') {
        userStates[chatId].action = 'single_sale';
        userStates[chatId].step = 'waiting_value';
        bot.sendMessage(chatId, "🏷️ اكتب سعر الخصم (Sale):");
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
    // (باقي الأزرار كما هي...)
    
    bot.answerCallbackQuery(query.id);
});

// ==========================================
// 🛠️ المحرك
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

            const caption = `✅ *${p.name}*\n📦 النوع: ${p.type}\n💰 السعر: ${p.price} ج.م\n👇 اختر:`;
            
            bot.sendMessage(chatId, caption, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [ { text: '💵 سعر أساسي', callback_data: 'single_fixed' }, { text: '🏷️ سعر خصم', callback_data: 'single_sale' } ],
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
        let updateData = {};
        
        // تعديل السعر الأساسي (يمسح الخصم)
        if (state.action === 'single_fixed') {
            updateData = { 
                regular_price: String(val), 
                sale_price: "", 
                date_on_sale_from: "", date_on_sale_to: "" // استخدام نص فارغ بدل null
            };
            bot.sendMessage(chatId, `⏳ جاري تثبيت السعر على: ${val}...`);
        }
        
        // تعديل سعر الخصم
        else if (state.action === 'single_sale') {
            updateData = { 
                regular_price: String(state.regularPrice), 
                sale_price: String(val),
                date_on_sale_from: "", date_on_sale_to: ""
            };
            bot.sendMessage(chatId, `⏳ جاري وضع سعر خصم: ${val}...`);
        }
        
        // زيادة
        else if (state.action === 'single_increase') {
            const newReg = Math.round(state.regularPrice * (1 + val / 100));
            updateData = { 
                regular_price: String(newReg), 
                sale_price: "", 
                date_on_sale_from: "", date_on_sale_to: "" 
            };
            bot.sendMessage(chatId, `⏳ جاري رفع السعر لـ: ${newReg}...`);
        }
        
        // خصم نسبة
        else if (state.action === 'single_decrease') {
            const newSale = Math.round(state.regularPrice * (1 - val / 100));
            updateData = { 
                regular_price: String(state.regularPrice), 
                sale_price: String(newSale),
                date_on_sale_from: "", date_on_sale_to: ""
            };
            bot.sendMessage(chatId, `⏳ جاري تطبيق خصم لـ: ${newSale}...`);
        }

        await updateProductSmart(chatId, state, updateData);
    }

    // --- تعديل جماعي ---
    else if (state.target) {
        processBulkUpdate(chatId, state, val);
    }

    userStates[chatId] = { step: 'idle' };
    setTimeout(() => showMainMenu(chatId), 2000);
}

// دالة التحديث (التي ستفضح الخطأ)
async function updateProductSmart(chatId, productState, data) {
    try {
        let parentData = { ...data };
        
        // لو متغير، نظف الأب من الأسعار
        if (productState.type === 'variable') {
            delete parentData.regular_price;
            delete parentData.sale_price;
        }

        // تحديث الأب
        if (Object.keys(parentData).length > 0) {
            await api.put(`products/${productState.id}`, parentData);
        }

        // تحديث النسخ
        if (productState.type === 'variable') {
            const vars = await api.get(`products/${productState.id}/variations`, { per_page: 50 });
            if (vars.data.length > 0) {
                const promises = vars.data.map(v => api.put(`products/${productState.id}/variations/${v.id}`, data));
                await Promise.all(promises);
            }
        }
        
        // إجبار التحديث
        await api.put(`products/${productState.id}`, { status: 'publish' });

        if (chatId) bot.sendMessage(chatId, `✅ تم التحديث بنجاح.`);

    } catch (e) { 
        console.error(e);
        // هنا السر: البوت هيبعت تفاصيل الخطأ لليوزر
        let errorMsg = "حدث خطأ غير معروف";
        if (e.response && e.response.data) {
            errorMsg = `❌ الموقع رفض الطلب:\nCode: ${e.response.data.code}\nMessage: ${e.response.data.message}`;
        } else {
            errorMsg = `❌ خطأ اتصال: ${e.message}`;
        }
        if(chatId) bot.sendMessage(chatId, errorMsg); 
    }
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

// دالة التحديث الجماعي (مختصرة)
async function processBulkUpdate(chatId, state, percent) {
    bot.sendMessage(chatId, "🚀 جاري العمل...");
    let page = 1; let count = 0;
    while (true) {
        let params = { per_page: 20, page: page, status: 'publish' };
        if (state.target === 'category') params.category = state.catId;
        const res = await api.get("products", params);
        if (res.data.length === 0) break;
        for (const p of res.data) {
            let oldReg = parseFloat(p.regular_price || p.price);
            if (!oldReg) continue;
            let updateData = {};
            if (state.action === 'bulk_increase') {
                const newReg = Math.round(oldReg * (1 + percent / 100));
                updateData = { regular_price: String(newReg), sale_price: "", date_on_sale_from: "", date_on_sale_to: "" };
            }
            else if (state.action === 'bulk_decrease') {
                const newSale = Math.round(oldReg * (1 - percent / 100));
                updateData = { regular_price: String(oldReg), sale_price: String(newSale), date_on_sale_from: "", date_on_sale_to: "" };
            }
            await updateProductSmart(null, { id: p.id, type: p.type }, updateData);
            count++;
            await new Promise(r => setTimeout(r, 200));
        }
        page++;
    }
    bot.sendMessage(chatId, `✅ تم تحديث ${count} منتج.`);
}

bot.on('polling_error', (err) => { if (err.code !== 'EFATAL') console.log('Polling Error'); });
