const TelegramBot = require('node-telegram-bot-api');
const WooCommerceRestApi = require("@woocommerce/woocommerce-rest-api").default;
const express = require('express');
const app = express();

// ==========================================
// 1. التوكن ومفاتيح الموقع
// ==========================================
const token = '8337368193:AAFjUtxdXIRvaaPdpOU3-xogvKwRKG2xidU';

const api = new WooCommerceRestApi({
  url: "https://alhaythamgroup.com",
  consumerKey: "ck_f00a31ed7fd2d31ca3cc76c4d308adb67ee82e74",
  consumerSecret: "cs_5f422a1e9fa95e7545c65403b702a59f7a8efc67",
  version: "wc/v3",
  queryStringAuth: true,
  timeout: 20000 // زمن انتظار أطول للمنتجات المتغيرة
});

// ==========================================
// 🛑 خريطة الأقسام (تأكد من الأرقام)
// ==========================================
const CATEGORY_MAP = [
    { name: '❄️ تلاجات', id: 101 },
    { name: '📺 شاشات', id: 102 },
    { name: '🧺 غسالات', id: 103 },
    { name: '🔥 بوتاجازات', id: 104 }
];

// تشغيل السيرفر
const bot = new TelegramBot(token, {polling: true});
const userStates = {}; 
app.get('/', (req, res) => res.send('Bot is running (Variable Product Support Added)'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running`));

console.log('✅ البوت (النسخة المتغيرة) جاهز...');

// ==========================================
// 2. منطق البوت
// ==========================================

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text) return;

    if (text === '/start') {
        bot.sendMessage(chatId, "👋 أهلاً بك! أرسل رابط المنتج للتحكم فيه (يدعم المنتجات المتغيرة).");
        return;
    }

    // --- استقبال الرابط ---
    if (text.includes('http') && text.includes('/product/')) {
        bot.sendMessage(chatId, "🔎 جاري الفحص...");

        try {
            let cleanUrl = decodeURIComponent(text.split('?')[0]);
            if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
            const slug = cleanUrl.split('/').pop();

            const response = await api.get("products", { slug: slug });

            if (response.data.length > 0) {
                const product = response.data[0];
                const catName = product.categories.length > 0 ? product.categories[0].name : 'بدون قسم';
                
                // تحديد نوع المنتج (بسيط أم متغير)
                const typeEmoji = product.type === 'variable' ? '🔀 منتج متغير' : '📦 منتج بسيط';

                userStates[chatId] = { 
                    id: product.id, 
                    name: product.name, 
                    price: product.price, 
                    type: product.type, // حفظ النوع
                    step: 'idle' 
                };

                const stockEmoji = product.stock_status === 'instock' ? '🟢 متاح' : '🔴 نفذ';
                const caption = `✅ *${product.name}*\nℹ️ *النوع:* ${typeEmoji}\n💰 *السعر:* ${product.price}\n📦 *المخزون:* ${stockEmoji}\n📂 *القسم:* ${catName}\n\n👇 *اختار إجراء:*`;
                
                const options = {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [ { text: '💰 سعر مباشر', callback_data: 'edit_price' }, { text: '🏷️ خصم %', callback_data: 'discount_percent' } ],
                            [ { text: '📦 حالة المخزون', callback_data: 'toggle_stock' }, { text: '📂 نقل القسم', callback_data: 'change_category' } ],
                            [ { text: '✏️ تعديل الاسم', callback_data: 'edit_name' }, { text: '❌ إلغاء', callback_data: 'cancel' } ]
                        ]
                    }
                };
                bot.sendMessage(chatId, caption, options);
            } else {
                bot.sendMessage(chatId, "❌ المنتج غير موجود.");
            }
        } catch (error) {
            console.error(error);
            bot.sendMessage(chatId, "❌ خطأ في الاتصال.");
        }
    }

    // --- استقبال المدخلات ---
    if (userStates[chatId] && userStates[chatId].step !== 'idle') {
        const state = userStates[chatId];
        const input = text; 

        if (state.step === 'awaiting_price') {
            const price = toEnglish(input);
            if (!isNaN(price)) {
                await updateProductSmart(chatId, state, { regular_price: price, sale_price: "" });
            } else {
                bot.sendMessage(chatId, "❌ رقم غير صحيح.");
            }
        }
        else if (state.step === 'awaiting_discount') {
            const percent = toEnglish(input);
            if (!isNaN(percent)) {
                const oldPrice = parseFloat(state.price);
                const discountAmount = oldPrice * (percent / 100);
                const newPrice = Math.round(oldPrice - discountAmount);
                await updateProductSmart(chatId, state, { regular_price: oldPrice.toString(), sale_price: newPrice.toString() });
            }
        }
        else if (state.step === 'awaiting_name') {
            await api.put(`products/${state.id}`, { name: input });
            bot.sendMessage(chatId, `📝 تم تعديل الاسم.`);
        }
        
        userStates[chatId].step = 'idle';
    }
});

// --- معالجة الأزرار ---
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const action = query.data;

    if (!userStates[chatId]) return bot.sendMessage(chatId, "⚠️ الجلسة انتهت.");

    if (action === 'change_category') {
        const catButtons = CATEGORY_MAP.map(cat => [{ text: cat.name, callback_data: `set_cat_${cat.id}` }]);
        bot.sendMessage(chatId, "📂 *اختار القسم الجديد:*", { parse_mode: 'Markdown', reply_markup: { inline_keyboard: catButtons } });
    }
    else if (action.startsWith('set_cat_')) {
        const newCatId = action.split('_')[2];
        bot.sendMessage(chatId, "⏳ جاري النقل...");
        try {
            await api.put(`products/${userStates[chatId].id}`, { categories: [ { id: parseInt(newCatId) } ] });
            bot.sendMessage(chatId, "✅ تم النقل.");
        } catch (e) { bot.sendMessage(chatId, "❌ فشل النقل."); }
    }
    else if (action === 'edit_price') {
        userStates[chatId].step = 'awaiting_price';
        bot.sendMessage(chatId, "💰 اكتب السعر الجديد:");
    }
    else if (action === 'discount_percent') {
        userStates[chatId].step = 'awaiting_discount';
        bot.sendMessage(chatId, "🏷️ اكتب نسبة الخصم:");
    }
    else if (action === 'edit_name') {
        userStates[chatId].step = 'awaiting_name';
        bot.sendMessage(chatId, "✏️ اكتب الاسم الجديد:");
    }
    else if (action === 'toggle_stock') {
        bot.sendMessage(chatId, "⏳ جاري التغيير...");
        try {
            const current = await api.get(`products/${userStates[chatId].id}`);
            const newStatus = current.data.stock_status === 'instock' ? 'outofstock' : 'instock';
            await updateProductSmart(chatId, userStates[chatId], { stock_status: newStatus }, true); // true = stock update
        } catch (e) { bot.sendMessage(chatId, "❌ خطأ."); }
    }
    else if (action === 'cancel') {
        bot.sendMessage(chatId, "❌ تم الإلغاء.");
        userStates[chatId].step = 'idle';
    }
    bot.answerCallbackQuery(query.id);
});

// ==========================================
// 🔥 الدالة الذكية (تحديث المتغير والبسيط)
// ==========================================
async function updateProductSmart(chatId, productState, data, isStock = false) {
    try {
        bot.sendMessage(chatId, "⏳ جاري التحديث (قد يستغرق وقتاً للمنتجات المتغيرة)...");

        // 1. تحديث المنتج الرئيسي (الأب)
        await api.put(`products/${productState.id}`, data);

        // 2. لو المنتج "متغير" (Variable)، لازم نحدث ولاده كلهم
        if (productState.type === 'variable') {
            // جلب كل النسخ (Variations)
            const variations = await api.get(`products/${productState.id}/variations`, { per_page: 100 });
            
            if (variations.data.length > 0) {
                const promises = variations.data.map(v => {
                    return api.put(`products/${productState.id}/variations/${v.id}`, data);
                });
                // تنفيذ التحديث للكل في نفس الوقت
                await Promise.all(promises);
                bot.sendMessage(chatId, `🔄 تم تحديث ${variations.data.length} نسخة فرعية للمنتج.`);
            }
        }

        // رسالة النجاح النهائية
        if (isStock) {
             bot.sendMessage(chatId, `✅ تم تغيير حالة المخزون بنجاح.`);
        } else if (data.regular_price) {
             bot.sendMessage(chatId, `✅ تم تغيير السعر إلى ${data.regular_price} بنجاح.`);
        } else {
             bot.sendMessage(chatId, `✅ تم التحديث بنجاح.`);
        }

    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, "❌ حدث خطأ أثناء التحديث.");
    }
}

function toEnglish(str) { 
    if (!str) return NaN;
    return parseFloat(str.replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))); 
}
bot.on('polling_error', (err) => { if (err.code !== 'EFATAL') console.log('Network Error'); });
