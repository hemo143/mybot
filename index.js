const TelegramBot = require('node-telegram-bot-api');
const WooCommerceRestApi = require("@woocommerce/woocommerce-rest-api").default;
const express = require('express');
const nodemailer = require('nodemailer');
const app = express();

// ==========================================
// 1. الإعدادات (تم وضع جميع البيانات)
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

// إعدادات الإيميل (تمت الإضافة بنجاح ✅)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'influencetargetingmarketing3@gmail.com',
    pass: 'cfsq nuen hozc mucu' // كلمة سر التطبيقات
  }
});
const ADMIN_EMAIL = 'influencetargetingmarketing3@gmail.com';

// ==========================================
// تشغيل السيرفر
// ==========================================
const bot = new TelegramBot(token, {polling: true});
const userStates = {}; 
app.get('/', (req, res) => res.send('Master Pricing Bot Running V3...'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running`));

console.log('✅ البوت الشامل جاهز...');

// ==========================================
// 2. القائمة الرئيسية (Main Menu)
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
    bot.sendMessage(chatId, "👋 مرحباً بك في لوحة التحكم! اختر العملية:", opts);
}

// ==========================================
// 3. معالجة الرسائل
// ==========================================
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text) return;

    // أوامر البداية
    if (['/start', 'مرحبا', 'هلا', 'menu', 'قائمة'].includes(text.toLowerCase())) {
        userStates[chatId] = { step: 'idle' };
        showMainMenu(chatId);
        return;
    }

    // 1️⃣ تعديل سعر منتج واحد
    if (text === '📦 تعديل سعر منتج (رابط)') {
        userStates[chatId] = { step: 'waiting_product_link' };
        bot.sendMessage(chatId, "🔗 أرسل رابط المنتج الآن:", { reply_markup: { remove_keyboard: true }});
    }

    // 2️⃣ تعديل تصنيف كامل
    else if (text === '📂 تعديل أسعار تصنيف كامل') {
        bot.sendMessage(chatId, "⏳ جاري جلب التصنيفات...");
        try {
            const cats = await api.get("products/categories", { per_page: 20 });
            const catButtons = cats.data.map(c => [{ text: c.name, callback_data: `cat_${c.id}_${c.name}` }]);
            
            bot.sendMessage(chatId, "📂 اختر التصنيف الذي تريد تعديل أسعاره:", {
                reply_markup: { inline_keyboard: catButtons }
            });
        } catch (e) { bot.sendMessage(chatId, "❌ خطأ في جلب الأقسام."); }
    }

    // 3️⃣ تعديل كل المنتجات
    else if (text === '🌍 تعديل أسعار جميع المنتجات') {
        bot.sendMessage(chatId, "⚠️ *تحذير خطير:*\nهذا الخيار سيقوم بتعديل سعر *كل المنتجات في الموقع*.\n\nاختر العملية:", {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📈 زيادة شاملة %', callback_data: 'bulk_all_inc' }],
                    [{ text: '📉 تخفيض شامل %', callback_data: 'bulk_all_dec' }]
                ]
            }
        });
    }

    // 4️⃣ طلبات أخرى (إيميل)
    else if (text === '📩 طلبات أخرى / دعم') {
        userStates[chatId] = { step: 'waiting_support_msg' };
        bot.sendMessage(chatId, "📝 اكتب رسالتك أو طلبك الآن، وسأقوم بإرساله للإيميل فوراً:", { reply_markup: { remove_keyboard: true }});
    }

    // --- معالجة المدخلات حسب الحالة ---
    else if (userStates[chatId]) {
        const state = userStates[chatId];

        // معالجة الرابط
        if (state.step === 'waiting_product_link') {
            if (text.includes('http')) processProductLink(chatId, text);
            else bot.sendMessage(chatId, "❌ رابط غير صحيح.");
        }

        // معالجة القيم (أرقام أو نسب)
        else if (state.step === 'waiting_value') {
            processValueInput(chatId, text);
        }

        // معالجة رسالة الدعم
        else if (state.step === 'waiting_support_msg') {
            sendEmail(chatId, text, msg.from.first_name);
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
    if (data === 'single_inc') {
        userStates[chatId].action = 'single_increase';
        userStates[chatId].step = 'waiting_value';
        bot.sendMessage(chatId, "📈 اكتب نسبة الزيادة % (مثال: 10):");
    }
    else if (data === 'single_dec') {
        userStates[chatId].action = 'single_decrease'; // تخفيض
        userStates[chatId].step = 'waiting_value';
        bot.sendMessage(chatId, "📉 اكتب نسبة الخصم % (مثال: 15):");
    }
    else if (data === 'single_fixed') {
        userStates[chatId].action = 'single_fixed'; // سعر ثابت
        userStates[chatId].step = 'waiting_value';
        bot.sendMessage(chatId, "💰 اكتب السعر الجديد (الأساسي):");
    }

    // --- خيارات التصنيف ---
    else if (data.startsWith('cat_')) {
        const [_, id, name] = data.split('_');
        userStates[chatId] = { target: 'category', catId: id, catName: name };
        
        bot.sendMessage(chatId, `📂 تصنيف: *${name}*\nاختر العملية:`, {
            parse_mode: 'Markdown',
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
        bot.sendMessage(chatId, "📈 اكتب نسبة الزيادة % للتصنيف:");
    }
    else if (data === 'bulk_cat_dec') {
        userStates[chatId].action = 'bulk_decrease';
        userStates[chatId].step = 'waiting_value';
        bot.sendMessage(chatId, "📉 اكتب نسبة التخفيض % للتصنيف:");
    }

    // --- خيارات الكل ---
    else if (data === 'bulk_all_inc') {
        userStates[chatId] = { target: 'all', action: 'bulk_increase', step: 'waiting_value' };
        bot.sendMessage(chatId, "🌍 اكتب نسبة الزيادة % لكل المنتجات:");
    }
    else if (data === 'bulk_all_dec') {
        userStates[chatId] = { target: 'all', action: 'bulk_decrease', step: 'waiting_value' };
        bot.sendMessage(chatId, "🌍 اكتب نسبة التخفيض % لكل المنتجات:");
    }

    bot.answerCallbackQuery(query.id);
});

// ==========================================
// 🧠 المنطق والدوال (Logic)
// ==========================================

// 1. معالجة الرابط
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

            const caption = `✅ *${p.name}*\n💰 أساسي: ${p.regular_price}\n🏷️ بيع: ${p.sale_price || 'لا يوجد'}\n\n👇 اختر العملية:`;
            
            bot.sendMessage(chatId, caption, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📈 زيادة %', callback_data: 'single_inc' }, { text: '📉 تنزيل %', callback_data: 'single_dec' }],
                        [{ text: '💰 تعديل قيمة السعر (أساسي)', callback_data: 'single_fixed' }]
                    ]
                }
            });
        } else { bot.sendMessage(chatId, "❌ غير موجود."); }
    } catch (e) { bot.sendMessage(chatId, "❌ خطأ."); }
}

// 2. معالجة القيم وتنفيذ المعادلات
async function processValueInput(chatId, text) {
    const val = parseFloat(text);
    if (isNaN(val)) { bot.sendMessage(chatId, "❌ رقم غير صحيح."); return; }

    const state = userStates[chatId];
    
    // --- أ) تعديل منتج واحد ---
    if (state.productId) {
        let updateData = {};
        
        // 1. زيادة السعر (تغيير الأساسي ومسح الخصم)
        if (state.action === 'single_increase') {
            const newRegular = Math.round(state.regularPrice * (1 + val / 100));
            updateData = { 
                regular_price: String(newRegular), 
                sale_price: "",
                date_on_sale_from: null, date_on_sale_to: null 
            };
            bot.sendMessage(chatId, `📈 تم رفع السعر الأساسي إلى: ${newRegular}`);
        }
        
        // 2. تنزيل السعر (عمل خصم - الحفاظ على الأساسي ووضع Sale Price)
        else if (state.action === 'single_decrease') {
            const newSale = Math.round(state.regularPrice * (1 - val / 100));
            updateData = { 
                regular_price: String(state.regularPrice), // الأساسي كما هو
                sale_price: String(newSale), // سعر البيع الجديد
                date_on_sale_from: null, date_on_sale_to: null
            };
            bot.sendMessage(chatId, `🏷️ تم عمل خصم! السعر الجديد: ${newSale} (مشطوب على ${state.regularPrice})`);
        }
        
        // 3. سعر ثابت (تغيير الأساسي ومسح الخصم)
        else if (state.action === 'single_fixed') {
            updateData = { 
                regular_price: String(val), 
                sale_price: "",
                date_on_sale_from: null, date_on_sale_to: null
            };
            bot.sendMessage(chatId, `💰 تم تثبيت السعر الأساسي: ${val}`);
        }

        await updateProductSmart(chatId, { id: state.productId, type: state.productType }, updateData);
    }

    // --- ب) تعديل جماعي (Bulk) ---
    else if (state.target) {
        processBulkUpdate(chatId, state, val);
    }

    userStates[chatId] = { step: 'idle' }; // Reset
    setTimeout(() => showMainMenu(chatId), 2000);
}

// 3. التحديث الجماعي
async function processBulkUpdate(chatId, state, percent) {
    bot.sendMessage(chatId, "🚀 جاري المعالجة الجماعية... (قد يستغرق وقتاً)");
    
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

            // زيادة: نرفع الأساسي ونشيل الخصم
            if (state.action === 'bulk_increase') {
                const newReg = Math.round(oldReg * (1 + percent / 100));
                updateData = { regular_price: String(newReg), sale_price: "" };
            }
            // تخفيض: نسيب الأساسي ونحط Sale Price
            else if (state.action === 'bulk_decrease') {
                const newSale = Math.round(oldReg * (1 - percent / 100));
                updateData = { regular_price: String(oldReg), sale_price: String(newSale) };
            }

            // التنفيذ الصامت
            await updateProductSmart(null, { id: p.id, type: p.type }, updateData);
            count++;
        }
        page++;
    }
    bot.sendMessage(chatId, `✅ تم تحديث ${count} منتج بنجاح.`);
}

// 4. الدالة الذكية للتحديث
async function updateProductSmart(chatId, productState, data) {
    try {
        let parentData = { ...data };
        
        // لو متغير، بنشيل السعر من الأب
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
                // نحدث كل نسخة
                const promises = vars.data.map(v => api.put(`products/${productState.id}/variations/${v.id}`, data));
                await Promise.all(promises);
            }
        }
        
        // إجبار التحديث للواجهة
        await api.put(`products/${productState.id}`, { status: 'publish' });

        if (chatId) bot.sendMessage(chatId, `✅ تم التحديث.`);

    } catch (e) { if(chatId) bot.sendMessage(chatId, "❌ خطأ."); }
}

// 5. إرسال الإيميل
async function sendEmail(chatId, message, user) {
    try {
        await transporter.sendMail({
            from: ADMIN_EMAIL,
            to: ADMIN_EMAIL,
            subject: `طلب جديد من: ${user}`,
            text: `الرسالة:\n${message}\n\nTelegram ID: ${chatId}`
        });
        bot.sendMessage(chatId, "✅ تم إرسال طلبك للإدارة بنجاح.");
    } catch (e) { 
        console.error(e);
        bot.sendMessage(chatId, "❌ فشل إرسال الإيميل."); 
    }
    showMainMenu(chatId);
}

bot.on('polling_error', (err) => { if (err.code !== 'EFATAL') console.log('Polling Error'); });
