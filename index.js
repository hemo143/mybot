const TelegramBot = require('node-telegram-bot-api');
const WooCommerceRestApi = require("@woocommerce/woocommerce-rest-api").default;
const express = require('express');
const nodemailer = require('nodemailer'); // مكتبة الإيميل
const app = express();

// ==========================================
// 1. الإعدادات (التوكن - الموقع - الإيميل)
// ==========================================
const token = '8337368193:AAFjUtxdXIRvaaPdpOU3-xogvKwRKG2xidU'; // توكن تليجرام

// إعدادات الموقع
const api = new WooCommerceRestApi({
  url: "https://alhaythamgroup.com",
  consumerKey: "ck_f00a31ed7fd2d31ca3cc76c4d308adb67ee82e74",
  consumerSecret: "cs_5f422a1e9fa95e7545c65403b702a59f7a8efc67",
  version: "wc/v3",
  queryStringAuth: true,
  timeout: 60000 
});

// إعدادات إرسال الإيميل
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'influencetargetingmarketing3@gmail.com', // إيميل الراسل (بتاعك)
    pass: 'xxxx xxxx xxxx xxxx' // ⚠️ هنا تضع App Password (وليس باسوورد الإيميل العادي)
  }
});
const ADMIN_EMAIL = 'influencetargetingmarketing3@gmail.com'; // الإيميل اللي هيستقبل الطلبات

