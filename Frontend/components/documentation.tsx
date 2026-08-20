"use client";

import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Search,
  BookOpen,
  Languages,
  LayoutDashboard,
  ShoppingCart,
  History,
  RotateCcw,
  Barcode,
  Package,
  Warehouse,
  BarChart3,
  Shield,
  Grid3X3,
  StoreIcon,
  Truck,
  Users,
  UserCheck,
  CreditCard,
  Download,
  Printer as PrinterIcon,
  User,
  Lightbulb,
  ListChecks,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

type Lang = "en" | "ur";

type LocalizedString = { en: string; ur: string };
type LocalizedList = { en: string[]; ur: string[] };

type DocEntry = {
  id: string;
  label: LocalizedString;
  icon: LucideIcon;
  whatIs: LocalizedString;
  example: LocalizedString;
  options: LocalizedList;
  howTo: LocalizedList;
  tips?: LocalizedList;
};

type DocSection = {
  id: string;
  label: LocalizedString;
  description: LocalizedString;
  entries: DocEntry[];
};

const UI_TEXT = {
  pageTitle: { en: "User Guide", ur: "صارف رہنما" },
  pageSubtitle: {
    en: "A friendly walkthrough of every tab in the system — explained simply, with real examples and every option you can click.",
    ur: "ہر ٹیب کا آسان زبان میں خلاصہ — مثالوں کے ساتھ، اور ہر آپشن کی وضاحت۔",
  },
  searchPlaceholder: {
    en: "Search a topic, e.g. 'refund', 'stock adjustment', 'barcode'...",
    ur: "موضوع تلاش کریں، مثلاً 'ریفنڈ'، 'اسٹاک ایڈجسٹمنٹ'، 'بار کوڈ'...",
  },
  quickStart: { en: "First-time setup", ur: "پہلی مرتبہ سیٹ اپ" },
  whatIs: { en: "What is this?", ur: "یہ کیا ہے؟" },
  example: { en: "Real-life example", ur: "حقیقی مثال" },
  options: { en: "What you can do here", ur: "یہاں آپ کیا کر سکتے ہیں" },
  howToUse: { en: "How to use it (step by step)", ur: "استعمال کا طریقہ (مرحلہ وار)" },
  tip: { en: "Tip", ur: "تجویز" },
  noResults: { en: "No topics match your search", ur: "آپ کی تلاش سے کوئی موضوع نہیں ملا" },
  noResultsHint: {
    en: "Try a different keyword or clear the search.",
    ur: "کوئی دوسرا لفظ آزمائیں یا تلاش صاف کریں۔",
  },
  quickStartSteps: {
    en: [
      "**Build your shop's catalog** — start in *Categories* (e.g. 'Drinks'), then *Units* ('PCS', 'KG'), then *Suppliers* (the people you buy from), and finally *Products* (the items you sell).",
      "**Tell the system how much stock you have** — go to *Stock Management → RECORD* and enter your starting quantities. After this, every sale and purchase will keep the count accurate automatically.",
      "**Make your first sale** — open *Sales*, scan a barcode or search a product, click *Cash*. A receipt is created and stock goes down by 1.",
      "**See what happened** — *Sales History* shows every sale you've ever made. *Movement Log* shows every change in stock.",
      "**Fix mistakes safely** — if 5 items broke or got stolen, use *Stock Adjustment* with reason 'Damage' or 'Theft'. The system keeps a record of who changed what and why.",
    ],
    ur: [
      "**اپنی دکان کا کیٹلاگ بنائیں** — پہلے *کیٹیگریز* (مثلاً 'مشروبات')، پھر *یونٹس* ('PCS'، 'KG')، پھر *سپلائرز* (جن سے آپ خریدتے ہیں)، اور آخر میں *پروڈکٹس* (جو آپ بیچتے ہیں)۔",
      "**سسٹم کو بتائیں آپ کے پاس کتنا اسٹاک ہے** — *اسٹاک مینجمنٹ → ریکارڈ* میں جا کر ابتدائی مقدار درج کریں۔ اس کے بعد ہر فروخت اور خریداری خود بخود گنتی درست رکھے گی۔",
      "**اپنی پہلی سیل کریں** — *سیلز* کھولیں، بار کوڈ اسکین کریں یا پروڈکٹ تلاش کریں، *کیش* دبائیں۔ رسید بن جاتی ہے اور اسٹاک خود بخود 1 کم ہو جاتا ہے۔",
      "**جانچ پڑتال کریں** — *سیلز ہسٹری* میں ہر فروخت محفوظ ہے۔ *موومنٹ لاگ* میں اسٹاک کی ہر تبدیلی۔",
      "**غلطیاں ٹھیک کریں** — اگر 5 آئٹم ٹوٹ گئے یا چوری ہو گئے تو *اسٹاک ایڈجسٹمنٹ* استعمال کر کے وجہ 'نقصان' یا 'چوری' درج کریں۔ سسٹم ریکارڈ رکھتا ہے کہ کس نے کیا اور کیوں بدلا۔",
    ],
  },
};

