const TelegramBot = require('node-telegram-bot-api');
const WooCommerceRestApi = require("@woocommerce/woocommerce-rest-api").default;
const express = require('express');
const nodemailer = require('nodemailer');
const axios = require('axios');
const FormData = require('form-data'); // ضروري لرفع الصور
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

app.get('/', (req, res) => res.send('Bot V17 (Direct Upload & One-Msg Data) 🚀'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running`));

console.log('✅ البوت جاهز V17...');

// ==========================================
// القوائم
// ==========================================
function showMainMenu(chatId) {
    const opts = {
        reply_markup: {
            keyboard: [
                ['➕ إضافة منتج جديد'], 
                ['📦 تعديل منتج شامل'],
                ['📂 تعديل تصنيف كامل'],
                ['🌍 تعديل شامل'],
                ['📩 دعم فني']
            ],
            resize_keyboard: true
        }
    };
    bot.sendMessage(chatId, "👋 أهلاً بك! اختر العملية:", opts);
}

// ==========================================
// استقبال الرسائل والصور
// ==========================================
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // تهيئة الحالة
    if (!userStates[chatId]) userStates[chatId] = { step: 'idle' };

    // 1. زر الإلغاء أو القائمة
    if (text && ['/start', 'مرحبا', 'menu', 'الغاء', 'إلغاء', 'تم'].includes(text.toLowerCase())) {
        // لو العميل قال "تم" وهو في مرحلة الصور، ننفذ الحفظ
        if (text === 'تم' && userStates[chatId].step === 'upload_images') {
            await finalizeProductCreation(chatId);
            return;
        }
        
        userStates[chatId] = { step: 'idle' };
        showMainMenu(chatId);
        return;
    }

    // 2. زر إضافة منتج جديد
    if (text === '➕ إضافة منتج جديد') {
        userStates[chatId] = { step: 'waiting_full_data', newProduct: { images: [] } };
        
        const msgFormat = 
`📝 *أرسل بيانات المنتج في رسالة واحدة (كل معلومة في سطر):*

الاسم
السعر الأساسي
سعر الخصم (لو مفيش اكتب 0)
الوصف

*(مثال)*:
سخان تورنيدو 50 لتر
5000
4500
سخان ممتاز بضمان 5 سنوات ديجيتال...`;

        bot.sendMessage(chatId, msgFormat, { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } });
        return;
    }

    // 3. معالجة بيانات المنتج (النصية)
    if (userStates[chatId].step === 'waiting_full_data' && text) {
        // تقسيم الرسالة بناءً على السطور
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        
        if (lines.length < 2) {
            bot.sendMessage(chatId, "❌ البيانات ناقصة! لازم تبعت على الأقل الاسم والسعر في سطور منفصلة.");
            return;
        }

        // تخزين البيانات
        userStates[chatId].newProduct.name = lines[0];
        userStates[chatId].newProduct.regular_price = extractNumber(lines[1]);
        userStates[chatId].newProduct.sale_price = lines[2] ? extractNumber(lines[2]) : "";
        
        // تجميع باقي السطور كوصف
        let desc = "";
        if (lines.length > 3) {
            desc = lines.slice(3).join('\n');
        }
        userStates[chatId].newProduct.description = desc;
        userStates[chatId].newProduct.short_description = desc;

        // الانتقال لمرحلة الصور
        userStates[chatId].step = 'upload_images';
        bot.sendMessage(chatId, "✅ تم حفظ البيانات!\n\n📸 *الآن أرسل الصور من المعرض:*\n- الصورة الأولى ستكون الأساسية.\n- باقي الصور للمعرض.\n\n🔚 *عند الانتهاء اكتب كلمة: تم*");
        return;
    }

    // 4. معالجة الصور (رفع مباشر)
    if (userStates[chatId].step === 'upload_images' && msg.photo) {
        bot.sendMessage(chatId, "⏳ جاري رفع الصورة للسيرفر...");
        
        // تليجرام بيبعت الصورة بأحجام مختلفة، بناخد آخر واحدة (أعلى جودة)
        const fileId = msg.photo[msg.photo.length - 1].file_id;
        
        // دالة رفع الصورة للووردبريس
        const wpImageId = await uploadImageToWP(chatId, fileId);
        
        if (wpImageId) {
            userStates[chatId].newProduct.images.push({ id: wpImageId });
            bot.sendMessage(chatId, `✅ تم رفع صورة رقم (${userStates[chatId].newProduct.images.length}).\nابعت اللي بعدها أو اكتب "تم".`);
        } else {
            bot.sendMessage(chatId, "❌ فشل رفع هذه الصورة، حاول مرة أخرى.");
        }
    }
    
    // --- (باقي أوامر البوت القديمة: تعديل، الخ) ---
    // (تم الحفاظ عليها لعدم تعقيد الكود هنا، لكن انسخ باقي الدوال من الكود السابق إذا أردت دمجها)
});

// ==========================================
// 🔥 دوال المساعدة (Helpers)
// ==========================================

// 1. استخراج الأرقام فقط من السعر
function extractNumber(str) {
    return str.replace(/[^0-9.]/g, ''); // يمسح أي حروف ويسيب الأرقام
}

// 2. رفع الصورة من تليجرام لـ WordPress
async function uploadImageToWP(chatId, fileId) {
    try {
        // أ) الحصول على رابط التحميل من تليجرام
        const fileLink = await bot.getFileLink(fileId);
        
        // ب) تحميل الصورة كـ Buffer (بيانات خام)
        const imageResponse = await axios.get(fileLink, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(imageResponse.data, 'binary');

        // ج) إعداد الفورم للرفع
        const form = new FormData();
        form.append('file', buffer, { filename: `img_${Date.now()}.jpg` });

        // د) الرفع لـ WordPress Media Library
        // ملاحظة: نستخدم نقطة نهاية الوسائط في WP REST API
        const wpUploadUrl = `${SITE_URL}/wp-json/wp/v2/media?consumer_key=${CK}&consumer_secret=${CS}`;
        
        const uploadRes = await axios.post(wpUploadUrl, form, {
            headers: {
                ...form.getHeaders(),
                'Content-Disposition': `attachment; filename="img_${Date.now()}.jpg"`
            }
        });

        if (uploadRes.status === 201) {
            return uploadRes.data.id; // إرجاع ID الصورة في ووردبريس
        }
    } catch (e) {
        console.error("Upload Error:", e.message);
        return null;
    }
    return null;
}

// 3. الإنشاء النهائي للمنتج
async function finalizeProductCreation(chatId) {
    const product = userStates[chatId].newProduct;
    
    bot.sendMessage(chatId, "🚀 جاري إنشاء المنتج بكل البيانات والصور...");

    try {
        const data = {
            name: product.name,
            type: "simple",
            regular_price: product.regular_price,
            sale_price: product.sale_price === "0" ? "" : product.sale_price,
            description: product.description,
            short_description: product.description,
            images: product.images, // مصفوفة الصور (IDs)
            status: "publish"
        };

        const response = await api.post("products", data);

        if (response.status === 201) {
            const p = response.data;
            bot.sendMessage(chatId, `🎉 *مبروك! تم النشر بنجاح*\n\n📄 الاسم: ${p.name}\n💰 السعر: ${p.price}\n🖼️ عدد الصور: ${p.images.length}\n🔗 الرابط: ${p.permalink}`, { parse_mode: 'Markdown' });
        }
    } catch (e) {
        console.error(e);
        bot.sendMessage(chatId, `❌ حدث خطأ أثناء الإنشاء: ${e.response ? e.response.data.message : e.message}`);
    }
    
    userStates[chatId] = { step: 'idle' };
    setTimeout(() => showMainMenu(chatId), 3000);
}

// (باقي دوال Callback Query القديمة للتعديل - يجب دمجها هنا لو أردت الاحتفاظ بميزات التعديل)
// ...