// ==========================================
// تشغيل السيرفر
// ==========================================
const bot = new TelegramBot(token, {polling: true});
const userStates = {}; // ذاكرة المستخدم
app.get('/', (req, res) => res.send('Advanced Bot Running...'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running`));

console.log('✅ البوت الاحترافي جاهز...');

// ==========================================
// 2. القائمة الرئيسية
// ==========================================
function showMainMenu(chatId) {
    const opts = {
        reply_markup: {
            keyboard: [
                ['📦 تعديل سعر منتج (رابط)'],
                ['📂 تعديل أسعار تصنيف كامل'],
                ['🌍 تعديل أسعار جميع المنتجات'],
                ['📩 طلبات أخرى / دعم']
            ],
            resize_keyboard: true,
            one_time_keyboard: false
        }
    };
    bot.sendMessage(chatId, "👋 أهلاً بك يا مدير!\nاختر خدمة من القائمة:", opts);
}

// ==========================================
// 3. معالجة الرسائل
// ==========================================
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text) return;

    // زر البداية أو أي كلمة ترحيب
    if (text === '/start' || text === 'مرحبا' || text === 'هلا' || text === 'menu' || text === 'قائمة') {
        userStates[chatId] = { step: 'idle' };
        showMainMenu(chatId);
        return;
    }

    // --- توجيه القائمة الرئيسية ---
    if (text === '📦 تعديل سعر منتج (رابط)') {
        userStates[chatId] = { step: 'waiting_product_link' };
        bot.sendMessage(chatId, "🔗 من فضلك أرسل *رابط المنتج* الآن:", {parse_mode: 'Markdown', reply_markup: { remove_keyboard: true }});
    }
    else if (text === '📂 تعديل أسعار تصنيف كامل') {
        // نعرض الأقسام الموجودة للاختيار
        try {
            bot.sendMessage(chatId, "⏳ جاري جلب الأقسام...");
            const cats = await api.get("products/categories", { per_page: 20 });
            const catButtons = cats.data.map(c => [{ text: c.name, callback_data: `cat_${c.id}_${c.name}` }]);
            
            bot.sendMessage(chatId, "📂 اختر التصنيف الذي تريد تعديل أسعاره:", {
                reply_markup: { inline_keyboard: catButtons }
            });
        } catch (e) { bot.sendMessage(chatId, "❌ خطأ في جلب الأقسام."); }
    }
    else if (text === '🌍 تعديل أسعار جميع المنتجات') {
        bot.sendMessage(chatId, "⚠️ *تحذير:* هذا الخيار سيقوم بتعديل سعر *كل المنتجات في الموقع*.\n\nهل أنت متأكد؟", {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ نعم، استمر', callback_data: 'all_products_confirm' }],
                    [{ text: '❌ إلغاء', callback_data: 'cancel_main' }]
                ]
            }
        });
    }
    else if (text === '📩 طلبات أخرى / دعم') {
        userStates[chatId] = { step: 'waiting_support_msg' };
        bot.sendMessage(chatId, "📝 اكتب رسالتك أو طلبك الآن، وسأقوم بإرساله للإدارة فوراً:", { reply_markup: { remove_keyboard: true }});
    }

    // --- معالجة المدخلات حسب الحالة ---
    else if (userStates[chatId]) {
        const state = userStates[chatId];

        // 1. استلام رابط المنتج
        if (state.step === 'waiting_product_link') {
            if (text.includes('http')) {
                // ... (نفس كود البحث عن المنتج القديم) ...
                processProductLink(chatId, text);
            } else {
                bot.sendMessage(chatId, "❌ هذا ليس رابطاً صحيحاً. حاول مرة أخرى أو اكتب /start للرجوع.");
            }
        }

        // 2. استلام القيمة (السعر أو النسبة) لمنتج واحد
        else if (state.step === 'waiting_product_value') {
            processProductUpdate(chatId, text);
        }

        // 3. استلام النسبة للتصنيف أو الكل
        else if (state.step === 'waiting_bulk_percent') {
            processBulkUpdate(chatId, text);
        }

        // 4. استلام رسالة الدعم
        else if (state.step === 'waiting_support_msg') {
            sendSupportEmail(chatId, text, msg.from.first_name);
        }
    }
});

// ==========================================
// 4. معالجة الأزرار (Callbacks)
// ==========================================
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    // زرار الإلغاء
    if (data === 'cancel_main') {
        bot.sendMessage(chatId, "تم الإلغاء.");
        showMainMenu(chatId);
        return;
    }

    // --- خيارات منتج واحد ---
    if (['opt_increase', 'opt_decrease', 'opt_fixed'].includes(data)) {
        userStates[chatId].actionType = data;
        userStates[chatId].step = 'waiting_product_value';
        
        let msgText = "";
        if (data === 'opt_increase') msgText = "📈 أدخل نسبة الزيادة % (رقم فقط):";
        if (data === 'opt_decrease') msgText = "📉 أدخل نسبة التخفيض % (رقم فقط):";
        if (data === 'opt_fixed') msgText = "💰 أدخل السعر الجديد (القيمة):";
        
        bot.sendMessage(chatId, msgText);
    }

    // --- خيارات التصنيف ---
    else if (data.startsWith('cat_')) {
        const [_, catId, catName] = data.split('_');
        userStates[chatId] = { step: 'waiting_bulk_percent', target: 'category', catId: catId, catName: catName };
        
        bot.sendMessage(chatId, `📂 تصنيف: *${catName}*\n\nاختار نوع التعديل:`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📈 زيادة السعر %', callback_data: 'bulk_inc' }],
                    [{ text: '📉 تنزيل السعر %', callback_data: 'bulk_dec' }]
                ]
            }
        });
    }

    // --- خيارات الكل ---
    else if (data === 'all_products_confirm') {
        userStates[chatId] = { step: 'waiting_bulk_percent', target: 'all' };
        bot.sendMessage(chatId, `🌍 *تعديل شامل لكل المنتجات*\n\nاختار نوع التعديل:`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📈 زيادة السعر %', callback_data: 'bulk_inc' }],
                    [{ text: '📉 تنزيل السعر %', callback_data: 'bulk_dec' }]
                ]
            }
        });
    }

    // --- تحديد نوع العملية للجملة (زيادة/نقصان) ---
    else if (data === 'bulk_inc' || data === 'bulk_dec') {
        if (!userStates[chatId]) return;
        userStates[chatId].bulkType = data; // bulk_inc or bulk_dec
        bot.sendMessage(chatId, "🔢 اكتب النسبة المئوية الآن (مثال: 10):");
    }

    bot.answerCallbackQuery(query.id);
});

// ==========================================
// الدوال المساعدة (Logic Helpers)
// ==========================================

// 1. معالجة رابط منتج واحد
async function processProductLink(chatId, text) {
    bot.sendMessage(chatId, "🔎 جاري البحث...");
    try {
        let cleanUrl = decodeURIComponent(text.split('?')[0]);
        if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
        const slug = cleanUrl.split('/').pop();
        const response = await api.get("products", { slug: slug });

        if (response.data.length > 0) {
            const product = response.data[0];
            // حفظ المنتج في الذاكرة
            userStates[chatId].productId = product.id;
            userStates[chatId].productPrice = product.regular_price || product.price;
            userStates[chatId].productType = product.type;

            bot.sendMessage(chatId, `✅ *${product.name}*\n💰 السعر الحالي: ${userStates[chatId].productPrice}\n\n👇 اختر العملية:`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '1- زيادة في السعر %', callback_data: 'opt_increase' }],
                        [{ text: '2- تنزيل السعر %', callback_data: 'opt_decrease' }],
                        [{ text: '3- تعديل قيمة السعر', callback_data: 'opt_fixed' }]
                    ]
                }
            });
        } else {
            bot.sendMessage(chatId, "❌ المنتج غير موجود.");
            showMainMenu(chatId);
        }
    } catch (e) { bot.sendMessage(chatId, "❌ خطأ."); }
}

// 2. تنفيذ تحديث منتج واحد
async function processProductUpdate(chatId, text) {
    const value = parseFloat(text);
    if (isNaN(value)) { bot.sendMessage(chatId, "❌ رقم غير صحيح."); return; }

    const state = userStates[chatId];
    let newPrice = 0;
    let oldPrice = parseFloat(state.productPrice);

    if (state.actionType === 'opt_fixed') {
        newPrice = value;
    } else if (state.actionType === 'opt_increase') {
        newPrice = oldPrice + (oldPrice * (value / 100));
    } else if (state.actionType === 'opt_decrease') {
        newPrice = oldPrice - (oldPrice * (value / 100));
    }

    newPrice = Math.round(newPrice); // تقريب الرقم

    // استخدام دالة التحديث القوية بتاعتنا
    await updateProductSmart(chatId, { id: state.productId, type: state.productType }, { regular_price: String(newPrice), sale_price: "" });
    
    // رجوع للقائمة
    userStates[chatId] = { step: 'idle' };
    setTimeout(() => showMainMenu(chatId), 3000);
}

// 3. تنفيذ التحديث الجماعي (تصنيف أو كل)
async function processBulkUpdate(chatId, text) {
    const percent = parseFloat(text);
    if (isNaN(percent)) { bot.sendMessage(chatId, "❌ نسبة غير صحيحة."); return; }

    const state = userStates[chatId];
    bot.sendMessage(chatId, "🚀 جاري بدء التحديث الجماعي.. العملية قد تستغرق وقتاً، سأبلغك عند الانتهاء.");

    try {
        let page = 1;
        let productsUpdated = 0;
        
        while (true) {
            let params = { per_page: 20, page: page, status: 'publish' };
            if (state.target === 'category') params.category = state.catId;

            const res = await api.get("products", params);
            if (res.data.length === 0) break; // خلصنا

            // Loop على المنتجات
            for (const product of res.data) {
                let oldPrice = parseFloat(product.regular_price || product.price);
                if (!oldPrice) continue;

                let newPrice = 0;
                if (state.bulkType === 'bulk_inc') newPrice = oldPrice + (oldPrice * (percent / 100));
                else newPrice = oldPrice - (oldPrice * (percent / 100));
                
                newPrice = Math.round(newPrice);

                // تحديث صامت (بدون رسائل لكل منتج)
                await updateProductSmart(null, { id: product.id, type: product.type }, { regular_price: String(newPrice), sale_price: "" });
                productsUpdated++;
            }
            page++;
        }
        
        bot.sendMessage(chatId, `✅ *تم الانتهاء!* تم تحديث أسعار ${productsUpdated} منتج بنجاح.`, {parse_mode: 'Markdown'});
        showMainMenu(chatId);

    } catch (e) {
        bot.sendMessage(chatId, "❌ حدث خطأ أثناء التحديث الجماعي.");
    }
    userStates[chatId] = { step: 'idle' };
}

// 4. إرسال الإيميل
async function sendSupportEmail(chatId, msgText, userName) {
    bot.sendMessage(chatId, "⏳ جاري إرسال الطلب للإيميل...");
    
    const mailOptions = {
        from: 'influencetargetingmarketing3@gmail.com',
        to: ADMIN_EMAIL,
        subject: `طلب جديد من البوت - ${userName}`,
        text: `رسالة من المستخدم (ID: ${chatId}):\n\n${msgText}`
    };

    try {
        await transporter.sendMail(mailOptions);
        bot.sendMessage(chatId, "✅ تم إرسال طلبك للإدارة بنجاح.");
    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, "❌ فشل إرسال الإيميل (تأكد من إعدادات App Password).");
    }
    showMainMenu(chatId);
}

// دالة التحديث الأساسية (نفس القديمة القوية)
async function updateProductSmart(chatId, productState, data) {
    try {
        let parentData = { ...data };
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
            const variations = await api.get(`products/${productState.id}/variations`, { per_page: 50 });
            if (variations.data.length > 0) {
                const promises = variations.data.map(v => api.put(`products/${productState.id}/variations/${v.id}`, data));
                await Promise.all(promises);
            }
        }
        
        // إبلاغ المستخدم (فقط لو فيه ChatId)
        if (chatId) bot.sendMessage(chatId, `✅ تم التحديث.`);

    } catch (e) { if(chatId) bot.sendMessage(chatId, "❌ خطأ."); }
}

bot.on('polling_error', (err) => { if (err.code !== 'EFATAL') console.log('Network Error'); });
