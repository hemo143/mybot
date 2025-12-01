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
  timeout: 15000 // 👈 زيادة وقت الانتظار لـ 15 ثانية لحل مشكلة الصباح
});

// ==========================================
// 🛑 خريطة الأقسام (عدل الأرقام دي من موقعك)
// ==========================================
const CATEGORY_MAP = [
    { name: '❄️ تلاجات', id: 101 },  // مثال: غير الرقم 101 بالرقم الحقيقي
    { name: '📺 شاشات', id: 102 },
    { name: '🧺 غسالات', id: 103 },
    { name: '🔥 بوتاجازات', id: 104 }
];

// ==========================================
// 2. تشغيل السيرفر (عشان Render)
// ==========================================
const bot = new TelegramBot(token, {polling: true});
const userStates = {}; 

app.get('/', (req, res) => res.send('Bot is running 24/7 with Timeout fix!'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));

console.log('✅ البوت النهائي جاهز...');

// ==========================================
// 3. منطق البوت
// ==========================================

// استقبال الرسائل
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

            const response = await api.get("products", { slug: slug, _fields: 'id,name,price,regular_price,stock_status,categories' });

            if (response.data.length > 0) {
                const product = response.data[0];
                const catName = product.categories.length > 0 ? product.categories[0].name : 'بدون قسم';

                userStates[chatId] = { id: product.id, name: product.name, price: product.regular_price, step: 'idle' };

                const stockEmoji = product.stock_status === 'instock' ? '🟢 متاح' : '🔴 نفذ';
                const caption = `✅ *${product.name}*\n\n💰 *السعر:* ${product.price}\n📦 *المخزون:* ${stockEmoji}\n📂 *القسم:* ${catName}\n\n👇 *اختار إجراء:*`;
                
                const options = {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '💰 سعر مباشر', callback_data: 'edit_price' },
                                { text: '🏷️ خصم %', callback_data: 'discount_percent' }
                            ],
                            [
                                { text: '📦 حالة المخزون', callback_data: 'toggle_stock' },
                                { text: '📂 نقل القسم', callback_data: 'change_category' }
                            ],
                            [
                                { text: '✏️ تعديل الاسم', callback_data: 'edit_name' },
                                { text: '❌ إلغاء', callback_data: 'cancel' }
                            ]
                        ]
                    }
                };
                bot.sendMessage(chatId, caption, options);
            } else {
                bot.sendMessage(chatId, "❌ المنتج غير موجود.");
            }
        } catch (error) {
            console.error(error);
            bot.sendMessage(chatId, "❌ خطأ في الاتصال (تأكد من الرابط).");
        }
    }

    // --- استقبال النصوص (سعر/اسم/خصم) ---
    if (userStates[chatId] && userStates[chatId].step !== 'idle') {
        const state = userStates[chatId];
        const input = text; 

        // 1. تعديل السعر المباشر
        if (state.step === 'awaiting_price') {
            const price = toEnglish(input);
            if (!isNaN(price)) {
                await updateProduct(chatId, state.id, { regular_price: price, sale_price: "" });
                bot.sendMessage(chatId, `✅ السعر الجديد: ${price}`);
            } else {
                bot.sendMessage(chatId, "❌ اكتب رقم صحيح.");
            }
        }
        // 2. خصم نسبة مئوية
        else if (state.step === 'awaiting_discount') {
            const percent = toEnglish(input);
            if (!isNaN(percent)) {
                const oldPrice = parseFloat(state.price);
                const discountAmount = oldPrice * (percent / 100);
                const newPrice = Math.round(oldPrice - discountAmount);
                
                // تحديث: السعر الأصلي كما هو، وسعر البيع هو الجديد
                await updateProduct(chatId, state.id, { 
                    regular_price: oldPrice.toString(), 
                    sale_price: newPrice.toString() 
                });
                bot.sendMessage(chatId, `📉 *تم الخصم ${percent}%*\nالجديد: ${newPrice} ج.م`, {parse_mode: 'Markdown'});
            }
        }
        // 3. تعديل الاسم
        else if (state.step === 'awaiting_name') {
            await updateProduct(chatId, state.id, { name: input });
            bot.sendMessage(chatId, `📝 تم تعديل الاسم.`);
        }
        
        userStates[chatId].step = 'idle'; // إنهاء الوضع
    }
});

// --- معالجة الأزرار ---
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const action = query.data;

    if (!userStates[chatId]) return bot.sendMessage(chatId, "⚠️ الجلسة انتهت، ابعت الرابط تاني.");

    // نقل القسم
    if (action === 'change_category') {
        const catButtons = CATEGORY_MAP.map(cat => {
            return [{ text: cat.name, callback_data: `set_cat_${cat.id}` }];
        });
        bot.sendMessage(chatId, "📂 *اختار القسم الجديد:*", {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: catButtons }
        });
    }
    // تنفيذ نقل القسم
    else if (action.startsWith('set_cat_')) {
        const newCatId = action.split('_')[2];
        bot.sendMessage(chatId, "⏳ جاري النقل...");
        try {
            await api.put(`products/${userStates[chatId].id}`, { categories: [ { id: parseInt(newCatId) } ] });
            bot.sendMessage(chatId, "✅ تم النقل بنجاح!");
        } catch (e) { bot.sendMessage(chatId, "❌ فشل النقل."); }
    }
    // تعديل السعر
    else if (action === 'edit_price') {
        userStates[chatId].step = 'awaiting_price';
        bot.sendMessage(chatId, "💰 اكتب السعر الجديد (رقم فقط):");
    }
    // خصم نسبة
    else if (action === 'discount_percent') {
        userStates[chatId].step = 'awaiting_discount';
        bot.sendMessage(chatId, "🏷️ اكتب نسبة الخصم (مثال: 10):");
    }
    // تعديل الاسم
    else if (action === 'edit_name') {
        userStates[chatId].step = 'awaiting_name';
        bot.sendMessage(chatId, "✏️ اكتب الاسم الجديد:");
    }
    // حالة المخزون
    else if (action === 'toggle_stock') {
        bot.sendMessage(chatId, "⏳ جاري التغيير...");
        try {
            const current = await api.get(`products/${userStates[chatId].id}`);
            const newStatus = current.data.stock_status === 'instock' ? 'outofstock' : 'instock';
            await api.put(`products/${userStates[chatId].id}`, { stock_status: newStatus });
            bot.sendMessage(chatId, `📦 الحالة الجديدة: ${newStatus === 'instock' ? 'متاح 🟢' : 'نفذ 🔴'}`);
        } catch (e) { bot.sendMessage(chatId, "❌ خطأ."); }
    }
    // إلغاء
    else if (action === 'cancel') {
        bot.sendMessage(chatId, "❌ تم الإلغاء.");
        userStates[chatId].step = 'idle';
    }

    bot.answerCallbackQuery(query.id);
});

// دالة التحديث المركزية
async function updateProduct(chatId, id, data) {
    try { 
        await api.put(`products/${id}`, data); 
    } 
    catch (e) { 
        console.error(e);
        bot.sendMessage(chatId, "❌ حدث خطأ من الموقع."); 
    }
}

// دالة تحويل الأرقام
function toEnglish(str) { 
    if (!str) return NaN;
    return parseFloat(str.replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))); 
}

// تجاهل أخطاء الشبكة البسيطة
bot.on('polling_error', (err) => { 
    if (err.code !== 'EFATAL' && err.code !== 'ETIMEDOUT') console.log('Polling Error'); 
});