const SECTIONS: DocSection[] = [
  /* ─────────────── MAIN ─────────────── */
  {
    id: "main",
    label: { en: "Main", ur: "مرکزی" },
    description: {
      en: "Where you land after logging in.",
      ur: "لاگ ان کے بعد آپ کا پہلا صفحہ۔",
    },
    entries: [
      {
        id: "dashboard",
        label: { en: "Dashboard", ur: "ڈیش بورڈ" },
        icon: LayoutDashboard,
        whatIs: {
          en: "Think of the dashboard as the front cover of a daily newspaper for your shop. As soon as you open the app, you see the most important headlines: how much you sold today, how many customers came, what's running low, and how much money you made.",
          ur: "ڈیش بورڈ کو اپنی دکان کے روزانہ اخبار کا پہلا صفحہ سمجھیں۔ ایپ کھولتے ہی سب سے اہم خبریں نظر آ جاتی ہیں: آج کتنی فروخت ہوئی، کتنے گاہک آئے، کیا کم ہو رہا ہے، اور کتنی آمدنی ہوئی۔",
        },
        example: {
          en: "It's 6pm. You open the app and the dashboard says: 'Today's Sales: Rs 18,450 — 12 transactions. Low Stock: 3 items'. You instantly know it was an average day and 3 items need reordering — without opening any other tab.",
          ur: "شام کے 6 بجے ہیں۔ آپ ایپ کھولتے ہیں اور ڈیش بورڈ بتاتا ہے: 'آج کی فروخت: 18,450 روپے — 12 لین دین۔ کم اسٹاک: 3 آئٹم'۔ آپ کو فوراً پتہ چل جاتا ہے کہ دن اوسط رہا اور 3 چیزیں دوبارہ منگوانی ہیں — کوئی اور ٹیب کھولے بغیر۔",
        },
        options: {
          en: [
            "**Today's Sales card** — total rupees sold today + transaction count.",
            "**Recent Transactions** — last 5 sales with time and amount.",
            "**Total Customers** — how many customers are registered.",
            "**Low Stock Items** — products that need reordering.",
            "**Total Revenue (Today)** — all cash + credit sales added up.",
            "**Credit Sales (Today)** — money customers still owe you.",
            "**Expenses (Today)** — any cash going out.",
            "**Refresh button** — pulls the latest numbers from the server.",
            "**Export Report** — downloads a PDF summary you can email to the owner.",
            "**Quick Action buttons** (New Purchase, New Transfer, Stock Out) — shortcuts to common tasks.",
          ],
          ur: [
            "**آج کی فروخت کارڈ** — آج کل کتنے روپے کی فروخت اور لین دین کی تعداد۔",
            "**حالیہ لین دین** — آخری 5 فروختیں وقت اور رقم کے ساتھ۔",
            "**کل گاہک** — کتنے گاہک رجسٹرڈ ہیں۔",
            "**کم اسٹاک آئٹمز** — وہ پروڈکٹس جو دوبارہ منگوانے ہیں۔",
            "**کل آمدنی (آج)** — کیش اور ادھار دونوں ملا کر۔",
            "**ادھار سیلز (آج)** — وہ رقم جو گاہکوں پر باقی ہے۔",
            "**اخراجات (آج)** — جو کیش باہر گیا۔",
            "**ریفریش بٹن** — سرور سے تازہ ترین اعداد لاتا ہے۔",
            "**ایکسپورٹ رپورٹ** — PDF خلاصہ ڈاؤن لوڈ کرتا ہے جو مالک کو ای میل کیا جا سکتا ہے۔",
            "**کوئک ایکشن بٹنز** (نئی خریداری، نیا ٹرانسفر، اسٹاک آؤٹ) — عام کاموں کے شارٹ کٹ۔",
          ],
        },
        howTo: {
          en: [
            "Open the app — the dashboard appears automatically.",
            "Glance at the four cards across the top to get the day's status in 5 seconds.",
            "If a number looks wrong, click the Refresh button to re-fetch live data.",
            "Click any KPI card to jump to the detailed page (e.g. Low Stock card → Inventory tab).",
            "End of day: click Export Report to get a PDF for the day's accounts.",
          ],
          ur: [
            "ایپ کھولیں — ڈیش بورڈ خود نمودار ہو جائے گا۔",
            "اوپر کے چار کارڈز پر ایک نظر ڈالیں — 5 سیکنڈ میں دن کی صورتحال معلوم ہو جائے گی۔",
            "اگر کوئی نمبر غلط لگے تو ریفریش بٹن دبا کر تازہ ڈیٹا منگوائیں۔",
            "کسی بھی KPI کارڈ پر کلک کر کے تفصیلی صفحہ کھولیں (مثلاً کم اسٹاک کارڈ → انوینٹری ٹیب)۔",
            "دن کے آخر میں ایکسپورٹ رپورٹ دبا کر روزمرہ حساب کا PDF حاصل کریں۔",
          ],
        },
      },
    ],
  },

  /* ─────────────── SALES & TRANSACTIONS ─────────────── */
  {
    id: "sales",
    label: { en: "Sales & Transactions", ur: "فروخت اور لین دین" },
    description: {
      en: "Everything that happens at the cash counter.",
      ur: "وہ سب جو کاؤنٹر پر ہوتا ہے۔",
    },
    entries: [
      {
        id: "new-sale",
        label: { en: "Sales (New Sale)", ur: "نئی سیل" },
        icon: ShoppingCart,
        whatIs: {
          en: "This is the cash counter. When a customer brings items, you scan or search them here, the screen builds a bill, the customer pays, and a receipt prints. The system automatically reduces your stock count.",
          ur: "یہ آپ کا کاؤنٹر ہے۔ جب گاہک سامان لاتا ہے، آپ یہاں اسکین یا تلاش کرتے ہیں، اسکرین بل بناتی ہے، گاہک ادائیگی کرتا ہے، اور رسید پرنٹ ہو جاتی ہے۔ سسٹم خود بخود اسٹاک کم کر دیتا ہے۔",
        },
        example: {
          en: "A customer brings 2 bottles of Coke and 1 packet of biscuits. You scan each barcode → cart shows '2 × Coke = Rs 200, 1 × Biscuit = Rs 50, Total = Rs 250'. Customer gives Rs 300 cash. You click Cash, then enter 300, and the system says 'Change: Rs 50'. Receipt prints. Done in 30 seconds.",
          ur: "ایک گاہک 2 کوک کی بوتلیں اور 1 پیکٹ بسکٹ لاتا ہے۔ آپ ہر بار کوڈ اسکین کرتے ہیں → کارٹ دکھاتا ہے '2 × کوک = 200 روپے، 1 × بسکٹ = 50 روپے، ٹوٹل = 250 روپے'۔ گاہک 300 روپے کیش دیتا ہے۔ آپ کیش دباتے ہیں، 300 درج کرتے ہیں، اور سسٹم بتاتا ہے 'باقی: 50 روپے'۔ رسید پرنٹ ہو جاتی ہے۔ 30 سیکنڈ میں کام مکمل۔",
        },
        options: {
          en: [
            "**Barcode scan / Search bar** — scan a barcode with a USB scanner OR type the product name/SKU.",
            "**Customer dropdown** — pick a registered customer, or leave it as 'Walk-in' for cash sales.",
            "**+ button beside customer** — quickly add a new customer without leaving the sale.",
            "**Category tabs** — filter products by category (All / Beverages / Snacks etc.).",
            "**Product cards** — click any card to add 1 unit to the cart.",
            "**Cart panel (right side)** — shows everything you've added; you can edit quantity, change selling price for one item, or remove items.",
            "**Quantity controls** — `−` decrease, `+` increase, or type the number directly.",
            "**Amount by Rs** — overrides the line total when a customer haggles a custom price.",
            "**Trash icon** — removes an item from the cart.",
            "**Discount field** — apply a discount in Rupees or %.",
            "**Hold Sale (Save)** — pause the cart so you can serve another customer; come back later.",
            "**Clear Cart** — wipes the entire cart.",
            "**Cash button** — finish as a cash sale.",
            "**Credit Sale button** — finish as credit (customer pays later) — needs a registered customer.",
          ],
          ur: [
            "**بار کوڈ اسکین / سرچ بار** — USB اسکینر سے بار کوڈ اسکین کریں یا پروڈکٹ کا نام/SKU لکھیں۔",
            "**کسٹمر ڈراپ ڈاؤن** — رجسٹرڈ گاہک منتخب کریں، یا کیش سیل کے لیے 'واک ان' رہنے دیں۔",
            "**کسٹمر کے ساتھ + بٹن** — سیل سے باہر نکلے بغیر فوری نیا گاہک شامل کریں۔",
            "**کیٹیگری ٹیبز** — پروڈکٹس کیٹیگری کے حساب سے فلٹر کریں (سب / مشروبات / اسنیکس وغیرہ)۔",
            "**پروڈکٹ کارڈز** — کسی بھی کارڈ پر کلک کر کے 1 یونٹ کارٹ میں شامل کریں۔",
            "**کارٹ پینل (دائیں جانب)** — تمام شامل کردہ آئٹمز؛ مقدار، قیمت بدل سکتے ہیں یا حذف کر سکتے ہیں۔",
            "**کوانٹٹی کنٹرولز** — `−` کم، `+` زیادہ، یا براہ راست نمبر لکھیں۔",
            "**Amount by Rs** — جب گاہک قیمت پر بحث کرے تو لائن ٹوٹل کو override کرتا ہے۔",
            "**ٹرَیش آئیکن** — کارٹ سے آئٹم نکالتا ہے۔",
            "**ڈسکاؤنٹ فیلڈ** — روپے یا فیصد میں رعایت لگائیں۔",
            "**ہولڈ سیل (Save)** — کارٹ کو ہولڈ پر رکھیں؛ بعد میں واپس آ کر مکمل کریں۔",
            "**کلیئر کارٹ** — پورا کارٹ خالی کرتا ہے۔",
            "**کیش بٹن** — کیش سیل کے طور پر مکمل کریں۔",
            "**کریڈٹ سیل بٹن** — ادھار پر مکمل (گاہک بعد میں ادا کرے گا) — رجسٹرڈ گاہک ضروری ہے۔",
          ],
        },
        howTo: {
          en: [
            "Scan the first product's barcode (or type its name in the search bar and click it).",
            "If the customer needs more than one, click `+` until quantity is right.",
            "Repeat for all items the customer is buying.",
            "(Optional) Pick a registered customer from the dropdown — required only for credit sales.",
            "(Optional) Type a discount amount in the right panel.",
            "Click *Cash* if they're paying now. Enter the cash you received → see change owed.",
            "Click *Credit Sale* if they'll pay later — make sure a customer is selected first.",
            "The receipt prints automatically and the cart clears, ready for the next customer.",
          ],
          ur: [
            "پہلے پروڈکٹ کا بار کوڈ اسکین کریں (یا سرچ بار میں نام لکھ کر کلک کریں)۔",
            "اگر گاہک کو ایک سے زیادہ چاہیے تو `+` دباتے رہیں۔",
            "گاہک کی تمام چیزوں کے لیے دہرائیں۔",
            "(اختیاری) ڈراپ ڈاؤن سے رجسٹرڈ گاہک منتخب کریں — صرف ادھار سیل کے لیے ضروری۔",
            "(اختیاری) دائیں پینل میں ڈسکاؤنٹ درج کریں۔",
            "اگر ابھی ادائیگی ہے تو *کیش* دبائیں۔ موصول رقم درج کریں → باقی رقم نظر آئے گی۔",
            "اگر بعد میں ادائیگی ہے تو *کریڈٹ سیل* — پہلے گاہک منتخب کریں۔",
            "رسید خود پرنٹ ہو جاتی ہے اور کارٹ صاف ہو جاتا ہے، اگلے گاہک کے لیے تیار۔",
          ],
        },
        tips: {
          en: [
            "If a barcode doesn't scan, search by product name — it works the same way.",
            "*Hold Sale* is a lifesaver during rush hours — pause one cart, serve someone else, come back.",
            "If your internet is down, sales still work! They're saved on the device and sync automatically when connection returns.",
            "Credit Sale is greyed out until you pick a customer — that's intentional, walk-in customers can't owe money.",
          ],
          ur: [
            "اگر بار کوڈ اسکین نہیں ہوتا، تو پروڈکٹ کا نام تلاش کریں — یہ بھی کام کرتا ہے۔",
            "رش کے وقت *ہولڈ سیل* بہت کام آتی ہے — ایک کارٹ پاز کریں، دوسرے گاہک کو دیکھیں، پھر واپس آئیں۔",
            "انٹرنیٹ نہیں ہے؟ پھر بھی سیل ہو گی! ڈیوائس پر محفوظ ہو کر رابطہ ملنے پر خود بخود سنک ہو جائے گی۔",
            "گاہک منتخب کیے بغیر کریڈٹ سیل بٹن دبتا نہیں — یہ جان بوجھ کر ہے، واک ان گاہک ادھار نہیں لے سکتا۔",
          ],
        },
      },
      {
        id: "sales-history",
        label: { en: "Sales History", ur: "سیلز کی تاریخ" },
        icon: History,
        whatIs: {
          en: "A diary of every sale you've ever made. You can search by day, customer, or sale number — and reprint old receipts whenever you need.",
          ur: "ہر فروخت کا روزنامچہ۔ آپ تاریخ، گاہک، یا سیل نمبر سے تلاش کر سکتے ہیں — اور پرانی رسیدیں دوبارہ پرنٹ کر سکتے ہیں۔",
        },
        example: {
          en: "A customer comes back next week saying 'I need a duplicate receipt for my office expense'. You search their name in Sales History, find the sale from last Tuesday, click 'Print Receipt', and hand them the printout.",
          ur: "ایک گاہک اگلے ہفتے واپس آتا ہے: 'مجھے دفتر کے خرچ کے لیے رسید کی دوسری کاپی چاہیے'۔ آپ سیلز ہسٹری میں ان کا نام تلاش کرتے ہیں، گزشتہ منگل کی سیل ڈھونڈتے ہیں، 'پرنٹ ریسیپٹ' دباتے ہیں، اور انہیں پرنٹ آؤٹ دیتے ہیں۔",
        },
        options: {
          en: [
            "**Date range filter** — pick start and end dates to limit the list.",
            "**Branch filter** (admins only) — see sales from a specific branch.",
            "**Search box** — find a sale by sale number, customer name, or amount.",
            "**Status filter** — Completed / Refunded / Held.",
            "**Each row shows** — sale number, date, customer, total, and payment method.",
            "**Eye icon** — click to view the full receipt with all line items.",
            "**Print Receipt button** — reprint a thermal receipt.",
            "**Download Invoice** — save an A4 PDF version (good for B2B customers).",
            "**Refund button** — if a sale needs to be returned (links to the Returns tab).",
          ],
          ur: [
            "**تاریخ رینج فلٹر** — شروع اور آخری تاریخ منتخب کر کے فہرست محدود کریں۔",
            "**برانچ فلٹر** (صرف ایڈمن) — کسی مخصوص برانچ کی سیلز دیکھیں۔",
            "**سرچ باکس** — سیل نمبر، گاہک کا نام، یا رقم سے سیل تلاش کریں۔",
            "**اسٹیٹس فلٹر** — مکمل / ریفنڈ شدہ / ہولڈ پر۔",
            "**ہر قطار میں** — سیل نمبر، تاریخ، گاہک، ٹوٹل، طریقہ ادائیگی۔",
            "**آنکھ کا آئیکن** — مکمل رسید اور تمام لائن آئٹمز دیکھنے کے لیے۔",
            "**پرنٹ ریسیپٹ بٹن** — تھرمل رسید دوبارہ پرنٹ کریں۔",
            "**ڈاؤن لوڈ انوائس** — A4 PDF محفوظ کریں (B2B گاہکوں کے لیے بہترین)۔",
            "**ریفنڈ بٹن** — اگر سیل واپس کرنی ہو (ریٹرنز ٹیب پر لے جاتا ہے)۔",
          ],
        },
        howTo: {
          en: [
            "Open Sales History from the sidebar.",
            "Set a date range (e.g. 'last 7 days') to narrow down the list.",
            "Type a customer name or sale number in the search box if you know it.",
            "Click any row to see the full receipt.",
            "From there, use Print Receipt or Download Invoice as needed.",
          ],
          ur: [
            "سائڈ بار سے سیلز ہسٹری کھولیں۔",
            "فہرست محدود کرنے کے لیے تاریخ رینج سیٹ کریں (مثلاً 'گزشتہ 7 دن')۔",
            "اگر معلوم ہے تو گاہک کا نام یا سیل نمبر سرچ باکس میں لکھیں۔",
            "کسی بھی قطار پر کلک کر کے مکمل رسید دیکھیں۔",
            "وہاں سے پرنٹ ریسیپٹ یا ڈاؤن لوڈ انوائس استعمال کریں۔",
          ],
        },
      },
      {
        id: "returns",
        label: { en: "Returns & Exchange", ur: "واپسی اور تبادلہ" },
        icon: RotateCcw,
        whatIs: {
          en: "When a customer brings something back, you handle it here. Either refund their money (Refund) or swap the item for a different one (Exchange). The system updates stock automatically — the returned item goes back into your inventory.",
          ur: "جب گاہک کوئی چیز واپس کرے، آپ یہاں سے ہینڈل کرتے ہیں۔ یا تو پیسے واپس کریں (ریفنڈ) یا چیز کسی اور سے بدلیں (ایکسچینج)۔ سسٹم اسٹاک خودکار اپڈیٹ کرتا ہے — واپس کی گئی چیز واپس آپ کی انوینٹری میں چلی جاتی ہے۔",
        },
        example: {
          en: "Yesterday a customer bought a shirt size M. They come back: 'It's too tight, I need size L'. You search their sale, click *Exchange*, pick the size L shirt as replacement. If size L is the same price, no money changes hands. If L is Rs 200 more, the system asks for the difference.",
          ur: "کل ایک گاہک نے M سائز کی شرٹ خریدی۔ آج واپس آیا: 'تنگ ہے، L سائز چاہیے'۔ آپ ان کی سیل تلاش کرتے ہیں، *ایکسچینج* دباتے ہیں، L سائز کی شرٹ بطور متبادل منتخب کرتے ہیں۔ اگر L کی قیمت برابر ہے تو پیسے کا کوئی لین دین نہیں۔ اگر L 200 روپے زیادہ ہے، تو سسٹم فرق مانگتا ہے۔",
        },
        options: {
          en: [
            "**Search original sale** — find the sale by sale number or customer name.",
            "**Refund button** — return cash for the whole sale or selected items.",
            "**Exchange button** — swap items for different ones (price difference auto-calculated).",
            "**Item-level checkboxes** — return only some items, not the whole sale.",
            "**Reason dropdown** — Defective / Wrong size / Customer changed mind / Damaged.",
            "**Notes field** — extra explanation for the audit trail.",
            "**Refund method** — Cash back or credit to customer's ledger.",
          ],
          ur: [
            "**اصل سیل تلاش کریں** — سیل نمبر یا گاہک کے نام سے ڈھونڈیں۔",
            "**ریفنڈ بٹن** — پوری سیل یا منتخب آئٹمز کی رقم واپس کریں۔",
            "**ایکسچینج بٹن** — آئٹمز دوسرے سے بدلیں (قیمت کا فرق خودکار حساب)۔",
            "**آئٹم کے ساتھ چیک باکس** — صرف چند آئٹمز واپس کریں، پوری سیل نہیں۔",
            "**وجہ ڈراپ ڈاؤن** — خراب / غلط سائز / گاہک نے ارادہ بدلا / نقصان زدہ۔",
            "**نوٹس فیلڈ** — آڈٹ ٹریل کے لیے اضافی وضاحت۔",
            "**ریفنڈ کا طریقہ** — کیش واپسی یا گاہک کے کھاتے میں کریڈٹ۔",
          ],
        },
        howTo: {
          en: [
            "Open Returns & Exchange from the sidebar.",
            "Click *New Return*. Search the original sale by number or customer name.",
            "Choose Refund (cash back) or Exchange (swap items).",
            "Tick which items are coming back. If exchange, pick replacement products.",
            "Pick a reason from the dropdown.",
            "Confirm — money is refunded (or extra collected) and the returned items go back into stock.",
          ],
          ur: [
            "سائڈ بار سے ریٹرنز اینڈ ایکسچینج کھولیں۔",
            "*نیا ریٹرن* دبائیں۔ اصل سیل کو نمبر یا گاہک کے نام سے تلاش کریں۔",
            "ریفنڈ (کیش واپسی) یا ایکسچینج (تبادلہ) منتخب کریں۔",
            "وہ آئٹم نشان زد کریں جو واپس آ رہے ہیں۔ ایکسچینج ہو تو نئے پروڈکٹس چنیں۔",
            "ڈراپ ڈاؤن سے وجہ منتخب کریں۔",
            "تصدیق کریں — پیسے واپس (یا اضافی وصول) ہو جاتے ہیں اور واپس کی گئی چیزیں اسٹاک میں واپس آ جاتی ہیں۔",
          ],
        },
        tips: {
          en: [
            "Always pick a reason — it's saved permanently for tax/audit purposes.",
            "If the customer paid by Credit and never paid the bill, refunding it just clears their ledger debt — no actual cash leaves the till.",
          ],
          ur: [
            "ہمیشہ ایک وجہ منتخب کریں — یہ ٹیکس/آڈٹ کے لیے ہمیشہ کے لیے محفوظ ہوتی ہے۔",
            "اگر گاہک نے ادھار پر خریدا تھا اور کبھی ادا نہیں کیا، تو ریفنڈ کرنے سے صرف ان کا کھاتا صاف ہو جاتا ہے — تجوری سے کوئی کیش نہیں نکلتا۔",
          ],
        },
      },
      {
        id: "barcode-generator",
        label: { en: "Barcode Generator", ur: "بار کوڈ جنریٹر" },
        icon: Barcode,
        whatIs: {
          en: "A printer for stickers. When you receive products that don't come with a barcode (like loose items or imports), you print your own labels here and stick them on each product so the cashier can scan them at sale time.",
          ur: "اسٹیکر بنانے کا پرنٹر۔ جب آپ کو ایسی پروڈکٹس ملیں جن پر بار کوڈ نہیں (مثلاً کھلا سامان یا درآمدات)، تو یہاں اپنے لیبل پرنٹ کر کے ہر چیز پر چپکا دیں تاکہ کیشئر فروخت کے وقت اسکین کر سکے۔",
        },
        example: {
          en: "You buy 50 boxes of unbranded soap that have no barcode. You search 'Soap' here, set quantity to 50, pick a 40×20mm label size, hit Print, and 50 stickers come out. Stick them on each box and they can now be scanned at the counter.",
          ur: "آپ 50 ڈبے بے نام صابن خریدتے ہیں جن پر بار کوڈ نہیں۔ یہاں 'صابن' تلاش کرتے ہیں، مقدار 50 سیٹ کرتے ہیں، 40×20mm لیبل سائز چنتے ہیں، پرنٹ دباتے ہیں، اور 50 اسٹیکر نکل آتے ہیں۔ ہر ڈبے پر چپکائیں اور کاؤنٹر پر اسکین ہونے کے لیے تیار۔",
        },
        options: {
          en: [
            "**Product search** — type to find products in your catalog.",
            "**Quantity per product** — how many labels to print for each.",
            "**Label size template** — common sizes (50×30mm, 40×20mm, 60×40mm).",
            "**Show product name on label** — toggle on/off.",
            "**Show price on label** — toggle on/off.",
            "**Show SKU on label** — toggle on/off.",
            "**Preview** — see how the label will look before printing.",
            "**Print button** — sends labels to your barcode printer.",
            "**Refresh printers** — re-detects connected printers if a new one is plugged in.",
          ],
          ur: [
            "**پروڈکٹ سرچ** — اپنے کیٹلاگ سے پروڈکٹ ڈھونڈنے کے لیے لکھیں۔",
            "**ہر پروڈکٹ کی مقدار** — کتنے لیبل پرنٹ کرنے ہیں۔",
            "**لیبل سائز ٹیمپلیٹ** — عام سائز (50×30mm، 40×20mm، 60×40mm)۔",
            "**لیبل پر پروڈکٹ کا نام دکھائیں** — آن/آف۔",
            "**لیبل پر قیمت دکھائیں** — آن/آف۔",
            "**لیبل پر SKU دکھائیں** — آن/آف۔",
            "**پری ویو** — پرنٹ سے پہلے دیکھیں لیبل کیسا ہو گا۔",
            "**پرنٹ بٹن** — لیبل بار کوڈ پرنٹر پر بھیجتا ہے۔",
            "**ریفریش پرنٹرز** — نیا پرنٹر لگنے پر دوبارہ پہچانتا ہے۔",
          ],
        },
        howTo: {
          en: [
            "Make sure your barcode printer is connected and configured in *Printer Settings*.",
            "Open Barcode Generator. Search a product and click it to add to the print list.",
            "Type the quantity (how many labels of this product).",
            "Pick a label size. Toggle name/price/SKU display as you prefer.",
            "Click Preview to verify, then Print.",
          ],
          ur: [
            "یقینی بنائیں کہ آپ کا بار کوڈ پرنٹر منسلک ہے اور *پرنٹر سیٹنگز* میں کنفگر شدہ ہے۔",
            "بار کوڈ جنریٹر کھولیں۔ پروڈکٹ تلاش کر کے کلک کر کے پرنٹ لسٹ میں شامل کریں۔",
            "مقدار درج کریں (اس پروڈکٹ کے کتنے لیبل)۔",
            "لیبل سائز چنیں۔ نام/قیمت/SKU پسند کے مطابق آن آف کریں۔",
            "پری ویو دیکھیں، پھر پرنٹ کریں۔",
          ],
        },
      },
    ],
  },

  /* ─────────────── INVENTORY ─────────────── */
  {
    id: "inventory",
    label: { en: "Inventory", ur: "انوینٹری" },
    description: {
      en: "Knowing what you have and where.",
      ur: "آپ کے پاس کیا ہے اور کہاں ہے۔",
    },
    entries: [
      {
        id: "inventory-dashboard",
        label: { en: "Inventory Dashboard", ur: "انوینٹری ڈیش بورڈ" },
        icon: LayoutDashboard,
        whatIs: {
          en: "A summary screen for your stock. It shows how many different products you have, total units in storage, what's running low, and what changed recently.",
          ur: "آپ کے اسٹاک کا خلاصہ صفحہ۔ کتنی مختلف پروڈکٹس ہیں، کل یونٹس کتنے ہیں، کیا کم ہو رہا ہے، اور حالیہ کیا بدلا۔",
        },
        example: {
          en: "Monday morning. You glance at the inventory dashboard: 'Total SKUs: 142, Total Units: 3,840, Low Stock: 7'. The 'Low Stock' card is red — you click it and immediately see which 7 products need reordering.",
          ur: "پیر کی صبح۔ آپ انوینٹری ڈیش بورڈ پر نظر ڈالتے ہیں: 'کل SKU: 142، کل یونٹس: 3,840، کم اسٹاک: 7'۔ 'کم اسٹاک' کارڈ سرخ ہے — آپ کلک کرتے ہیں اور فوراً دیکھتے ہیں کون سی 7 پروڈکٹس منگوانی ہیں۔",
        },
        options: {
          en: [
            "**Total SKUs card** — count of unique products in your catalog.",
            "**Total Units card** — sum of stock across all products and branches.",
            "**Low Stock Alerts** — products at or below their min_qty threshold.",
            "**Recent Movements** — last few stock changes (sales, purchases, adjustments).",
            "**Branch switcher** — see numbers for one branch only.",
            "**Quick links** — jump to Products, Stock Management, Movement Log.",
          ],
          ur: [
            "**کل SKU کارڈ** — آپ کے کیٹلاگ میں منفرد پروڈکٹس کی گنتی۔",
            "**کل یونٹس کارڈ** — تمام پروڈکٹس اور برانچوں میں کل اسٹاک کا مجموعہ۔",
            "**کم اسٹاک اطلاعات** — وہ پروڈکٹس جو min_qty حد پر یا اس سے کم ہیں۔",
            "**حالیہ موومنٹس** — آخری چند اسٹاک تبدیلیاں (فروخت، خریداری، ایڈجسٹمنٹ)۔",
            "**برانچ سوئچ** — صرف ایک برانچ کے اعداد دیکھیں۔",
            "**کوئک لنکس** — پروڈکٹس، اسٹاک مینجمنٹ، موومنٹ لاگ پر جائیں۔",
          ],
        },
        howTo: {
          en: [
            "Open it daily as your inventory health check.",
            "If Low Stock is red, click it to see exactly which products need reordering.",
            "Use Recent Movements to spot anything unusual (e.g. a big drop you didn't expect).",
          ],
          ur: [
            "روزانہ کھول کر انوینٹری کی صحت چیک کریں۔",
            "اگر کم اسٹاک سرخ ہے، تو کلک کر کے دیکھیں کن پروڈکٹس کو دوبارہ منگوانا ہے۔",
            "حالیہ موومنٹس میں کوئی غیر متوقع چیز نظر آئے (مثلاً اچانک بڑی کمی) تو فوراً پکڑ لیں۔",
          ],
        },
      },
      {
        id: "inventory",
        label: { en: "Products", ur: "پروڈکٹس" },
        icon: Package,
        whatIs: {
          en: "Your product catalog — the master list of every item you sell. Think of it like a phone book: each product is one entry with its name, price, picture, category, and SKU.",
          ur: "آپ کا پروڈکٹ کیٹلاگ — ہر اس چیز کی فہرست جو آپ بیچتے ہیں۔ ٹیلیفون ڈائریکٹری کی طرح: ہر پروڈکٹ ایک اندراج ہے — نام، قیمت، تصویر، کیٹیگری، اور SKU۔",
        },
        example: {
          en: "You start selling a new juice brand. You click *+ Add Product*, type 'Mango Juice 250ml', set Purchase Rate Rs 80, Sale Rate Rs 120, pick category 'Beverages', upload a picture. Save. Now your cashier can scan/search and sell it.",
          ur: "آپ نئی جوس برانڈ بیچنا شروع کرتے ہیں۔ *+ ایڈ پروڈکٹ* دباتے ہیں، 'مینگو جوس 250ml' لکھتے ہیں، خریداری ریٹ 80، فروخت ریٹ 120، کیٹیگری 'مشروبات' چنتے ہیں، تصویر اپ لوڈ کرتے ہیں۔ Save۔ اب کیشئر اسے اسکین/تلاش کر کے بیچ سکتا ہے۔",
        },
        options: {
          en: [
            "**+ Add Product** — opens a form to create a new product.",
            "**Search bar** — find products by name or SKU.",
            "**Category filter** — narrow down to one category.",
            "**Status toggle** — show only active products or all (including deactivated).",
            "**In each row**: product name, SKU, category, purchase rate, sale rate, current stock, status, actions.",
            "**Edit (pencil)** — change any field on a product.",
            "**Deactivate toggle** — hide a product from the cashier without deleting it.",
            "**Bulk Import** — upload an Excel/CSV with many products at once.",
            "**Required fields when adding**: Name, Sale Rate (everything else is optional).",
            "**Optional fields**: SKU (auto-generated if blank), category, unit, purchase rate, min/max qty, description, brand, color, size, supplier, tax, images.",
            "**Initial Stock field** — opening quantity if this product is brand new.",
          ],
          ur: [
            "**+ ایڈ پروڈکٹ** — نئی پروڈکٹ بنانے کا فارم کھولتا ہے۔",
            "**سرچ بار** — نام یا SKU سے پروڈکٹس ڈھونڈیں۔",
            "**کیٹیگری فلٹر** — صرف ایک کیٹیگری پر فوکس کریں۔",
            "**اسٹیٹس ٹوگل** — صرف فعال پروڈکٹس یا سب (غیر فعال سمیت)۔",
            "**ہر قطار میں**: نام، SKU، کیٹیگری، خریداری ریٹ، فروخت ریٹ، موجودہ اسٹاک، اسٹیٹس، ایکشنز۔",
            "**ایڈٹ (پنسل)** — کسی بھی فیلڈ کو تبدیل کریں۔",
            "**ڈی ایکٹیویٹ ٹوگل** — حذف کیے بغیر کیشئر سے پروڈکٹ چھپا دیں۔",
            "**بلک امپورٹ** — Excel/CSV سے بہت سی پروڈکٹس ایک ساتھ شامل کریں۔",
            "**شامل کرتے وقت لازمی فیلڈز**: نام، فروخت ریٹ (باقی سب اختیاری)۔",
            "**اختیاری فیلڈز**: SKU (خالی چھوڑنے پر خود بن جاتا ہے)، کیٹیگری، یونٹ، خریداری ریٹ، min/max مقدار، تفصیل، برانڈ، رنگ، سائز، سپلائر، ٹیکس، تصاویر۔",
            "**ابتدائی اسٹاک فیلڈ** — اگر یہ بالکل نئی پروڈکٹ ہے تو ابتدائی مقدار۔",
          ],
        },
        howTo: {
          en: [
            "Click *+ Add Product*.",
            "Type the product name (the only truly required field).",
            "Type the Sale Rate (what customers pay).",
            "(Recommended) pick a Category, Unit, and set Purchase Rate so reports work properly.",
            "(Optional) upload one or more pictures.",
            "(Optional) set Min Qty so the system warns you when stock runs low.",
            "Click Save. The product is immediately available at the cash counter.",
          ],
          ur: [
            "*+ ایڈ پروڈکٹ* پر کلک کریں۔",
            "پروڈکٹ کا نام لکھیں (واحد لازمی فیلڈ)۔",
            "فروخت ریٹ لکھیں (جو گاہک ادا کریں گے)۔",
            "(تجویز کردہ) کیٹیگری، یونٹ، اور خریداری ریٹ سیٹ کریں تاکہ رپورٹس درست چلیں۔",
            "(اختیاری) ایک یا زیادہ تصاویر اپ لوڈ کریں۔",
            "(اختیاری) Min Qty سیٹ کریں تاکہ کم ہونے پر سسٹم خبردار کرے۔",
            "Save دبائیں۔ پروڈکٹ فوراً کاؤنٹر پر دستیاب ہو جاتی ہے۔",
          ],
        },
        tips: {
          en: [
            "If category, unit, or supplier are blank when saving, the system creates 'Unknown' defaults — fine to start, but fill them in later for cleaner reports.",
            "Never delete a product that has sales history — deactivate it instead. Deletion is forbidden by the database to protect your records.",
            "Bulk Import is a huge time-saver — download the template, fill it in Excel, upload, done.",
          ],
          ur: [
            "اگر سیو کرتے وقت کیٹیگری/یونٹ/سپلائر خالی ہو، تو سسٹم 'Unknown' ڈیفالٹ بنا دیتا ہے — شروع میں ٹھیک، لیکن صاف رپورٹس کے لیے بعد میں بھر دیں۔",
            "ایسی پروڈکٹ کبھی حذف نہ کریں جس کی فروخت کی تاریخ ہو — اس کے بجائے غیر فعال کریں۔ ڈیٹابیس آپ کے ریکارڈ بچانے کے لیے حذف کرنے سے روکتا ہے۔",
            "بلک امپورٹ بہت وقت بچاتا ہے — ٹیمپلیٹ ڈاؤن لوڈ کر کے Excel میں بھریں، اپ لوڈ کریں، ہو گیا۔",
          ],
        },
      },
      {
        id: "stock-management",
        label: { en: "Stock Management", ur: "اسٹاک مینجمنٹ" },
        icon: Warehouse,
        whatIs: {
          en: "The control room for your warehouse. You see exactly how many of each product you have at each branch, and you can record opening stock, adjust quantities, or write off damaged goods.",
          ur: "آپ کے گودام کا کنٹرول روم۔ آپ دیکھتے ہیں ہر پروڈکٹ کے کتنے یونٹس کس برانچ میں ہیں، اور ابتدائی اسٹاک درج کر سکتے ہیں، مقدار ایڈجسٹ کر سکتے ہیں، یا خراب مال نکال سکتے ہیں۔",
        },
        example: {
          en: "On day one of opening your shop, you walk around with a clipboard and count: 50 packets of biscuits, 30 bottles of Coke, 12 shampoos. You come back here, click RECORD on each product, and type the count. Now the system knows your starting position.",
          ur: "دکان کھولنے کے پہلے دن آپ کلپ بورڈ لے کر گنتی کرتے ہیں: 50 پیکٹ بسکٹ، 30 بوتل کوک، 12 شیمپو۔ آپ یہاں آ کر ہر پروڈکٹ پر RECORD دباتے ہیں اور گنتی لکھتے ہیں۔ اب سسٹم کو آپ کی ابتدائی پوزیشن معلوم ہو جاتی ہے۔",
        },
        options: {
          en: [
            "**Stock List tab** — see every product's current stock per branch.",
            "**Movement Log tab** — recent stock changes for the products on this page.",
            "**Today's Phase tab** — only changes that happened today.",
            "**RECORD button** (header) — add stock for a product (typically opening balance).",
            "**ADJUST button** (header) — change a stock level up or down with a reason.",
            "**DISPOSE button** (header) — write off damaged/expired/lost items.",
            "**Search bar** — find a product by name or SKU.",
            "**Category filter** — narrow down by category.",
            "**Status legend** — In Stock / Low / Out of Stock badges.",
            "**Export** — download stock list as CSV.",
            "**New products (Excel)** — bulk upload products with their opening qty in one Excel file.",
          ],
          ur: [
            "**اسٹاک لسٹ ٹیب** — ہر پروڈکٹ کا برانچ وار موجودہ اسٹاک۔",
            "**موومنٹ لاگ ٹیب** — اس صفحے کی پروڈکٹس میں حالیہ تبدیلیاں۔",
            "**Today's Phase ٹیب** — صرف آج کی تبدیلیاں۔",
            "**RECORD بٹن** (ہیڈر) — پروڈکٹ کے لیے اسٹاک شامل کریں (عام طور پر ابتدائی بیلنس)۔",
            "**ADJUST بٹن** (ہیڈر) — وجہ کے ساتھ اسٹاک کی سطح بڑھائیں یا گھٹائیں۔",
            "**DISPOSE بٹن** (ہیڈر) — خراب/ایکسپائرڈ/گمشدہ آئٹمز نکالیں۔",
            "**سرچ بار** — نام یا SKU سے پروڈکٹ ڈھونڈیں۔",
            "**کیٹیگری فلٹر** — کیٹیگری کے حساب سے فلٹر۔",
            "**اسٹیٹس بیج** — In Stock / Low / Out of Stock۔",
            "**ایکسپورٹ** — اسٹاک لسٹ CSV میں ڈاؤن لوڈ۔",
            "**New products (Excel)** — Excel سے پروڈکٹس + ابتدائی مقدار ایک ساتھ اپ لوڈ کریں۔",
          ],
        },
        howTo: {
          en: [
            "**To record opening stock**: click RECORD → search the product → enter quantity → Save.",
            "**To adjust stock**: click ADJUST → search product → choose Add (+) or Remove (−) → enter amount → pick reason → Save.",
            "**To dispose damaged goods**: click DISPOSE → search product → enter quantity → pick reason (Damage / Expired / Theft) → Save.",
            "Use the Movement Log tab to verify your changes were recorded.",
          ],
          ur: [
            "**ابتدائی اسٹاک درج کرنے کے لیے**: RECORD دبائیں → پروڈکٹ تلاش کریں → مقدار درج کریں → Save۔",
            "**اسٹاک ایڈجسٹ کرنے کے لیے**: ADJUST دبائیں → پروڈکٹ → Add (+) یا Remove (−) → مقدار → وجہ → Save۔",
            "**خراب مال نکالنے کے لیے**: DISPOSE دبائیں → پروڈکٹ → مقدار → وجہ (نقصان / ایکسپائرڈ / چوری) → Save۔",
            "موومنٹ لاگ ٹیب میں تصدیق کریں کہ تبدیلیاں درج ہو گئیں۔",
          ],
        },
        tips: {
          en: [
            "RECORD is for the very first time you tell the system about stock. After that, normal stock comes via Stock In (Purchases). Don't use RECORD to log a supplier delivery — that breaks reporting.",
            "Always pick a real reason on ADJUST and DISPOSE. The reason is permanent and helps during audits.",
          ],
          ur: [
            "RECORD صرف اس وقت کے لیے ہے جب آپ پہلی بار اسٹاک کے بارے میں سسٹم کو بتاتے ہیں۔ اس کے بعد عام اسٹاک Stock In (خریداری) سے آتا ہے۔ سپلائر کی ڈلیوری کو RECORD سے درج نہ کریں — یہ رپورٹنگ خراب کرتا ہے۔",
            "ADJUST اور DISPOSE میں ہمیشہ اصل وجہ منتخب کریں۔ وجہ ہمیشہ کے لیے محفوظ ہوتی ہے اور آڈٹ میں مدد کرتی ہے۔",
          ],
        },
      },
    ],
  },

  /* ─────────────── STOCK OPERATIONS ─────────────── */
  {
    id: "stock-ops",
    label: { en: "Stock Operations", ur: "اسٹاک آپریشنز" },
    description: {
      en: "Daily stock movement and audit trail.",
      ur: "روزمرہ کی آمد و رفت اور آڈٹ ٹریل۔",
    },
    entries: [
      {
        id: "purchases",
        label: { en: "Stock In (Purchases)", ur: "اسٹاک ان (خریداری)" },
        icon: Package,
        whatIs: {
          en: "Where you record stock arriving from a supplier. Every time a delivery shows up at your shop, you log it here. The system increases stock and remembers what you paid.",
          ur: "جہاں آپ سپلائر سے آنے والا اسٹاک درج کرتے ہیں۔ جب بھی دکان پر ڈلیوری آئے، یہاں لکھیں۔ سسٹم اسٹاک بڑھا دیتا ہے اور یاد رکھتا ہے آپ نے کیا قیمت دی۔",
        },
        example: {
          en: "A truck from your supplier arrives with 100 bags of rice (Rs 200/bag) and 50 bags of sugar (Rs 150/bag). You click *New Entry*, pick the supplier, add line 1: Rice × 100 × Rs 200, line 2: Sugar × 50 × Rs 150. Total auto-calculates to Rs 27,500. Save. Stock goes up by 100 rice + 50 sugar; the purchase is recorded for Rs 27,500.",
          ur: "آپ کے سپلائر کا ٹرک 100 بوری چاول (200 روپے/بوری) اور 50 بوری چینی (150 روپے/بوری) لے کر آتا ہے۔ آپ *نیو اینٹری* دباتے ہیں، سپلائر چنتے ہیں، لائن 1: چاول × 100 × 200، لائن 2: چینی × 50 × 150۔ ٹوٹل خود 27,500 ہو جاتا ہے۔ Save۔ اسٹاک 100 چاول + 50 چینی بڑھ جاتا ہے؛ خریداری 27,500 روپے میں ریکارڈ ہو جاتی ہے۔",
        },
        options: {
          en: [
            "**History tab** — list of all past purchases.",
            "**New Entry tab** — form to log a new delivery.",
            "**Supplier dropdown** — pick who you bought from (must be set up in Suppliers first).",
            "**Branch dropdown** — which warehouse received the goods.",
            "**Reference No** — supplier's invoice number (optional but useful).",
            "**Line items** — for each product: pick product, quantity, unit cost. Total auto-calculates.",
            "**Add Line button** — add another product to the same purchase.",
            "**Remove Line button** — delete a row.",
            "**Notes field** — anything extra (e.g. 'received with 2 broken')`.",
            "**Save Purchase** — finalizes; stock is incremented automatically.",
            "**Bulk Import** — upload a CSV/Excel with many lines for fast entry.",
            "**History filters** — by supplier, date range, branch.",
          ],
          ur: [
            "**ہسٹری ٹیب** — تمام پرانی خریداریوں کی فہرست۔",
            "**نیو اینٹری ٹیب** — نئی ڈلیوری درج کرنے کا فارم۔",
            "**سپلائر ڈراپ ڈاؤن** — کس سے خریدا (پہلے Suppliers میں شامل ہونا ضروری)۔",
            "**برانچ ڈراپ ڈاؤن** — کس گودام میں مال آیا۔",
            "**Reference No** — سپلائر کا انوائس نمبر (اختیاری لیکن مفید)۔",
            "**لائن آئٹمز** — ہر پروڈکٹ: پروڈکٹ، مقدار، فی یونٹ قیمت۔ ٹوٹل خود حساب۔",
            "**ایڈ لائن بٹن** — اسی خریداری میں دوسری پروڈکٹ شامل کریں۔",
            "**ریموو لائن بٹن** — قطار حذف کریں۔",
            "**نوٹس فیلڈ** — کوئی اضافی بات (مثلاً '2 ٹوٹے ہوئے ملے')۔",
            "**Save Purchase** — مکمل کریں؛ اسٹاک خود بڑھ جاتا ہے۔",
            "**بلک امپورٹ** — تیز اندراج کے لیے CSV/Excel سے کئی لائنیں اپ لوڈ کریں۔",
            "**ہسٹری فلٹرز** — سپلائر، تاریخی رینج، برانچ۔",
          ],
        },
        howTo: {
          en: [
            "Open Stock In and click *New Entry*.",
            "Pick the supplier and the receiving branch.",
            "(Optional) Type the supplier's invoice number in Reference No.",
            "For each product in the delivery: pick the product, type quantity, type unit cost.",
            "Click *Add Line* if more products are in the same delivery.",
            "Verify the total looks right, then Save.",
            "Go to Movement Log to confirm the stock increase recorded.",
          ],
          ur: [
            "اسٹاک ان کھولیں اور *نیو اینٹری* دبائیں۔",
            "سپلائر اور وصول کرنے والی برانچ منتخب کریں۔",
            "(اختیاری) سپلائر کا انوائس نمبر Reference No میں لکھیں۔",
            "ڈلیوری کی ہر پروڈکٹ کے لیے: پروڈکٹ چنیں، مقدار اور فی یونٹ قیمت لکھیں۔",
            "اگر اور پروڈکٹس ہیں تو *ایڈ لائن* دبائیں۔",
            "ٹوٹل درست لگنے پر Save دبائیں۔",
            "موومنٹ لاگ میں جا کر تصدیق کریں اسٹاک بڑھ گیا۔",
          ],
        },
      },
      {
        id: "stock-out",
        label: { en: "Stock Out", ur: "اسٹاک آؤٹ" },
        icon: Package,
        whatIs: {
          en: "When stock leaves your warehouse for a reason that isn't a sale — like sending boxes to another branch, giving samples, or removing for internal use — you log it here.",
          ur: "جب اسٹاک گودام سے کسی غیر فروخت وجہ سے نکلے — مثلاً دوسری برانچ کو بھیجنا، نمونے دینا، یا اندرونی استعمال — یہاں درج کریں۔",
        },
        example: {
          en: "Your main branch is over-stocked on shampoo and the second branch is running out. You go to Stock Out, click *New Dispatch*, source = Main Warehouse, destination = Second Branch, add 30 shampoos, Submit. Stock goes down at Main, up at Second.",
          ur: "آپ کی مین برانچ پر شیمپو زیادہ ہے اور دوسری برانچ پر کم۔ آپ Stock Out میں *نیو ڈسپیچ* دباتے ہیں، منبع = مین گودام، منزل = دوسری برانچ، 30 شیمپو شامل کر کے Submit کرتے ہیں۔ مین پر کم، دوسری پر زیادہ ہو جاتا ہے۔",
        },
        options: {
          en: [
            "**History tab** — list of past dispatches.",
            "**New Dispatch tab** — form for a new outgoing entry.",
            "**Source branch** — where stock is leaving from.",
            "**Destination** — another branch, a customer, or 'Internal Use'.",
            "**Reason** — Transfer / Sample / Damage / Internal Use.",
            "**Line items** — product + quantity (system warns if quantity exceeds available stock).",
            "**Reference No** — your own tracking number.",
            "**Notes** — extra detail.",
            "**Submit** — finalizes; stock is decreased.",
            "**Bulk Import** — Excel for large dispatches.",
          ],
          ur: [
            "**ہسٹری ٹیب** — پرانی ڈسپیچز کی فہرست۔",
            "**نیو ڈسپیچ ٹیب** — نئی نکلنے والی اندراج کا فارم۔",
            "**منبع برانچ** — کہاں سے اسٹاک نکل رہا ہے۔",
            "**منزل** — دوسری برانچ، گاہک، یا 'Internal Use'۔",
            "**وجہ** — ٹرانسفر / نمونہ / نقصان / اندرونی استعمال۔",
            "**لائن آئٹمز** — پروڈکٹ + مقدار (دستیاب اسٹاک سے زیادہ ہو تو سسٹم خبردار کرتا ہے)۔",
            "**Reference No** — آپ کا اپنا ٹریکنگ نمبر۔",
            "**نوٹس** — اضافی تفصیل۔",
            "**Submit** — مکمل کرتا ہے؛ اسٹاک کم۔",
            "**بلک امپورٹ** — بڑی ڈسپیچز کے لیے Excel۔",
          ],
        },
        howTo: {
          en: [
            "Open Stock Out and click *New Dispatch*.",
            "Pick source branch (where it's leaving from) and destination.",
            "Pick a reason from the dropdown.",
            "Add product lines. The system shows available stock so you don't dispatch more than you have.",
            "Click Submit. Stock is decreased and a movement log entry is created.",
          ],
          ur: [
            "Stock Out کھولیں اور *نیو ڈسپیچ* دبائیں۔",
            "منبع برانچ (کہاں سے نکل رہا) اور منزل منتخب کریں۔",
            "ڈراپ ڈاؤن سے وجہ منتخب کریں۔",
            "پروڈکٹ لائنز شامل کریں۔ سسٹم دستیاب اسٹاک دکھاتا ہے تاکہ زیادہ نہ بھیجیں۔",
            "Submit دبائیں۔ اسٹاک کم اور موومنٹ لاگ اندراج بن جائے گا۔",
          ],
        },
      },
      {
        id: "stock-adjustment",
        label: { en: "Stock Adjustment", ur: "اسٹاک ایڈجسٹمنٹ" },
        icon: Warehouse,
        whatIs: {
          en: "A way to fix the system's count when it doesn't match reality. For example: the system says 50 bottles but you count only 47 in the warehouse. You adjust to match real life and record WHY (theft, breakage, miscount, etc.).",
          ur: "سسٹم کی گنتی کو حقیقت سے ہم آہنگ کرنے کا طریقہ۔ مثلاً: سسٹم 50 بوتل دکھاتا ہے مگر گودام میں صرف 47 ہیں۔ آپ حقیقت سے ملاتے ہیں اور وجہ درج کرتے ہیں (چوری، ٹوٹ پھوٹ، غلط گنتی وغیرہ)۔",
        },
        example: {
          en: "End of month physical count. The system says you have 200 packets of biscuits but you only counted 195. 5 packets are missing. You click *+ New Adjustment*, search 'Biscuit', Action = Remove (−), Quantity = 5, Reason = 'Damage' (you found 5 spoiled at the back). Save. The system corrects to 195 and saves the audit reason.",
          ur: "ماہ کے آخر کی جسمانی گنتی۔ سسٹم 200 پیکٹ بسکٹ دکھاتا ہے مگر آپ نے صرف 195 گنے۔ 5 غائب ہیں۔ آپ *+ نیو ایڈجسٹمنٹ* دباتے ہیں، 'بسکٹ' تلاش کرتے ہیں، Action = Remove (−)، مقدار = 5، وجہ = 'نقصان' (پیچھے 5 خراب پڑے ملے)۔ Save۔ سسٹم 195 پر درست ہو جاتا ہے اور آڈٹ وجہ محفوظ۔",
        },
        options: {
          en: [
            "**+ New Adjustment** — opens the form.",
            "**Search Product** — find the affected product.",
            "**Action dropdown**: Add (+) or Remove (−).",
            "**Reason dropdown**: Damage / Theft / Recount / Expired / Correction / Other.",
            "**Current Qty display** — shows what the system currently thinks you have.",
            "**Change Amount** — how many to add or remove.",
            "**Remarks** — optional explanation for the audit log.",
            "**Save Adjustment** — applies the change.",
            "**KPI cards** — Total Cycles, Shrinkage (lost), Gains.",
            "**Export CSV** — download all adjustments for accounting.",
          ],
          ur: [
            "**+ نیو ایڈجسٹمنٹ** — فارم کھولتا ہے۔",
            "**سرچ پروڈکٹ** — متعلقہ پروڈکٹ تلاش کریں۔",
            "**ایکشن ڈراپ ڈاؤن**: Add (+) یا Remove (−)۔",
            "**وجہ ڈراپ ڈاؤن**: نقصان / چوری / دوبارہ گنتی / ایکسپائرڈ / تصحیح / دیگر۔",
            "**Current Qty** — سسٹم میں موجودہ مقدار۔",
            "**Change Amount** — کتنا شامل یا کم کرنا ہے۔",
            "**ریمارکس** — آڈٹ لاگ کے لیے اختیاری وضاحت۔",
            "**Save Adjustment** — تبدیلی لگاتا ہے۔",
            "**KPI کارڈز** — کل سائیکلز، شرنکیج (ضائع)، گین (اضافہ)۔",
            "**ایکسپورٹ CSV** — حساب کے لیے تمام ایڈجسٹمنٹس ڈاؤن لوڈ۔",
          ],
        },
        howTo: {
          en: [
            "Click *+ New Adjustment*.",
            "Search the product by name or SKU.",
            "Pick Action: + to add, − to remove.",
            "Pick a Reason — required.",
            "Enter the change amount (e.g. 5).",
            "(Optional) write a short remark explaining the situation.",
            "Click Save Adjustment. The stock count is updated and the change is permanently logged.",
          ],
          ur: [
            "*+ نیو ایڈجسٹمنٹ* پر کلک کریں۔",
            "نام یا SKU سے پروڈکٹ تلاش کریں۔",
            "Action چنیں: + شامل، − کم۔",
            "وجہ منتخب کریں — لازمی۔",
            "تبدیلی کی مقدار درج کریں (مثلاً 5)۔",
            "(اختیاری) صورتحال کا مختصر ریمارک لکھیں۔",
            "Save Adjustment دبائیں۔ اسٹاک گنتی اپڈیٹ ہو جاتی ہے اور تبدیلی ہمیشہ کے لیے لاگ ہوتی ہے۔",
          ],
        },
      },
      {
        id: "stock-movement-log",
        label: { en: "Movement Log", ur: "موومنٹ لاگ" },
        icon: History,
        whatIs: {
          en: "An unchangeable record of every single stock change. Every sale, every purchase, every adjustment, every transfer leaves a footprint here. You can never edit or delete entries — only add new ones. This protects you during audits.",
          ur: "ہر اسٹاک تبدیلی کا ناقابل تبدیل ریکارڈ۔ ہر فروخت، خریداری، ایڈجسٹمنٹ، ٹرانسفر یہاں نشان چھوڑتی ہے۔ آپ کبھی اندراجات کو ایڈٹ یا حذف نہیں کر سکتے — صرف نئے شامل کر سکتے ہیں۔ یہ آڈٹ میں آپ کی حفاظت کرتا ہے۔",
        },
        example: {
          en: "An accountant questions why your stock count dropped by 50 last month. You open Movement Log, filter by date and product, and see: '15 SALE entries totaling 35 units, 1 ADJUSTMENT (Reason: Damage) for 15 units'. Mystery solved in 30 seconds.",
          ur: "ایک اکاؤنٹنٹ پوچھتا ہے گزشتہ ماہ آپ کا اسٹاک 50 کیوں کم ہوا۔ آپ موومنٹ لاگ کھولتے ہیں، تاریخ اور پروڈکٹ سے فلٹر کرتے ہیں، اور دیکھتے ہیں: '15 SALE اندراجات کل 35 یونٹس، 1 ADJUSTMENT (وجہ: نقصان) 15 یونٹس'۔ معما 30 سیکنڈ میں حل۔",
        },
        options: {
          en: [
            "**KPI cards**: Stock In total, Stock Out total, Net Change, Records Found.",
            "**Date range** — start + end date filter.",
            "**Type filter** — Purchase / Sale / Adjustment / Transfer In / Transfer Out / Return / Damage / All.",
            "**Product search** — find changes for a specific item.",
            "**Refresh button** — re-fetch.",
            "**Export CSV** — download the log for offline analysis.",
            "**Each row shows**: timestamp, activity type, product, SKU, delta (+ or −), final qty, previous qty.",
            "**Pagination at the bottom** — step through historical entries (10 / 25 / 50 / 100 per page).",
          ],
          ur: [
            "**KPI کارڈز**: اسٹاک ان کل، اسٹاک آؤٹ کل، نیٹ چینج، ریکارڈز۔",
            "**تاریخ رینج** — شروع + آخری تاریخ فلٹر۔",
            "**ٹائپ فلٹر** — Purchase / Sale / Adjustment / Transfer In / Transfer Out / Return / Damage / سب۔",
            "**پروڈکٹ سرچ** — کسی مخصوص آئٹم کی تبدیلیاں۔",
            "**ریفریش بٹن** — دوبارہ لاتا ہے۔",
            "**ایکسپورٹ CSV** — آف لائن تجزیے کے لیے لاگ ڈاؤن لوڈ۔",
            "**ہر قطار**: وقت، سرگرمی کی قسم، پروڈکٹ، SKU، فرق (+ یا −)، فائنل مقدار، پچھلی مقدار۔",
            "**نیچے پیجینیشن** — پرانی اندراجات تک پہنچیں (10 / 25 / 50 / 100 فی صفحہ)۔",
          ],
        },
        howTo: {
          en: [
            "Pick a date range so the list is manageable.",
            "Optionally pick a Type or a specific Product.",
            "Read the rows — each tells you what changed, when, and how much.",
            "If you want a printable record, click Export CSV.",
            "Use pagination to step back further in history.",
          ],
          ur: [
            "تاریخ رینج چنیں تاکہ فہرست قابل انتظام ہو۔",
            "اختیاری طور پر ٹائپ یا کوئی مخصوص پروڈکٹ منتخب کریں۔",
            "قطاریں پڑھیں — ہر ایک بتاتی ہے کب کیا کتنا بدلا۔",
            "پرنٹ ایبل ریکارڈ کے لیے ایکسپورٹ CSV دبائیں۔",
            "تاریخ میں مزید پیچھے جانے کے لیے پیجینیشن استعمال کریں۔",
          ],
        },
      },
      {
        id: "inventory-reports",
        label: { en: "Inventory Reports", ur: "انوینٹری رپورٹس" },
        icon: BarChart3,
        whatIs: {
          en: "Pre-made reports about your inventory. Want to know the rupee value of all your stock? Which items haven't sold in 60 days? Which items to reorder? You don't need to calculate any of this manually — pick a report type and the system does the math.",
          ur: "آپ کی انوینٹری کی تیار شدہ رپورٹس۔ تمام اسٹاک کی روپوں میں قیمت چاہیے؟ 60 دن سے نہ بکنے والی چیزیں؟ دوبارہ منگوانے والی؟ آپ کو کچھ خود حساب نہیں کرنا — رپورٹ کی قسم چنیں اور سسٹم کام کر دیتا ہے۔",
        },
        example: {
          en: "Your boss asks 'How much money is sitting in our stock?' You pick *Stock Valuation*, set 'All branches', click Generate. The report says 'Total Value: Rs 4,82,500'. Done in 5 seconds — no spreadsheets needed.",
          ur: "آپ کا باس پوچھتا ہے 'ہمارے اسٹاک میں کتنے پیسے بند ہیں؟' آپ *اسٹاک ویلیویشن* چنتے ہیں، 'تمام برانچیں' سیٹ کرتے ہیں، Generate دباتے ہیں۔ رپورٹ بتاتی ہے 'کل قیمت: 4,82,500 روپے'۔ 5 سیکنڈ میں ہو گیا — کوئی اسپریڈ شیٹ نہیں۔",
        },
        options: {
          en: [
            "**Report type dropdown**: Stock Valuation / Slow Movers / Reorder Suggestions / ABC Analysis / Aging.",
            "**Date range** — for time-based reports.",
            "**Branch filter** — limit to one location or all.",
            "**Category filter** — limit to specific categories.",
            "**Generate button** — runs the report.",
            "**Export Excel / Export PDF** — download for sharing.",
            "**Email Report** — send the PDF to a colleague.",
          ],
          ur: [
            "**رپورٹ ٹائپ ڈراپ ڈاؤن**: اسٹاک ویلیویشن / سست رفتار / ری آرڈر تجاویز / ABC تجزیہ / عمر۔",
            "**تاریخ رینج** — وقت پر مبنی رپورٹس کے لیے۔",
            "**برانچ فلٹر** — ایک لوکیشن یا سب۔",
            "**کیٹیگری فلٹر** — مخصوص کیٹیگریز۔",
            "**Generate بٹن** — رپورٹ چلاتا ہے۔",
            "**Export Excel / Export PDF** — شیئرنگ کے لیے ڈاؤن لوڈ۔",
            "**Email Report** — PDF کسی ساتھی کو بھیجیں۔",
          ],
        },
        howTo: {
          en: [
            "Pick a report type from the dropdown.",
            "Set filters (date range / branch / category) as needed.",
            "Click Generate — the table fills with data.",
            "Click Export to download the report.",
          ],
          ur: [
            "ڈراپ ڈاؤن سے رپورٹ ٹائپ چنیں۔",
            "ضرورت کے مطابق فلٹرز سیٹ کریں (تاریخ / برانچ / کیٹیگری)۔",
            "Generate دبائیں — ٹیبل میں ڈیٹا آ جائے گا۔",
            "ڈاؤن لوڈ کے لیے ایکسپورٹ دبائیں۔",
          ],
        },
      },
      {
        id: "inventory-audit",
        label: { en: "Financial Audit", ur: "مالی آڈٹ" },
        icon: Shield,
        whatIs: {
          en: "An accountant's view of your inventory. It connects stock value to purchases, sales, profit margin, and shrinkage (lost stock). Use it monthly to confirm your numbers add up and catch any leaks.",
          ur: "آپ کی انوینٹری کا اکاؤنٹنٹ والا نظارہ۔ اسٹاک کی قیمت کو خریداری، فروخت، منافع، اور شرنکیج (کھویا ہوا اسٹاک) سے جوڑتا ہے۔ ماہانہ استعمال کر کے تصدیق کریں کہ نمبرز ٹھیک ہیں اور کوئی لیکیج پکڑیں۔",
        },
        example: {
          en: "You expected to make Rs 50,000 profit last month. Audit shows Rs 38,000. The Shrinkage column reveals Rs 12,000 worth of stock 'disappeared' — adjusted out for damage. Now you know where the gap went.",
          ur: "آپ کو گزشتہ ماہ 50,000 روپے منافع کی توقع تھی۔ آڈٹ 38,000 دکھاتا ہے۔ شرنکیج کالم ظاہر کرتا ہے 12,000 روپے کا اسٹاک 'غائب' — نقصان کی وجہ سے ایڈجسٹ ہوا۔ اب پتہ چل گیا فرق کہاں گیا۔",
        },
        options: {
          en: [
            "**Date range** — pick the period to audit (usually a month).",
            "**Branch filter** — focus on one location.",
            "**Per-branch breakdown** — opening stock, purchases, sales, closing stock, margin %.",
            "**Shrinkage column** — value of stock lost via adjustments.",
            "**Export PDF** — for sharing with the accountant.",
          ],
          ur: [
            "**تاریخ رینج** — جس مدت کا آڈٹ کرنا (عام طور پر ایک ماہ)۔",
            "**برانچ فلٹر** — ایک لوکیشن پر توجہ۔",
            "**برانچ وار تفصیل** — ابتدائی اسٹاک، خریداری، فروخت، آخری اسٹاک، منافع %۔",
            "**شرنکیج کالم** — ایڈجسٹمنٹ سے ضائع اسٹاک کی قیمت۔",
            "**Export PDF** — اکاؤنٹنٹ کے لیے۔",
          ],
        },
        howTo: {
          en: [
            "Pick the month or date range you want to audit.",
            "Optionally limit to one branch.",
            "Read the per-branch table: opening + purchases − sales − shrinkage = closing.",
            "If margin % is lower than expected, look at Shrinkage to identify why.",
          ],
          ur: [
            "آڈٹ کرنے کی مہینہ یا تاریخ رینج چنیں۔",
            "اختیاری طور پر ایک برانچ تک محدود کریں۔",
            "برانچ ٹیبل پڑھیں: ابتدائی + خریداری − فروخت − شرنکیج = آخری۔",
            "اگر منافع کم ہے تو شرنکیج دیکھیں کہ وجہ کیا ہے۔",
          ],
        },
      },
    ],
  },

  /* ─────────────── PRODUCT CATALOG ─────────────── */
  {
    id: "catalog",
    label: { en: "Product Catalog", ur: "پروڈکٹ کیٹلاگ" },
    description: {
      en: "Master data — set these up once, use them everywhere.",
      ur: "بنیادی ڈیٹا — ایک بار سیٹ کریں، ہر جگہ استعمال کریں۔",
    },
    entries: [
      {
        id: "categories",
        label: { en: "Categories", ur: "کیٹیگریز" },
        icon: Grid3X3,
        whatIs: {
          en: "The biggest grouping of your products. Like sections in a supermarket: 'Drinks', 'Snacks', 'Cleaning', 'Frozen'. Each product belongs to one category.",
          ur: "آپ کی پروڈکٹس کی سب سے بڑی گروپ بندی۔ سپر مارکیٹ کے سیکشنز کی طرح: 'مشروبات'، 'اسنیکس'، 'صفائی'، 'منجمد'۔ ہر پروڈکٹ کسی ایک کیٹیگری میں ہوتی ہے۔",
        },
        example: {
          en: "You're starting your shop. You add categories: 'Beverages', 'Snacks', 'Personal Care', 'Stationery'. Now when adding a Coke product, you assign it to 'Beverages'. The cashier can later filter products by category for fast browsing.",
          ur: "آپ دکان شروع کر رہے ہیں۔ آپ کیٹیگریز شامل کرتے ہیں: 'مشروبات'، 'اسنیکس'، 'پرسنل کیئر'، 'اسٹیشنری'۔ اب کوک شامل کرتے وقت اسے 'مشروبات' میں ڈالتے ہیں۔ کیشئر بعد میں کیٹیگری سے فلٹر کر کے تیز براؤزنگ کر سکتا ہے۔",
        },
        options: {
          en: [
            "**+ Add Category** — opens the form.",
            "**Name field** — what the category is called.",
            "**Code field** — short identifier (e.g. 'BEV').",
            "**Image upload** — an icon shown on POS category tabs.",
            "**Branch assignment** — pick which branches show this category on their cash counter.",
            "**Active toggle** — hide a category from POS without deleting.",
            "**View Products button** — see all items in this category.",
            "**Edit / Delete** — modify or remove (delete only if no products).",
            "**Search bar** — find a category fast.",
          ],
          ur: [
            "**+ ایڈ کیٹیگری** — فارم کھولتا ہے۔",
            "**نام فیلڈ** — کیٹیگری کا نام۔",
            "**کوڈ فیلڈ** — مختصر شناخت (مثلاً 'BEV')۔",
            "**تصویر اپ لوڈ** — POS کیٹیگری ٹیبز پر دکھنے والا آئیکن۔",
            "**برانچ اسائنمنٹ** — کس برانچ کے POS پر دکھانی ہے۔",
            "**ایکٹیو ٹوگل** — حذف کیے بغیر POS سے چھپائیں۔",
            "**ویو پروڈکٹس بٹن** — اس کیٹیگری کی تمام پروڈکٹس۔",
            "**ایڈٹ / ڈیلیٹ** — تبدیل یا ختم (ڈیلیٹ صرف اگر پروڈکٹ نہ ہو)۔",
            "**سرچ بار** — کیٹیگری تیزی سے ڈھونڈیں۔",
          ],
        },
        howTo: {
          en: [
            "Click *+ Add Category*.",
            "Type a name and a short code.",
            "(Optional) upload a small icon for the POS.",
            "(Optional) tick which branches will display this category.",
            "Save. Now you can assign products to it.",
          ],
          ur: [
            "*+ ایڈ کیٹیگری* پر کلک کریں۔",
            "نام اور مختصر کوڈ لکھیں۔",
            "(اختیاری) POS کے لیے چھوٹا آئیکن اپ لوڈ کریں۔",
            "(اختیاری) منتخب کریں کن برانچوں پر دکھانی ہے۔",
            "Save۔ اب آپ پروڈکٹس اس میں ڈال سکتے ہیں۔",
          ],
        },
      },
      {
        id: "sub-categories",
        label: { en: "Sub-Categories", ur: "ذیلی کیٹیگریز" },
        icon: Grid3X3,
        whatIs: {
          en: "A second level of grouping under a category. 'Beverages' is the category, and 'Juices', 'Sodas', 'Water' are sub-categories. Useful for shops with lots of products.",
          ur: "کیٹیگری کے نیچے دوسری سطح کی گروپ بندی۔ 'مشروبات' کیٹیگری ہے، اور 'جوسز'، 'سوڈاز'، 'پانی' ذیلی کیٹیگریز۔ بہت سی پروڈکٹس والی دکانوں کے لیے مفید۔",
        },
        example: {
          en: "Under 'Beverages' you create sub-categories 'Hot Drinks', 'Cold Drinks', 'Energy Drinks'. Now your reports can drill down: 'How much hot drinks did we sell this week?'",
          ur: "'مشروبات' کے تحت آپ ذیلی کیٹیگریز بناتے ہیں 'گرم مشروبات'، 'ٹھنڈے مشروبات'، 'انرجی ڈرنکس'۔ اب رپورٹس مزید گہرائی میں جا سکتی ہیں: 'اس ہفتے گرم مشروبات کتنے بکے؟'",
        },
        options: {
          en: [
            "**+ Add Sub-Category** — form.",
            "**Parent category dropdown** — which top-level category it belongs to.",
            "**Name + Code** — same as categories.",
            "**Active toggle** — show/hide.",
            "**Edit / Delete** — actions per row.",
          ],
          ur: [
            "**+ ایڈ سب کیٹیگری** — فارم۔",
            "**Parent category ڈراپ ڈاؤن** — کس اعلیٰ کیٹیگری میں۔",
            "**نام + کوڈ** — کیٹیگری جیسا۔",
            "**ایکٹیو ٹوگل** — دکھائیں/چھپائیں۔",
            "**ایڈٹ / ڈیلیٹ** — ہر قطار کے ایکشنز۔",
          ],
        },
        howTo: {
          en: [
            "Click *+ Add Sub-Category*.",
            "Pick the parent category from the dropdown.",
            "Type the sub-category name.",
            "Save.",
          ],
          ur: [
            "*+ ایڈ سب کیٹیگری* دبائیں۔",
            "ڈراپ ڈاؤن سے parent کیٹیگری چنیں۔",
            "ذیلی کیٹیگری کا نام لکھیں۔",
            "Save۔",
          ],
        },
      },
      {
        id: "units",
        label: { en: "Units", ur: "یونٹس" },
        icon: Package,
        whatIs: {
          en: "How you measure your products. PCS (pieces) for things you count, KG for weight, LITRE for liquid, BOX for containers. Every product needs a unit.",
          ur: "آپ پروڈکٹس کیسے ناپتے ہیں۔ گنتی والی چیزوں کے لیے PCS، وزن کے لیے KG، مائع کے لیے LITRE، ڈبوں کے لیے BOX۔ ہر پروڈکٹ کو یونٹ چاہیے۔",
        },
        example: {
          en: "You sell rice by the kilo, cold drinks by the bottle (PCS), and milk by the litre. You add three units: KG, PCS, LITRE. When adding products, you pick the right one for each.",
          ur: "آپ چاول کلو میں، کولڈ ڈرنک بوتل (PCS) میں، دودھ لیٹر میں بیچتے ہیں۔ تین یونٹس شامل کرتے ہیں: KG، PCS، LITRE۔ پروڈکٹس شامل کرتے وقت ہر ایک کے لیے درست چنتے ہیں۔",
        },
        options: {
          en: [
            "**+ Add Unit** — form with Name and Code.",
            "**Active toggle** — show/hide on product forms.",
            "**Edit / Delete** — modify or remove (delete only if unused).",
          ],
          ur: [
            "**+ ایڈ یونٹ** — نام اور کوڈ کا فارم۔",
            "**ایکٹیو ٹوگل** — پروڈکٹ فارمز پر دکھائیں/چھپائیں۔",
            "**ایڈٹ / ڈیلیٹ** — تبدیل یا حذف (صرف اگر استعمال میں نہیں)۔",
          ],
        },
        howTo: {
          en: [
            "Click *+ Add Unit*.",
            "Type the name (e.g. 'PCS', 'KG').",
            "Type a short code if different from the name.",
            "Save.",
          ],
          ur: [
            "*+ ایڈ یونٹ* دبائیں۔",
            "نام لکھیں (مثلاً 'PCS'، 'KG')۔",
            "اگر کوڈ مختلف ہے تو لکھیں۔",
            "Save۔",
          ],
        },
      },
      {
        id: "brand",
        label: { en: "Brands", ur: "برانڈز" },
        icon: StoreIcon,
        whatIs: {
          en: "The manufacturer or brand name attached to a product. 'Coca-Cola', 'Nestlé', 'Pepsi'. Useful for filtering and reports like 'How much Coke did we sell?'",
          ur: "پروڈکٹ کے ساتھ منسلک مینوفیکچرر یا برانڈ کا نام۔ 'کوکا کولا'، 'نیسلے'، 'پیپسی'۔ فلٹرنگ اور رپورٹنگ کے لیے مفید جیسے 'اس ہفتے کوک کتنا بکا؟'",
        },
        example: {
          en: "You stock soft drinks from Coke, Pepsi, and 7Up. You create three brands. Then on each soft-drink product, you tag the right brand. Reports can now show 'Pepsi sales: Rs 12,000 this month'.",
          ur: "آپ کوک، پیپسی، اور 7Up رکھتے ہیں۔ تین برانڈز بناتے ہیں۔ ہر کولڈ ڈرنک پر صحیح برانڈ ٹیگ کرتے ہیں۔ رپورٹس اب دکھا سکتی ہیں 'پیپسی کی فروخت: 12,000 روپے اس ماہ'۔",
        },
        options: {
          en: ["**+ Add Brand** — name and code.", "**Edit / Delete** — actions.", "**Active toggle** — visibility."],
          ur: ["**+ ایڈ برانڈ** — نام اور کوڈ۔", "**ایڈٹ / ڈیلیٹ** — ایکشنز۔", "**ایکٹیو ٹوگل** — visibility۔"],
        },
        howTo: {
          en: ["Click *+ Add Brand*.", "Type the brand name.", "Save."],
          ur: ["*+ ایڈ برانڈ* دبائیں۔", "برانڈ کا نام لکھیں۔", "Save۔"],
        },
      },
      {
        id: "colors",
        label: { en: "Colors", ur: "رنگ" },
        icon: Package,
        whatIs: {
          en: "Color variants for products that come in multiple colors. Used for clothing, paint, cars, electronics — anywhere color matters to identify the right item.",
          ur: "ایسی پروڈکٹس کے لیے رنگ کی اقسام جو مختلف رنگوں میں آتی ہیں۔ کپڑے، پینٹ، گاڑیاں، الیکٹرانکس — جہاں صحیح آئٹم پہچاننے کے لیے رنگ ضروری ہو۔",
        },
        example: {
          en: "You sell cotton shirts in Red, Blue, Black, White. You add four colors. When you add a 'Cotton Shirt' product variant, you tag it with its color. The cashier can search 'Red shirt' and find the right one.",
          ur: "آپ سوتی شرٹس سرخ، نیلی، کالی، سفید میں بیچتے ہیں۔ چار رنگ شامل کرتے ہیں۔ 'سوتی شرٹ' کا ویریئنٹ شامل کرتے وقت رنگ ٹیگ کرتے ہیں۔ کیشئر 'سرخ شرٹ' تلاش کر کے صحیح والی پا لیتا ہے۔",
        },
        options: {
          en: ["**+ Add Color** — name and code.", "**Edit / Delete** — actions."],
          ur: ["**+ ایڈ کلر** — نام اور کوڈ۔", "**ایڈٹ / ڈیلیٹ** — ایکشنز۔"],
        },
        howTo: {
          en: ["Click *+ Add Color*.", "Type the color name.", "Save."],
          ur: ["*+ ایڈ کلر* دبائیں۔", "رنگ کا نام لکھیں۔", "Save۔"],
        },
      },
      {
        id: "sizes",
        label: { en: "Sizes", ur: "سائز" },
        icon: Package,
        whatIs: {
          en: "Size variants — Small/Medium/Large for clothes, 250ml/500ml/1L for liquids, etc. Pair sizes with colors to create complete product variants.",
          ur: "سائز کی اقسام — کپڑوں کے لیے Small/Medium/Large، مائعات کے لیے 250ml/500ml/1L وغیرہ۔ مکمل ویریئنٹس بنانے کے لیے سائز کو رنگوں کے ساتھ جوڑیں۔",
        },
        example: {
          en: "You sell juice in three bottle sizes. You add sizes '250ml', '500ml', '1L'. Each variant of the juice product gets the right size tag.",
          ur: "آپ تین سائز کی بوتلوں میں جوس بیچتے ہیں۔ سائزز شامل کرتے ہیں '250ml'، '500ml'، '1L'۔ ہر جوس ویریئنٹ کو صحیح سائز ٹیگ ملتا ہے۔",
        },
        options: {
          en: ["**+ Add Size** — name and code.", "**Edit / Delete** — actions."],
          ur: ["**+ ایڈ سائز** — نام اور کوڈ۔", "**ایڈٹ / ڈیلیٹ** — ایکشنز۔"],
        },
        howTo: {
          en: ["Click *+ Add Size*.", "Type the size name.", "Save."],
          ur: ["*+ ایڈ سائز* دبائیں۔", "سائز کا نام لکھیں۔", "Save۔"],
        },
      },
      {
        id: "suppliers",
        label: { en: "Suppliers", ur: "سپلائرز" },
        icon: Truck,
        whatIs: {
          en: "The wholesalers and distributors you buy stock from. Every Stock In (Purchase) entry must reference a supplier, so set them up before you start receiving deliveries.",
          ur: "وہ ہول سیلر اور ڈسٹری بیوٹر جن سے آپ اسٹاک خریدتے ہیں۔ ہر Stock In (خریداری) اندراج میں سپلائر کا حوالہ ضروری ہے، اس لیے ڈلیوری وصول کرنے سے پہلے انہیں سیٹ کریں۔",
        },
        example: {
          en: "You buy biscuits from 'Continental Distributors' and Coke from 'Pepsi Distributor (Karachi)'. You add both as suppliers with their phone and address. Every purchase you log later picks one of these.",
          ur: "آپ بسکٹ 'Continental Distributors' سے اور کوک 'Pepsi Distributor (Karachi)' سے خریدتے ہیں۔ دونوں کو فون اور پتے کے ساتھ شامل کرتے ہیں۔ ہر بعد کی خریداری میں ان میں سے ایک منتخب کرتے ہیں۔",
        },
        options: {
          en: [
            "**+ Add Supplier** — opens the form.",
            "**Required**: Name.",
            "**Optional**: phone, email, address, contact person, payment terms, notes.",
            "**Active toggle** — hide retired suppliers.",
            "**Edit / Delete / Toggle Status** — actions per row.",
          ],
          ur: [
            "**+ ایڈ سپلائر** — فارم۔",
            "**لازمی**: نام۔",
            "**اختیاری**: فون، ای میل، پتہ، رابطہ شخص، ادائیگی شرائط، نوٹس۔",
            "**ایکٹیو ٹوگل** — پرانے سپلائرز چھپائیں۔",
            "**ایڈٹ / ڈیلیٹ / اسٹیٹس ٹوگل** — ہر قطار کے ایکشنز۔",
          ],
        },
        howTo: {
          en: [
            "Click *+ Add Supplier*.",
            "Type the supplier's name (the only required field).",
            "(Recommended) add phone and address so you can contact them later.",
            "Save. Now this supplier appears in the dropdown when you record a Stock In.",
          ],
          ur: [
            "*+ ایڈ سپلائر* دبائیں۔",
            "سپلائر کا نام لکھیں (صرف یہ لازمی ہے)۔",
            "(تجویز) فون اور پتہ شامل کریں تاکہ بعد میں رابطہ ہو سکے۔",
            "Save۔ اب یہ سپلائر Stock In ریکارڈ کرتے وقت ڈراپ ڈاؤن میں نظر آئے گا۔",
          ],
        },
      },
    ],
  },

  /* ─────────────── PEOPLE ─────────────── */
  {
    id: "people",
    label: { en: "Customer & Staff", ur: "گاہک اور عملہ" },
    description: {
      en: "Who buys from you and who works for you.",
      ur: "آپ سے کون خریدتا ہے اور آپ کے لیے کون کام کرتا ہے۔",
    },
    entries: [
      {
        id: "customers",
        label: { en: "Customers", ur: "گاہک" },
        icon: Users,
        whatIs: {
          en: "Your customer database. For walk-in customers, you don't need anything. But for regulars, customers buying on credit, or customers you want to send promotions to — you create a customer record here with their name, phone, and credit limit.",
          ur: "آپ کے گاہکوں کا ڈیٹابیس۔ واک ان گاہک کے لیے کچھ نہیں چاہیے۔ مگر ریگولر گاہکوں، ادھار خریدنے والوں، یا پروموشن بھیجنے والوں کے لیے یہاں ریکارڈ بنائیں — نام، فون، اور کریڈٹ لمٹ کے ساتھ۔",
        },
        example: {
          en: "Mr. Khan visits your shop weekly and buys on credit. You add him: name 'Khan Saab', phone '0300-1234567', credit_limit Rs 10,000. Next time he buys on credit, the system tracks his unpaid balance against this limit. View Ledger shows everything he owes.",
          ur: "خان صاحب ہر ہفتے آپ کی دکان آتے ہیں اور ادھار لیتے ہیں۔ آپ شامل کرتے ہیں: نام 'خان صاحب'، فون '0300-1234567'، credit_limit 10,000 روپے۔ اگلی بار جب وہ ادھار لیں گے، سسٹم اس حد کے خلاف ان کا غیر ادا شدہ بیلنس ٹریک کرے گا۔ ویو لیجر سب کچھ دکھاتا ہے۔",
        },
        options: {
          en: [
            "**+ Add Customer** — opens the form.",
            "**Required**: Name.",
            "**Optional**: phone, WhatsApp, email, address, credit_limit.",
            "**Search bar** — find by name or phone.",
            "**Edit / Delete** — actions per row.",
            "**View Ledger button** — see all transactions and outstanding balance.",
            "**Quick add from Sales tab** — when on a sale, click + beside customer to add without leaving.",
          ],
          ur: [
            "**+ ایڈ کسٹمر** — فارم۔",
            "**لازمی**: نام۔",
            "**اختیاری**: فون، واٹس ایپ، ای میل، پتہ، credit_limit۔",
            "**سرچ بار** — نام یا فون سے ڈھونڈیں۔",
            "**ایڈٹ / ڈیلیٹ** — ہر قطار کے ایکشنز۔",
            "**ویو لیجر بٹن** — تمام لین دین اور باقی رقم۔",
            "**سیلز ٹیب سے فوری شامل** — سیل کرتے وقت + دبا کر باہر نکلے بغیر شامل کریں۔",
          ],
        },
        howTo: {
          en: [
            "Click *+ Add Customer*.",
            "Type the customer's name.",
            "(Recommended) add phone — used on receipts and for follow-ups.",
            "If you let this customer buy on credit, set a credit_limit (e.g. Rs 10,000).",
            "Save. They now appear in the dropdown on the New Sale screen.",
          ],
          ur: [
            "*+ ایڈ کسٹمر* دبائیں۔",
            "گاہک کا نام لکھیں۔",
            "(تجویز) فون شامل کریں — رسیدوں اور follow-up کے لیے۔",
            "اگر یہ گاہک ادھار لیتا ہے تو credit_limit مقرر کریں (مثلاً 10,000)۔",
            "Save۔ اب نئی سیل اسکرین کے ڈراپ ڈاؤن میں نظر آئیں گے۔",
          ],
        },
        tips: {
          en: [
            "View Ledger is the most important button — it shows their full history: every purchase, every payment, and the running balance. Crucial when collecting from credit customers.",
          ],
          ur: [
            "ویو لیجر سب سے اہم بٹن ہے — ان کی مکمل تاریخ دکھاتا ہے: ہر خریداری، ہر ادائیگی، اور موجودہ بیلنس۔ ادھار گاہکوں سے وصولی کے وقت بہت ضروری۔",
          ],
        },
      },
      {
        id: "employees",
        label: { en: "Employees", ur: "ملازمین" },
        icon: UserCheck,
        whatIs: {
          en: "Your staff database. Lists everyone who works for you with their personal details. This is for HR record-keeping. POS login accounts (the people who can use this system) are separate from this list.",
          ur: "آپ کے عملے کا ڈیٹابیس۔ سب ملازمین کی ذاتی تفصیلات۔ یہ HR ریکارڈ کے لیے ہے۔ POS لاگ ان اکاؤنٹس (جو لوگ یہ سسٹم استعمال کر سکتے ہیں) اس فہرست سے علیحدہ ہیں۔",
        },
        example: {
          en: "You hire Ali as a cashier. You add him as an employee with name, CNIC, phone, employee type 'Cashier', and joining date. Now you can track his salary payments under Salaries.",
          ur: "آپ علی کو کیشئر رکھتے ہیں۔ نام، CNIC، فون، ایمپلائی ٹائپ 'کیشئر'، اور تاریخ جوائننگ کے ساتھ شامل کرتے ہیں۔ اب آپ Salaries کے تحت ان کی تنخواہ ٹریک کر سکتے ہیں۔",
        },
        options: {
          en: [
            "**+ Add Employee** — form.",
            "**Required**: Name, Employee Type.",
            "**Optional**: phone, CNIC, address, joining date, salary, notes.",
            "**Employee Type dropdown** — populated from the Designation tab.",
            "**Edit / Delete** — actions.",
            "**Search** — by name or phone.",
          ],
          ur: [
            "**+ ایڈ ایمپلائی** — فارم۔",
            "**لازمی**: نام، ایمپلائی ٹائپ۔",
            "**اختیاری**: فون، CNIC، پتہ، تاریخ شمولیت، تنخواہ، نوٹس۔",
            "**ایمپلائی ٹائپ ڈراپ ڈاؤن** — Designation ٹیب سے بھرتا ہے۔",
            "**ایڈٹ / ڈیلیٹ** — ایکشنز۔",
            "**سرچ** — نام یا فون سے۔",
          ],
        },
        howTo: {
          en: [
            "First, set up Designations (Cashier, Manager, etc.) in the Designation tab.",
            "Click *+ Add Employee*.",
            "Type name, pick employee type, fill optional details.",
            "Save.",
          ],
          ur: [
            "پہلے Designation ٹیب میں عہدے سیٹ کریں (کیشئر، مینیجر، وغیرہ)۔",
            "*+ ایڈ ایمپلائی* دبائیں۔",
            "نام لکھیں، ٹائپ منتخب کریں، اختیاری تفصیلات پُر کریں۔",
            "Save۔",
          ],
        },
      },
      {
        id: "salaries",
        label: { en: "Salaries", ur: "تنخواہیں" },
        icon: CreditCard,
        whatIs: {
          en: "Your monthly payroll register. You record salary payments for each employee per month — useful for tax filing and tracking what you've paid versus what you owe.",
          ur: "آپ کا ماہانہ پے رول رجسٹر۔ ہر ملازم کی ماہانہ تنخواہ ریکارڈ کرتے ہیں — ٹیکس فائلنگ اور ادا/باقی رقم ٹریک کرنے کے لیے مفید۔",
        },
        example: {
          en: "End of January. You pay Ali Rs 30,000 cash. You click *+ Add Salary*, pick Ali, month=January, year=2026, amount=30000, payment status=Paid. Saved. Repeat for each employee.",
          ur: "جنوری کے آخر۔ آپ علی کو 30,000 روپے کیش دیتے ہیں۔ *+ ایڈ سیلری* دباتے ہیں، علی چنتے ہیں، ماہ=جنوری، سال=2026، رقم=30000، اسٹیٹس=Paid۔ محفوظ۔ ہر ملازم کے لیے دہرائیں۔",
        },
        options: {
          en: [
            "**+ Add Salary** — form.",
            "**Employee dropdown** — pick from your employees.",
            "**Month + Year** — period this salary is for.",
            "**Amount** — rupees paid.",
            "**Payment status** — Paid / Pending.",
            "**Notes** — extra detail like 'includes overtime' or 'half month'.",
            "**Edit / Delete** — actions per row.",
          ],
          ur: [
            "**+ ایڈ سیلری** — فارم۔",
            "**ایمپلائی ڈراپ ڈاؤن** — اپنے ملازمین سے چنیں۔",
            "**ماہ + سال** — کس مدت کی تنخواہ۔",
            "**رقم** — کتنے روپے ادا۔",
            "**اسٹیٹس** — Paid / Pending۔",
            "**نوٹس** — اضافی تفصیل جیسے 'اوور ٹائم شامل' یا 'آدھا ماہ'۔",
            "**ایڈٹ / ڈیلیٹ** — ہر قطار۔",
          ],
        },
        howTo: {
          en: [
            "Click *+ Add Salary*.",
            "Pick the employee from the dropdown.",
            "Pick month and year.",
            "Type the amount paid.",
            "Set status to Paid (or Pending if you'll pay later).",
            "Save.",
          ],
          ur: [
            "*+ ایڈ سیلری* دبائیں۔",
            "ملازم منتخب کریں۔",
            "ماہ اور سال چنیں۔",
            "ادا شدہ رقم درج کریں۔",
            "اسٹیٹس Paid کریں (یا Pending اگر بعد میں ادا کرنا ہے)۔",
            "Save۔",
          ],
        },
      },
      {
        id: "designation",
        label: { en: "Designation", ur: "عہدہ" },
        icon: Shield,
        whatIs: {
          en: "Job titles for your staff. 'Cashier', 'Manager', 'Stocker', 'Accountant'. Set these up once, then assign one to each employee.",
          ur: "آپ کے عملے کے عہدے۔ 'کیشئر'، 'مینیجر'، 'اسٹاکر'، 'اکاؤنٹنٹ'۔ ایک بار سیٹ کریں، پھر ہر ملازم کو ایک تفویض کریں۔",
        },
        example: {
          en: "You have 3 cashiers, 1 manager, 1 stocker. You add three designations: Cashier, Manager, Stocker. When adding employees, you pick the right designation for each.",
          ur: "آپ کے پاس 3 کیشئر، 1 مینیجر، 1 اسٹاکر ہیں۔ تین عہدے شامل کرتے ہیں: کیشئر، مینیجر، اسٹاکر۔ ملازم شامل کرتے وقت صحیح عہدہ چنتے ہیں۔",
        },
        options: {
          en: ["**+ Add** — name field.", "**Edit / Delete** — actions."],
          ur: ["**+ ایڈ** — نام فیلڈ۔", "**ایڈٹ / ڈیلیٹ** — ایکشنز۔"],
        },
        howTo: {
          en: ["Click *+ Add*.", "Type the title (e.g. 'Cashier').", "Save."],
          ur: ["*+ ایڈ* دبائیں۔", "عہدہ لکھیں (مثلاً 'کیشئر')۔", "Save۔"],
        },
      },
    ],
  },

  /* ─────────────── SYSTEM ─────────────── */
  {
    id: "system",
    label: { en: "System & Admin", ur: "سسٹم اور ایڈمن" },
    description: {
      en: "Configuration and account settings.",
      ur: "ترتیبات اور اکاؤنٹ سیٹنگز۔",
    },
    entries: [
      {
        id: "reports",
        label: { en: "Reports & Analytics", ur: "رپورٹس اور تجزیات" },
        icon: BarChart3,
        whatIs: {
          en: "The brain of your business. Pre-built reports tell you which products sell most, which customers spend most, your daily/weekly/monthly profit, and trends over time.",
          ur: "آپ کے کاروبار کا دماغ۔ تیار شدہ رپورٹس بتاتی ہیں کونسی پروڈکٹس زیادہ بکتی ہیں، کون سے گاہک زیادہ خرچ کرتے ہیں، روزانہ/ہفتہ وار/ماہانہ منافع، اور وقت کے ساتھ رجحانات۔",
        },
        example: {
          en: "Boss asks 'What's selling best this month?' You open Reports → Top Products tab → set 'This Month', click Generate. You see: '1. Coke 250ml — 1,420 units, Rs 1,42,000. 2. Cooking Oil 1L — 890 units...'. You email the PDF.",
          ur: "باس پوچھتا ہے 'اس ماہ سب سے زیادہ کیا بک رہا ہے؟' آپ Reports → Top Products کھولتے ہیں → 'اس ماہ' سیٹ کرتے ہیں، Generate دباتے ہیں۔ آپ دیکھتے ہیں: '1. کوک 250ml — 1,420 یونٹس، 1,42,000 روپے۔ 2. کوکنگ آئل 1L — 890 یونٹس...'۔ PDF ای میل کر دیتے ہیں۔",
        },
        options: {
          en: [
            "**Sales tab** — total sales by day/week/month.",
            "**Products tab** — top sellers, slow movers.",
            "**Customers tab** — top spenders, new vs returning.",
            "**Profit tab** — gross profit, margin %, by category.",
            "**Date range picker** — top of every tab.",
            "**Branch filter** — focus on one location.",
            "**Export PDF / Excel** — download.",
            "**Email Report** — send PDF directly to a colleague.",
          ],
          ur: [
            "**Sales ٹیب** — روزانہ/ہفتہ وار/ماہانہ کل فروخت۔",
            "**Products ٹیب** — ٹاپ سیلر، سست رفتار۔",
            "**Customers ٹیب** — سب سے زیادہ خرچ کرنے والے، نئے بمقابلہ پرانے۔",
            "**Profit ٹیب** — مجموعی منافع، margin %، کیٹیگری وار۔",
            "**تاریخ رینج** — ہر ٹیب کے اوپر۔",
            "**برانچ فلٹر** — ایک لوکیشن۔",
            "**Export PDF / Excel** — ڈاؤن لوڈ۔",
            "**Email Report** — PDF براہ راست ساتھی کو۔",
          ],
        },
        howTo: {
          en: [
            "Pick a date range at the top.",
            "Switch report tabs (Sales / Products / Customers / Profit).",
            "Look at the table or chart.",
            "Click Export to download or Email Report to send.",
          ],
          ur: [
            "اوپر تاریخ رینج چنیں۔",
            "ٹیبز بدلیں (Sales / Products / Customers / Profit)۔",
            "ٹیبل یا چارٹ دیکھیں۔",
            "ڈاؤن لوڈ کے لیے Export یا بھیجنے کے لیے Email Report۔",
          ],
        },
      },
      {
        id: "product-export",
        label: { en: "Product Export", ur: "پروڈکٹ ایکسپورٹ" },
        icon: Download,
        whatIs: {
          en: "A way to download your full product catalog as an Excel file. Useful for offline analysis, sharing with partners, or backup.",
          ur: "اپنا پورا پروڈکٹ کیٹلاگ Excel فائل میں ڈاؤن لوڈ کرنے کا طریقہ۔ آف لائن تجزیہ، پارٹنرز کے ساتھ شیئرنگ، یا بیک اپ کے لیے مفید۔",
        },
        example: {
          en: "Your accountant wants the full product list with current prices and stock. You go here, set 'Active products only', click Export. An Excel file downloads with every product, SKU, prices, and current stock. You email it to them.",
          ur: "آپ کے اکاؤنٹنٹ کو موجودہ قیمتوں اور اسٹاک کے ساتھ پوری پروڈکٹ لسٹ چاہیے۔ آپ یہاں آتے ہیں، 'صرف فعال پروڈکٹس' سیٹ کرتے ہیں، Export دباتے ہیں۔ ہر پروڈکٹ، SKU، قیمتیں، اور موجودہ اسٹاک کے ساتھ Excel فائل ڈاؤن لوڈ ہوتی ہے۔ آپ ای میل کر دیتے ہیں۔",
        },
        options: {
          en: [
            "**Category filter** — only export selected categories.",
            "**Status filter** — All / Active only / Inactive only.",
            "**Stock filter** — All / In stock / Low stock / Out of stock.",
            "**Export button** — generates and downloads the Excel.",
          ],
          ur: [
            "**کیٹیگری فلٹر** — صرف منتخب کیٹیگریز ایکسپورٹ۔",
            "**اسٹیٹس فلٹر** — All / صرف فعال / صرف غیر فعال۔",
            "**اسٹاک فلٹر** — All / موجود / کم / ختم۔",
            "**Export بٹن** — Excel بناتا ہے اور ڈاؤن لوڈ کرتا ہے۔",
          ],
        },
        howTo: {
          en: ["Set the filters you want.", "Click Export.", "Open the downloaded Excel file."],
          ur: ["مطلوبہ فلٹرز سیٹ کریں۔", "Export دبائیں۔", "ڈاؤن لوڈ شدہ Excel کھولیں۔"],
        },
      },
      {
        id: "printer-settings",
        label: { en: "Printer Settings", ur: "پرنٹر سیٹنگز" },
        icon: PrinterIcon,
        whatIs: {
          en: "Where you tell the system which printer to use for what. Receipts go to one printer (a small thermal one); barcode labels go to another (a label printer). Set this up once and forget about it.",
          ur: "جہاں آپ سسٹم کو بتاتے ہیں کس کام کے لیے کونسا پرنٹر۔ رسیدیں ایک پرنٹر پر (چھوٹا تھرمل)؛ بار کوڈ لیبل دوسرے پر (لیبل پرنٹر)۔ ایک بار سیٹ کریں، پھر بھول جائیں۔",
        },
        example: {
          en: "You set up a new shop. Two printers are connected to the cashier's PC: an Epson TM-T20 (thermal receipt) and a Zebra ZD220 (barcode labels). You open Printer Settings, click Refresh, the system shows both. You set Receipt = Epson, Barcode = Zebra. Click Test on each — both print. Done.",
          ur: "آپ نئی دکان سیٹ کر رہے ہیں۔ کیشئر کے PC پر دو پرنٹر منسلک ہیں: Epson TM-T20 (تھرمل رسید) اور Zebra ZD220 (بار کوڈ لیبل)۔ آپ Printer Settings کھولتے ہیں، Refresh دباتے ہیں، سسٹم دونوں دکھاتا ہے۔ Receipt = Epson، Barcode = Zebra سیٹ کرتے ہیں۔ ہر ایک پر Test دباتے ہیں — دونوں پرنٹ کرتے ہیں۔ ہو گیا۔",
        },
        options: {
          en: [
            "**Server status indicator** — shows whether the local Print Server is running.",
            "**Refresh Printers button** — re-detects connected printers.",
            "**Receipt Printer dropdown** — choose which printer to use for sale receipts.",
            "**Barcode Printer dropdown** — choose which printer for label printing.",
            "**Test Receipt button** — prints a sample receipt.",
            "**Test Barcode button** — prints a sample label.",
          ],
          ur: [
            "**سرور اسٹیٹس** — لوکل پرنٹ سرور چل رہا ہے یا نہیں۔",
            "**Refresh Printers بٹن** — منسلک پرنٹرز دوبارہ پہچانتا ہے۔",
            "**Receipt Printer ڈراپ ڈاؤن** — رسیدوں کے لیے کونسا پرنٹر۔",
            "**Barcode Printer ڈراپ ڈاؤن** — لیبلز کے لیے کونسا پرنٹر۔",
            "**Test Receipt بٹن** — نمونہ رسید پرنٹ کرتا ہے۔",
            "**Test Barcode بٹن** — نمونہ لیبل پرنٹ کرتا ہے۔",
          ],
        },
        howTo: {
          en: [
            "Make sure the Local Print Server is running (a small app on the cashier's computer).",
            "Click Refresh Printers — the dropdowns fill with all connected printers.",
            "Pick your receipt printer from the first dropdown.",
            "Pick your barcode printer from the second.",
            "Click Test on each to confirm they print correctly.",
          ],
          ur: [
            "لوکل پرنٹ سرور چل رہا ہو (کیشئر کے کمپیوٹر پر ایک چھوٹی ایپ)۔",
            "Refresh Printers دبائیں — ڈراپ ڈاؤنز میں تمام منسلک پرنٹرز آ جائیں گے۔",
            "پہلے ڈراپ ڈاؤن سے ریسیپٹ پرنٹر چنیں۔",
            "دوسرے سے بار کوڈ پرنٹر۔",
            "ہر ایک پر Test دبا کر تصدیق کریں۔",
          ],
        },
      },
      {
        id: "profile",
        label: { en: "Profile Settings", ur: "پروفائل سیٹنگز" },
        icon: User,
        whatIs: {
          en: "Your own account settings. Change your password if it's been compromised, or just see who you are (your role, your branch).",
          ur: "آپ کے اپنے اکاؤنٹ کی ترتیبات۔ اگر پاس ورڈ لیک ہو جائے تو تبدیل کریں، یا اپنا عہدہ اور برانچ دیکھیں۔",
        },
        example: {
          en: "You think someone else may have learned your password. You go to Profile, click *Change Password*, enter the old password and a new strong one. Save. From now on, the new password is required to log in.",
          ur: "آپ کو شک ہے کہ کسی اور نے آپ کا پاس ورڈ جان لیا۔ Profile میں جا کر *Change Password* دباتے ہیں، پرانا پاس ورڈ اور نیا مضبوط داخل کرتے ہیں۔ Save۔ اب سے لاگ ان کے لیے نیا پاس ورڈ چاہیے۔",
        },
        options: {
          en: [
            "**Email display** — read-only, shows your login email.",
            "**Role display** — read-only (SUPER_ADMIN, ADMIN, etc.).",
            "**Assigned Branch** — read-only.",
            "**Change Password section** — current password + new password + confirm.",
            "**Save Password button** — applies the change.",
          ],
          ur: [
            "**ای میل** — read-only، آپ کا لاگ ان ای میل۔",
            "**عہدہ** — read-only (SUPER_ADMIN، ADMIN، وغیرہ)۔",
            "**منسلک برانچ** — read-only۔",
            "**پاس ورڈ تبدیل کریں** — موجودہ + نیا + تصدیق۔",
            "**Save Password بٹن** — تبدیلی لگاتا ہے۔",
          ],
        },
        howTo: {
          en: [
            "Click your name in the sidebar or open Profile from System & Admin.",
            "Type your current password.",
            "Type a new strong password and confirm it.",
            "Click Save Password. You may be asked to log in again with the new password.",
          ],
          ur: [
            "سائڈ بار میں اپنا نام دبائیں یا System & Admin سے Profile کھولیں۔",
            "موجودہ پاس ورڈ لکھیں۔",
            "نیا مضبوط پاس ورڈ لکھیں اور تصدیق کریں۔",
            "Save Password دبائیں۔ ممکن ہے نئے پاس ورڈ سے دوبارہ لاگ ان کرنا پڑے۔",
          ],
        },
        tips: {
          en: [
            "A strong password has at least 8 characters, mixes letters, numbers, and a symbol. Don't reuse the password you use for personal email.",
          ],
          ur: [
            "مضبوط پاس ورڈ کم از کم 8 حروف، حروف، اعداد، اور ایک علامت کا ملاپ ہوتا ہے۔ ذاتی ای میل کا پاس ورڈ یہاں استعمال نہ کریں۔",
          ],
        },
      },
    ],
  },
];

