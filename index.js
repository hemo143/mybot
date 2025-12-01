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
  timeout: 60000 // زمن انتظار دقيقة كاملة (عشان المنتجات التقيلة)
});

// ==========================================
// 🛑 خريطة الأقسام (عدل الأرقام دي من موقعك)
// ==========================================
const CATEGORY_MAP = [
    { name: '❄️ تلاجات', id: 101 },  
    { name: '📺 شاشات', id: 102 },
    { name: '🧺 غسالات', id: 103 },
    { name: '🔥 بوتاجازات', id: 104 }
];

// ==========================================
// تشغيل السيرفر والبوت
// ==========================================
const bot = new TelegramBot(token, {polling: true});
const userStates = {}; 

app.get('/', (req, res) => res.send('Bot is running with Variable Fix 2.0'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running`));

console.log('✅ البوت جاهز...');

// ==========================================
// منطق البوت
// ==========================================

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text) return;

    if (text === '/start') {
        bot.sendMessage(chatId, "👋 أهلاً بك! أرسل رابط المنتج للتحكم فيه.");
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
                
                // تحديد نوع المنتج
                const typeEmoji = product.type === 'variable' ? '🔀 متغير' : '📦 بسيط';

                userStates[chatId] = { 
                    id: product.id, 
                    name: product.name, 
                    price: product.price, 
                    type: product.type, // مهم جداً
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
            bot.sendMessage(chatId, "❌ خطأ اتصال.");
        }
    }

    // --- استقبال الأرقام والنصوص ---
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
            // الاسم عادي يتغير للأب
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
        bot.sendMessage(chatId, "📂 *اختار القسم:*", { parse_mode: 'Markdown', reply_markup: { inline_keyboard: catButtons } });
    }
    else if (action.startsWith('set_cat_')) {
        const newCatId = action.split('_')[2];
        bot.sendMessage(chatId, "⏳ جاري النقل...");
        try {
            await api.put(`products/${userStates[chatId].id}`, { categories: [ { id: parseInt(newCatId) } ] });
            bot.sendMessage(chatId, "✅ تم النقل.");
        } catch (e) { bot.sendMessage(chatId, "❌ فشل."); }
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
        bot.sendMessage(chatId, "✏️ اكتب الاسم:");
    }
    else if (action === 'toggle_stock') {
        bot.sendMessage(chatId, "⏳ جاري التغيير...");
        try {
            const current = await api.get(`products/${userStates[chatId].id}`);
            const newStatus = current.data.stock_status === 'instock' ? 'outofstock' : 'instock';
            await updateProductSmart(chatId, userStates[chatId], { stock_status: newStatus }, true);
        } catch (e) { bot.sendMessage(chatId, "❌ خطأ."); }
    }
    else if (action === 'cancel') {
        bot.sendMessage(chatId, "❌ تم الإلغاء.");
        userStates[chatId].step = 'idle';
    }
    bot.answerCallbackQuery(query.id);
});

// ==========================================
// 🔥 الدالة الذكية (المصححة) 🔥
// ==========================================
async function updateProductSmart(chatId, productState, data, isStock = false) {
    try {
        bot.sendMessage(chatId, "⏳ جاري التنفيذ...");

        // 1. تجهيز البيانات للأب (Parent)
        // لو المنتج متغير، بنعمل نسخة من البيانات ونشيل منها السعر
        // عشان الأب مبيقبلش السعر
        let parentData = { ...data };
        if (productState.type === 'variable' && !isStock) {
            delete parentData.regular_price;
            delete parentData.sale_price;
        }

        // 2. تحديث الأب (لو فيه داتا باقية زي الاسم أو المخزون)
        if (Object.keys(parentData).length > 0) {
            await api.put(`products/${productState.id}`, parentData);
        }

        // 3. لو المنتج "متغير"، نحدث الأبناء بالسعر
        if (productState.type === 'variable') {
            const variations = await api.get(`products/${productState.id}/variations`, { per_page: 50 });
            
            if (variations.data.length > 0) {
                const promises = variations.data.map(v => {
                    return api.put(`products/${productState.id}/variations/${v.id}`, data);
                });
                await Promise.all(promises);
                bot.sendMessage(chatId, `🔄 تم تحديث ${variations.data.length} لون/نوع داخل المنتج.`);
            } else {
                bot.sendMessage(chatId, `⚠️ المنتج متغير بس ملهوش نسخ فرعية!`);
            }
        }

        // رسالة الختام
        if (isStock) {
             bot.sendMessage(chatId, `✅ تم تغيير حالة المخزون.`);
        } else if (data.regular_price) {
             bot.sendMessage(chatId, `✅ تم تغيير السعر إلى ${data.regular_price} بنجاح.`);
        } else {
             bot.sendMessage(chatId, `✅ تم.`);
        }

    } catch (error) {
        console.error(error.response ? error.response.data : error);
        bot.sendMessage(chatId, `❌ حدث خطأ: ${error.message}`);
    }
}

function toEnglish(str) { 
    if (!str) return NaN;
    return parseFloat(str.replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))); 
}
bot.on('polling_error', (err) => { if (err.code !== 'EFATAL') console.log('Network Error'); });
