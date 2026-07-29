# Minder — ثبت ساعت کار متمرکز (ویندوز)

<div dir="rtl">

اپلیکیشن دسکتاپ ویندوز برای ثبت زمان فعالیت‌های روزانه، دیدن نمودارهای هفتگی و ماهانه، و ساخت کارت تصویری خروجی روز.

- **کاملاً آفلاین** — هیچ داده‌ای جایی ارسال نمی‌شود. همه‌چیز در یک فایل JSON محلی ذخیره می‌شود.
- **بدون وابستگی بومی (native)** — نصب به Visual Studio یا Python نیاز ندارد.
- **فونت مدام** در هشت وزن داخل برنامه باندل شده.
- **پنجره‌ی ثابت** ۱۱۶۰×۷۴۰ — تغییر اندازه و ماکزیمم غیرفعال است.
- **تقویم شمسی** بدون هیچ کتابخانه‌ی خارجی.

</div>

## امکانات

<div dir="rtl">

| بخش | کارکرد |
| --- | --- |
| امروز | تایمر زنده، ثبت و ویرایش دستی رکوردها، هدف روزانه |
| نمودارها | ستونی هفتگی، دوناتِ سهم دسته‌ها، ستونی ماهانه، نقشه‌ی حرارتی سال |
| کارت روزانه | ساخت تصویر PNG خروجی روز در سه نسبت ۱۶:۱۰ / ۱:۱ / ۹:۱۶ |
| تنظیمات | نام و آواتار، عنوان کارت، هدف روزانه، ارقام فارسی، پشتیبان‌گیری و بازیابی |

</div>

## اجرا

<div dir="rtl">

روش معمول:

</div>

```bash
npm install
npm start
```

<div dir="rtl">

اگر `npm install` نتوانست باینری الکترون را دانلود کند (فیلترینگ یا شبکه‌ی محدود)، زیپ الکترون را دستی بگیر و از اسکریپت آماده استفاده کن:

</div>

```powershell
# electron-v31.4.0-win32-x64.zip را از GitHub releases یا هر آینه‌ای بگیر
powershell -ExecutionPolicy Bypass -File .\setup.ps1 -ElectronZip "D:\Downloads\electron-v31.4.0-win32-x64.zip"
```

## ساخت خروجی ویندوز

<div dir="rtl">

**روش آفلاین (توصیه‌شده)** — از همان الکترونی که نصب شده استفاده می‌کند و چیزی دانلود نمی‌کند:

</div>

```powershell
powershell -ExecutionPolicy Bypass -File .\build-exe.ps1 -Zip
```

<div dir="rtl">

خروجی: `dist\Minder\Minder.exe` (پرتابل) و `dist\Minder-win-x64.zip`.

**روش نصب‌کننده‌ی NSIS** — به اینترنت آزاد نیاز دارد:

</div>

```bash
npm run dist
```

<div dir="rtl">

خروجی در `dist/`: `Minder Setup 1.0.0.exe` و نسخه‌ی portable.

</div>

## محل ذخیره‌ی داده‌ها

```
%APPDATA%\Minder\minder.json          داده‌ها (+ minder.json.bak پشتیبان خودکار)
%APPDATA%\Minder\profile\avatar-*     تصویر پروفایل
%APPDATA%\Minder\renderer.log         لاگ خطاها
```

<div dir="rtl">

هیچ داده‌ای داخل پوشه‌ی پروژه نوشته نمی‌شود، پس مخزن گیت همیشه از اطلاعات شخصی خالی می‌ماند.
برای جابه‌جایی داده بین دو کامپیوتر، از تنظیمات ← «برون‌ریزی» و «بازیابی» استفاده کن.

</div>

## ساختار پروژه

```
src/main/main.js        پروسه‌ی اصلی، پنجره، کانال‌های IPC، رندر PNG کارت
src/main/db.js          ذخیره‌سازی JSON اتمیک با پشتیبان و بازیابی خودکار
src/main/preload.js     پل امن به رابط کاربری (contextBridge)
src/renderer/app.js     منطق رابط کاربری
src/renderer/jalali.js  تبدیل تقویم شمسی
src/renderer/card.js    ساخت SVG کارت روزانه
src/renderer/charts.js  نمودارها
assets/fonts/           فونت مدام (۸ وزن)
```

## مشارکت

<div dir="rtl">

هر Pull Request و Issue خوش‌آمد است. چند نکته:

- کد وابستگی خارجی ندارد؛ لطفاً همین‌طور نگه‌داریم — نه پکیج npm در سمت رابط کاربری، نه وابستگی بومی.
- برای هر متغیر سراسری جدید در `src/renderer` حواست باشد با نام‌های موجود روی `window` تضاد نکند (مثلاً `api` رزرو شده است، چون `contextBridge` آن را غیرقابل‌بازنویسی می‌سازد).
- قبل از ارسال، برنامه را با `npm start` اجرا کن و مطمئن شو کنسول خطایی ندارد.

</div>

---

## English

Minder is an offline Windows desktop app for tracking daily focused-work time.
It shows weekly, monthly and yearly charts and exports a shareable PNG summary
card for each day. The interface is right-to-left Persian with a Jalali calendar.

Built with Electron, no runtime dependencies, no native modules, no telemetry.
All data stays in a single local JSON file under `%APPDATA%\Minder`.

```bash
npm install && npm start
```

Licensed under MIT. The bundled Modam font keeps its own license.