const URDU_FONT_STACK =
  '"Noto Nastaliq Urdu", "Jameel Noori Nastaleeq", "Noto Naskh Arabic", system-ui, sans-serif';

/** Render a string that may contain **bold** and *italic* segments. */
function renderRich(text: string) {
  // Split by bold then italic; preserves order.
  const boldSplit = text.split(/(\*\*[^*]+\*\*)/g);
  return boldSplit.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return (
        <span key={`b-${i}`} className="font-semibold text-slate-800">
          {part.slice(2, -2)}
        </span>
      );
    }
    // italic for *...*
    const italicSplit = part.split(/(\*[^*]+\*)/g);
    return italicSplit.map((seg, j) => {
      if (/^\*[^*]+\*$/.test(seg)) {
        return (
          <em key={`i-${i}-${j}`} className="italic text-slate-700 not-italic font-medium">
            {seg.slice(1, -1)}
          </em>
        );
      }
      return <span key={`t-${i}-${j}`}>{seg}</span>;
    });
  });
}

export function Documentation() {
  const [query, setQuery] = useState("");
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    const saved = localStorage.getItem("docs-lang");
    if (saved === "ur" || saved === "en") setLang(saved);
  }, []);
  useEffect(() => {
    localStorage.setItem("docs-lang", lang);
  }, [lang]);

  const dir: "ltr" | "rtl" = lang === "ur" ? "rtl" : "ltr";
  const langStyle = lang === "ur" ? { fontFamily: URDU_FONT_STACK } : undefined;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.map((s) => ({
      ...s,
      entries: s.entries.filter(
        (e) =>
          e.label[lang].toLowerCase().includes(q) ||
          e.whatIs[lang].toLowerCase().includes(q) ||
          e.example[lang].toLowerCase().includes(q) ||
          e.howTo[lang].some((h) => h.toLowerCase().includes(q)) ||
          e.options[lang].some((o) => o.toLowerCase().includes(q)) ||
          (e.tips?.[lang] || []).some((t) => t.toLowerCase().includes(q))
      ),
    })).filter((s) => s.entries.length > 0);
  }, [query, lang]);

  return (
    <div className="p-4 md:p-6 space-y-6" dir={dir} style={langStyle}>
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100 shrink-0">
              <BookOpen className="h-6 w-6 text-indigo-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-slate-900" style={langStyle}>
                {UI_TEXT.pageTitle[lang]}
              </h1>
              <p className="text-sm text-slate-500 mt-1 leading-relaxed" style={langStyle}>
                {UI_TEXT.pageSubtitle[lang]}
              </p>
            </div>
          </div>

          <div
            className="inline-flex items-center bg-slate-100 rounded-lg p-1 shrink-0"
            dir="ltr"
          >
            <Languages className="h-4 w-4 text-slate-400 ml-2 mr-1" />
            <Button
              size="sm"
              variant={lang === "en" ? "default" : "ghost"}
              onClick={() => setLang("en")}
              className={`h-8 px-3 text-xs font-semibold ${lang === "en" ? "" : "text-slate-600 hover:text-slate-900"}`}
            >
              English
            </Button>
            <Button
              size="sm"
              variant={lang === "ur" ? "default" : "ghost"}
              onClick={() => setLang("ur")}
              className={`h-8 px-3 text-xs font-semibold ${lang === "ur" ? "" : "text-slate-600 hover:text-slate-900"}`}
              style={{ fontFamily: URDU_FONT_STACK }}
            >
              اردو
            </Button>
          </div>
        </div>

        <div className="relative mt-5">
          <Search
            className={`absolute top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 ${
              lang === "ur" ? "right-3" : "left-3"
            }`}
          />
          <Input
            placeholder={UI_TEXT.searchPlaceholder[lang]}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={`h-11 bg-slate-50 border-slate-200 ${lang === "ur" ? "pr-10 text-right" : "pl-10"}`}
            style={langStyle}
          />
        </div>
      </div>

      {/* Quick start */}
      <div className="bg-gradient-to-br from-indigo-50 to-white rounded-xl border border-indigo-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-indigo-600" />
          <h2 className="text-sm font-bold text-indigo-900 uppercase tracking-wide" style={langStyle}>
            {UI_TEXT.quickStart[lang]}
          </h2>
        </div>
        <ol
          className={`space-y-2.5 text-sm text-slate-700 list-decimal marker:text-indigo-500 marker:font-bold ${
            lang === "ur" ? "list-inside pr-2" : "list-inside"
          }`}
          style={langStyle}
        >
          {UI_TEXT.quickStartSteps[lang].map((step, i) => (
            <li key={i} className="leading-relaxed">{renderRich(step)}</li>
          ))}
        </ol>
      </div>

      {/* Sections */}
      {filtered.length === 0 ? (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="py-16 text-center text-slate-400">
            <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium" style={langStyle}>{UI_TEXT.noResults[lang]}</p>
            <p className="text-xs mt-1" style={langStyle}>{UI_TEXT.noResultsHint[lang]}</p>
          </CardContent>
        </Card>
      ) : (
        filtered.map((section) => (
          <div key={section.id} className="space-y-3">
            <div className="flex items-baseline gap-3 px-1 flex-wrap">
              <h2 className="text-base font-bold text-slate-900 uppercase tracking-wide" style={langStyle}>
                {section.label[lang]}
              </h2>
              <span className="text-xs text-slate-400" style={langStyle}>
                — {section.description[lang]}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {section.entries.map((entry) => {
                const Icon = entry.icon;
                return (
                  <Card
                    key={entry.id}
                    className="border-slate-200 shadow-sm hover:border-indigo-200 transition-colors"
                  >
                    <CardHeader className="pb-3 border-b border-slate-100">
                      <div className="flex items-start gap-3">
                        <div className="bg-slate-100 p-2.5 rounded-md shrink-0">
                          <Icon className="h-5 w-5 text-slate-700" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-lg font-bold text-slate-900" style={langStyle}>
                            {entry.label[lang]}
                          </CardTitle>
                          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mt-0.5">
                            {section.label[lang]}
                          </p>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="pt-4 space-y-4">
                      {/* What is this? */}
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5" style={langStyle}>
                          {UI_TEXT.whatIs[lang]}
                        </p>
                        <p className="text-sm text-slate-700 leading-relaxed" style={langStyle}>
                          {entry.whatIs[lang]}
                        </p>
                      </div>

                      {/* Example */}
                      <div className="rounded-md bg-blue-50/60 border border-blue-100 p-3">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Lightbulb className="h-3.5 w-3.5 text-blue-600" />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700" style={langStyle}>
                            {UI_TEXT.example[lang]}
                          </span>
                        </div>
                        <p className="text-sm text-slate-700 leading-relaxed" style={langStyle}>
                          {entry.example[lang]}
                        </p>
                      </div>

                      {/* Options */}
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <ListChecks className="h-3.5 w-3.5 text-slate-500" />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500" style={langStyle}>
                            {UI_TEXT.options[lang]}
                          </span>
                        </div>
                        <ul
                          className={`space-y-1.5 text-sm text-slate-700 list-disc marker:text-slate-400 ${
                            lang === "ur" ? "list-inside pr-1" : "list-inside"
                          }`}
                          style={langStyle}
                        >
                          {entry.options[lang].map((opt, i) => (
                            <li key={i} className="leading-relaxed">{renderRich(opt)}</li>
                          ))}
                        </ul>
                      </div>

                      {/* How to use */}
                      <div className="rounded-md bg-slate-50 border border-slate-100 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-2" style={langStyle}>
                          {UI_TEXT.howToUse[lang]}
                        </p>
                        <ol
                          className={`space-y-1.5 text-sm text-slate-700 list-decimal marker:text-slate-500 marker:font-bold ${
                            lang === "ur" ? "list-inside pr-1" : "list-inside"
                          }`}
                          style={langStyle}
                        >
                          {entry.howTo[lang].map((step, i) => (
                            <li key={i} className="leading-relaxed">{renderRich(step)}</li>
                          ))}
                        </ol>
                      </div>

                      {/* Tips */}
                      {entry.tips && entry.tips[lang].length > 0 && (
                        <div className="bg-amber-50/60 border border-amber-100 rounded-md p-3">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <Badge
                              className="bg-amber-100 text-amber-800 border-amber-200 text-[9px] uppercase tracking-wider px-1.5 py-0 h-4 font-bold"
                              style={langStyle}
                            >
                              {UI_TEXT.tip[lang]}
                            </Badge>
                          </div>
                          <ul
                            className={`space-y-1 text-sm text-amber-900 list-disc marker:text-amber-500 ${
                              lang === "ur" ? "list-inside pr-1" : "list-inside"
                            }`}
                            style={langStyle}
                          >
                            {entry.tips[lang].map((tip, i) => (
                              <li key={i} className="leading-relaxed">{renderRich(tip)}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
