const TelegramBot = require('node-telegram-bot-api');
const WooCommerceRestApi = require("@woocommerce/woocommerce-rest-api").default;
const express = require('express');
const app = express();

// ==========================================
// 1. التوكن ومفاتيح الموقع
// ==========================================
const token = '8337368193:AAFjUtxdXIRvaaPdpOU3-xogvKwRKG2xidU'; // توكن تليجرام

const api = new WooCommerceRestApi({
  url: "https://alhaythamgroup.com",
  consumerKey: "ck_f00a31ed7fd2d31ca3cc76c4d308adb67ee82e74",
  consumerSecret: "cs_5f422a1e9fa95e7545c65403b702a59f7a8efc67",
  version: "wc/v3",
  queryStringAuth: true
});

// ==========================================
// 2. تشغيل البوت والسيرفر
// ==========================================
const bot = new TelegramBot(token, {polling: true});
const userStates = {}; // ذاكرة لمعرفة المستخدم بيعمل إيه حالياً

// كود السيرفر عشان Render يفضل شغال
app.get('/', (req, res) => res.send('Bot is running 24/7!'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server on port ${port}`));

console.log('✅ بوت لوحة التحكم جاهز...');

// ==========================================
// 3. منطق البوت
// ==========================================

// استقبال الرسائل
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text) return;

    // زر البداية
    if (text === '/start') {
        bot.sendMessage(chatId, "👋 أهلاً بك في لوحة تحكم الهيثم!\nأرسل رابط المنتج عشان أظهرلك الخيارات.");
        return;
    }

    // --- استقبال الرابط (السيناريو الأول) ---
    if (text.includes('http') && text.includes('/product/')) {
        bot.sendMessage(chatId, "🔎 جاري فحص المنتج...");

        try {
            let cleanUrl = text.split('?')[0];
            if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
            cleanUrl = decodeURIComponent(cleanUrl);
            const slug = cleanUrl.split('/').pop();

            const response = await api.get("products", { slug: slug, _fields: 'id,name,price,regular_price,stock_status,permalink' });

            if (response.data.length > 0) {
                const product = response.data[0];
                
                // حفظ المنتج في الذاكرة
                userStates[chatId] = { id: product.id, name: product.name, price: product.regular_price, step: 'idle' };

                // حالة المخزون الحالية
                const stockEmoji = product.stock_status === 'instock' ? '🟢 متاح' : '🔴 غير متاح';

                // رسالة المنتج مع الأزرار
                const caption = `✅ *${product.name}*\n\n💰 *السعر الحالي:* ${product.price} ج.م\n📦 *المخزون:* ${stockEmoji}\n\n👇 *اختار عايز تعمل إيه:*`;
                
                const options = {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '💰 تغيير السعر', callback_data: 'edit_price' },
                                { text: '🏷️ خصم نسبة %', callback_data: 'discount_percent' }
                            ],
                            [
                                { text: '📦 عكس حالة المخزون', callback_data: 'toggle_stock' },
                                { text: '✏️ تعديل الاسم', callback_data: 'edit_name' }
                            ],
                            [
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
            bot.sendMessage(chatId, "❌ خطأ في الاتصال.");
        }
        return; // خروج عشان ميكملش باقي الكود
    }

    // --- استقبال المدخلات (أرقام أو نصوص) بناءً على الزرار المضغوط ---
    if (userStates[chatId] && userStates[chatId].step !== 'idle') {
        const state = userStates[chatId];
        const input = text; // النص اللي العميل بعته

        // 1. لو المستخدم بيعدل السعر المباشر
        if (state.step === 'awaiting_price') {
            const price = toEnglish(input);
            if (!isNaN(price)) {
                await updateProduct(chatId, state.id, { regular_price: price, sale_price: "" });
                bot.sendMessage(chatId, `✅ تم تغيير السعر إلى: ${price}`);
            } else {
                bot.sendMessage(chatId, "❌ ده مش رقم! حاول تاني.");
            }
        }

        // 2. لو المستخدم بيعمل خصم نسبة %
        else if (state.step === 'awaiting_discount') {
            const percent = toEnglish(input); // مثلاً 10
            if (!isNaN(percent)) {
                // العملية الحسابية
                const oldPrice = parseFloat(state.price);
                const discountAmount = oldPrice * (percent / 100);
                const newPrice = Math.round(oldPrice - discountAmount);

                // تحديث المنتج (نحط السعر الأصلي في regular والجديد في sale)
                await updateProduct(chatId, state.id, { 
                    regular_price: oldPrice.toString(),
                    sale_price: newPrice.toString()
                });
                
                bot.sendMessage(chatId, `📉 *تم تطبيق الخصم ${percent}%*\n\nالسعر القديم: ~~${oldPrice}~~ ج.م\nالسعر الجديد: *${newPrice}* ج.م`, {parse_mode: 'Markdown'});
            } else {
                bot.sendMessage(chatId, "❌ اكتب رقم النسبة فقط (مثال: 10).");
            }
        }

        // 3. لو المستخدم بيعدل الاسم
        else if (state.step === 'awaiting_name') {
            await updateProduct(chatId, state.id, { name: input });
            bot.sendMessage(chatId, `📝 تم تغيير الاسم إلى:\n${input}`);
        }

        // تصفير الحالة
        userStates[chatId].step = 'idle';
    }
});

// --- معالجة ضغطات الأزرار ---
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const action = query.data;
    
    // لو مفيش منتج محفوظ، اطلب الرابط تاني
    if (!userStates[chatId]) {
        bot.sendMessage(chatId, "⚠️ الجلسة انتهت، ابعت الرابط تاني.");
        return;
    }

    const productName = userStates[chatId].name;

    if (action === 'edit_price') {
        userStates[chatId].step = 'awaiting_price';
        bot.sendMessage(chatId, `💰 *تعديل السعر المباشر*\nالمنتج: ${productName}\n\nاكتب السعر الجديد الآن (رقم فقط):`, {parse_mode: 'Markdown'});
    } 
    else if (action === 'discount_percent') {
        userStates[chatId].step = 'awaiting_discount';
        bot.sendMessage(chatId, `🏷️ *عمل خصم نسبة %*\nالمنتج: ${productName}\nالسعر الأصلي: ${userStates[chatId].price}\n\nاكتب نسبة الخصم (مثال: اكتب 10 لخصم 10%):`, {parse_mode: 'Markdown'});
    }
    else if (action === 'edit_name') {
        userStates[chatId].step = 'awaiting_name';
        bot.sendMessage(chatId, `📝 *تعديل الاسم*\nالاسم الحالي: ${productName}\n\nاكتب الاسم الجديد كاملاً:`, {parse_mode: 'Markdown'});
    }
    else if (action === 'toggle_stock') {
        bot.sendMessage(chatId, "⏳ جاري تغيير حالة المخزون...");
        // نجيب الحالة الحالية ونعكسها
        try {
            const current = await api.get(`products/${userStates[chatId].id}`);
            const newStatus = current.data.stock_status === 'instock' ? 'outofstock' : 'instock';
            const statusText = newStatus === 'instock' ? '🟢 متاح' : '🔴 غير متاح (نفذت الكمية)';
            
            await api.put(`products/${userStates[chatId].id}`, { stock_status: newStatus });
            bot.sendMessage(chatId, `📦 تم تغيير الحالة إلى: ${statusText}`);
        } catch (e) {
            bot.sendMessage(chatId, "❌ فشل تغيير المخزون.");
        }
    }
    else if (action === 'cancel') {
        bot.sendMessage(chatId, "❌ تم الإلغاء.");
        userStates[chatId].step = 'idle';
    }

    // إخفاء الأزرار القديمة عشان الزحمة
    bot.answerCallbackQuery(query.id);
});

// دوال مساعدة
async function updateProduct(chatId, id, data) {
    try {
        await api.put(`products/${id}`, data);
    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, "❌ حدث خطأ أثناء التحديث.");
    }
}

function toEnglish(str) {
    return parseFloat(str.replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

// معالجة أخطاء الشبكة
bot.on('polling_error', (error) => {
    if (error.code !== 'EFATAL' && error.code !== 'ETIMEDOUT') console.log(`⚠️ Network Error`);
});
