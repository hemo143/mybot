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
app.get('/', (req, res) => res.send('Bot V5 (Full Control) Running...'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running`));

console.log('✅ البوت جاهز...');

// ==========================================
// 2. القائمة الرئيسية
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

// ==========================================
// 3. استقبال الرسائل
// ==========================================
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
    else if (text === '🌍 تعديل شامل') {
        bot.sendMessage(chatId, "⚠️ تحذير: تعديل كل الموقع.\nاختر:", {
            parse_mode: 'Markdown',
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
            else bot.sendMessage(chatId, "❌ رابط غلط.");
        }
        else if (state.step === 'waiting_value') processValueInput(chatId, text);
        else if (state.step === 'waiting_support_msg') sendEmail(chatId, text, msg.from.first_name);
    }
});

// ==========================================
// 4. معالجة الأزرار (القائمة الجديدة للمنتج)
// ==========================================
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    // --- أزرار المنتج الواحد ---
    if (data === 'single_base') { // تعديل السعر الأساسي
        userStates[chatId].action = 'single_base';
        userStates[chatId].step = 'waiting_value';
        bot.sendMessage(chatId, "💵 اكتب السعر الأساسي الجديد (Regular):");
    }
    else if (data === 'single_sale') { // تعديل سعر الخصم (يدوي)
        userStates[chatId].action = 'single_sale';
        userStates[chatId].step = 'waiting_value';
        bot.sendMessage(chatId, "🏷️ اكتب سعر العرض/الخصم الجديد (Sale):");
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

    // --- باقي الأزرار (تصنيف/كل) ---
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
    else if (data === 'bulk_cat_inc') {
        userStates[chatId].action = 'bulk_increase';
        userStates[chatId].step = 'waiting_value';
        bot.sendMessage(chatId, "📈 نسبة الزيادة %:");
    }
    else if (data === 'bulk_cat_dec') {
        userStates[chatId].action = 'bulk_decrease';
        userStates[chatId].step = 'waiting_value';
        bot.sendMessage(chatId, "📉 نسبة التخفيض %:");
    }
    else if (data === 'bulk_all_inc') {
        userStates[chatId] = { target: 'all', action: 'bulk_increase', step: 'waiting_value' };
        bot.sendMessage(chatId, "🌍 نسبة الزيادة % للكل:");
    }
    else if (data === 'bulk_all_dec') {
        userStates[chatId] = { target: 'all', action: 'bulk_decrease', step: 'waiting_value' };
        bot.sendMessage(chatId, "🌍 نسبة التخفيض % للكل:");
    }

    bot.answerCallbackQuery(query.id);
});

// ==========================================
// 🛠️ المنطق (تم إضافة خيار سعر الخصم اليدوي)
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
            // نجيب السعر الأساسي (لو مش موجود بناخد السعر الحالي)
            userStates[chatId].regularPrice = parseFloat(p.regular_price || p.price);
            userStates[chatId].productType = p.type;

            const caption = `✅ *${p.name}*\n💵 أساسي: ${p.regular_price || 'غير محدد'}\n🏷️ خصم: ${p.sale_price || 'لا يوجد'}\n💰 الحالي: ${p.price}\n\n👇 اختر العملية:`;
            
            bot.sendMessage(chatId, caption, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '💵 سعر أساسي', callback_data: 'single_base' },
                            { text: '🏷️ سعر خصم (يدوي)', callback_data: 'single_sale' }
                        ],
                        [
                            { text: '📈 زيادة %', callback_data: 'single_inc' },
                            { text: '📉 خصم %', callback_data: 'single_dec' }
                        ]
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
        
        // 1. تعديل السعر الأساسي (يمسح الخصم)
        if (state.action === 'single_base') {
            updateData = { 
                regular_price: String(val), 
                sale_price: "", 
                date_on_sale_from: null, date_on_sale_to: null
            };
            bot.sendMessage(chatId, `💵 تم تحديث السعر الأساسي: ${val}`);
        }

        // 2. تعديل سعر الخصم (يحافظ على الأساسي)
        else if (state.action === 'single_sale') {
            // نتأكد إن سعر الخصم أقل من الأساسي
            if (val >= state.regularPrice) {
                bot.sendMessage(chatId, `⚠️ تنبيه: سعر الخصم (${val}) أكبر من أو يساوي الأساسي (${state.regularPrice}).\nتم التنفيذ، لكن الخصم قد لا يظهر.`);
            }
            updateData = { 
                regular_price: String(state.regularPrice), 
                sale_price: String(val),
                date_on_sale_from: null, date_on_sale_to: null
            };
            bot.sendMessage(chatId, `🏷️ تم وضع سعر الخصم: ${val} (الأساسي: ${state.regularPrice})`);
        }
        
        // 3. زيادة نسبة (يمسح الخصم)
        else if (state.action === 'single_increase') {
            const newReg = Math.round(state.regularPrice * (1 + val / 100));
            updateData = { 
                regular_price: String(newReg), 
                sale_price: "", 
                date_on_sale_from: null, date_on_sale_to: null 
            };
            bot.sendMessage(chatId, `📈 زيادة ${val}% -> الجديد: ${newReg}`);
        }
        
        // 4. خصم نسبة (يحسب Sale Price)
        else if (state.action === 'single_decrease') {
            const newSale = Math.round(state.regularPrice * (1 - val / 100));
            updateData = { 
                regular_price: String(state.regularPrice), 
                sale_price: String(newSale),
                date_on_sale_from: null, date_on_sale_to: null
            };
            bot.sendMessage(chatId, `📉 خصم ${val}% -> العرض: ${newSale}`);
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

// دالة التحديث الجماعي
async function processBulkUpdate(chatId, state, percent) {
    bot.sendMessage(chatId, "🚀 جاري العمل...");
    let page = 1;
    let count = 0;

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
                updateData = { regular_price: String(newReg), sale_price: "", date_on_sale_from: null, date_on_sale_to: null };
            }
            else if (state.action === 'bulk_decrease') {
                const newSale = Math.round(oldReg * (1 - percent / 100));
                updateData = { regular_price: String(oldReg), sale_price: String(newSale), date_on_sale_from: null, date_on_sale_to: null };
            }

            await updateProductSmart(null, { id: p.id, type: p.type }, updateData);
            count++;
            await new Promise(r => setTimeout(r, 200));
        }
        page++;
    }
    bot.sendMessage(chatId, `✅ تم تحديث ${count} منتج.`);
}

// دالة التحديث الذكية
async function updateProductSmart(chatId, productState, data) {
    try {
        let parentData = { ...data };
        
        // لو متغير، لا تضع السعر في الأب
        if (productState.type === 'variable') {
            delete parentData.regular_price;
            delete parentData.sale_price;
        }
        parentData.date_on_sale_from = null;
        parentData.date_on_sale_to = null;

        if (Object.keys(parentData).length > 0) {
            await api.put(`products/${productState.id}`, parentData);
        }

        if (productState.type === 'variable') {
            const vars = await api.get(`products/${productState.id}/variations`, { per_page: 50 });
            if (vars.data.length > 0) {
                const promises = vars.data.map(v => api.put(`products/${productState.id}/variations/${v.id}`, data));
                await Promise.all(promises);
            }
        }
        
        // Force Sync
        await api.put(`products/${productState.id}`, { status: 'publish' });

        if (chatId) bot.sendMessage(chatId, `✅ تم.`);

    } catch (e) { 
        if(chatId) bot.sendMessage(chatId, "❌ خطأ."); 
        console.error(e);
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

bot.on('polling_error', (err) => { if (err.code !== 'EFATAL') console.log('Polling Error'); });
