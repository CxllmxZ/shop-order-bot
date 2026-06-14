# Shop Order Bot 🛒

> ระบบรับออเดอร์ผ่าน LINE สำหรับร้านค้าออนไลน์ — ลูกค้าสั่งง่าย เจ้าของร้านจัดการได้จากที่เดียว

ระบบ LINE OA สำหรับร้านค้าออนไลน์แบบครบวงจร ลูกค้าแอดบอท กดปุ่ม กรอกฟอร์ม จบ — ออเดอร์เข้าระบบทันที พร้อมแจ้งเตือนเจ้าของร้านผ่าน LINE พร้อม Dashboard จัดการออเดอร์แบบ mobile-first

🇬🇧 **English version:** [README.md](README.md)

---

## Demo

[![Demo Video](https://img.youtube.com/vi/Gtz1SvxyMpU/maxresdefault.jpg)](https://www.youtube.com/shorts/Gtz1SvxyMpU)

### ลองด้วยตัวเอง

<img src="docs/line-qr.png" alt="LINE OA QR Code" width="200">

สแกน QR ด้วยแอป LINE เพื่อแอดบอท แล้วลองสั่งสินค้าได้เลย

- **คลิป Demo:** [ดูบน YouTube](https://www.youtube.com/shorts/Gtz1SvxyMpU)
- **Portfolio:** [project-bimav.vercel.app](https://project-bimav.vercel.app)

---

## ฟีเจอร์ที่มี

### สำหรับลูกค้า
- แอดบอท LINE → กดปุ่ม "สั่งสินค้า" → กรอกฟอร์ม → จบ
- ฟอร์มเปิดในแอป LINE เลย ไม่ต้องสลับ browser
- ได้รับการ์ดยืนยันออเดอร์พร้อมเลขออเดอร์ 6 หลัก

### สำหรับเจ้าของร้าน (Admin)
- เปิด Dashboard ผ่าน LINE ไม่ต้อง login ใหม่
- เห็นสถิติ real-time: วันนี้ / เดือนนี้ / รอดำเนินการ
- กรอง / ค้นหา / จัดเรียงออเดอร์ได้
- เปลี่ยนสถานะแค่กดปุ่มเดียว
- กดเบอร์ลูกค้าเพื่อโทรได้เลย
- กดที่อยู่ → เปิด Google Maps
- ใช้บนมือถือสะดวก ใช้บน desktop ก็ได้

### ระบบ
- ตรวจสอบ signature ของ LINE webhook ทุก request (HMAC-SHA256)
- เลขออเดอร์ 6 หลัก unique สร้างอัตโนมัติ
- ป้องกันเปลี่ยนสถานะข้ามขั้น (เช่น pending → completed)
- Admin ลงทะเบียนผ่านรหัสลับ
- แจ้งเตือนทุก admin เมื่อมีออเดอร์ใหม่

---

## เทคโนโลยีที่ใช้

| ส่วน | เทคโนโลยี |
|------|----------|
| Backend | Cloudflare Workers (TypeScript) |
| Database | Cloudflare D1 (SQLite serverless) |
| Frontend | HTML + Vanilla JS + Tailwind CDN |
| Auth | LINE LIFF + ตรวจสอบ user_id |
| Messaging | LINE Messaging API + Flex Messages |
| Hosting | Cloudflare Pages |

ไม่ใช้ framework, ไม่มี build step ฝั่งหน้าเว็บ deploy บน edge ทั่วโลก response เร็วกว่า 50ms

---

## ภาพรวมระบบ

```
┌─ ลูกค้า ─────────────────┐         ┌─ เจ้าของร้าน ─────────┐
│                          │         │                       │
│ LINE OA                  │         │ LINE OA               │
│   ↓                      │         │   ↓                   │
│ Rich Menu / Flex         │         │ พิมพ์ #dashboard       │
│   ↓                      │         │   ↓                   │
│ LIFF ฟอร์มสั่งของ        │         │ LIFF Dashboard        │
│   ↓                      │         │   ↓ ↑                 │
└───────┬──────────────────┘         └───────┬───────────────┘
        ↓                                    ↓
        ↓        Cloudflare Worker           ↓
        └──────────►  /webhook   ◄───────────┘
                     /order
                     /admin/*
                            ↓
                     ┌──────────────┐
                     │ Cloudflare D1│
                     │  - orders    │
                     │  - admins    │
                     │  - sessions  │
                     │  - config    │
                     └──────────────┘
```

---

## เหมาะกับใคร

- 🏪 ร้านค้าออนไลน์ที่ใช้ LINE OA รับออเดอร์
- 📦 ขายของผ่าน LINE แต่จดออเดอร์ในกระดาษ/Excel แล้วเริ่มงง
- 💸 อยากมีระบบของตัวเอง ไม่ต้องจ่าย SaaS รายเดือน
- 🛠 อยากได้ template ที่ปรับแต่งเองได้ ไม่ต้องเขียนใหม่ตั้งแต่ต้น

---

## วิธีติดตั้ง

### สิ่งที่ต้องมีก่อน

- Node.js 18 ขึ้นไป
- Cloudflare account (ฟรี ไม่ต้องบัตร)
- LINE Developer account
- LINE Messaging API channel + LINE Login channel

### 1. Clone โปรเจกต์

```bash
git clone https://github.com/CxllmxZ/shop-order-bot.git
cd shop-order-bot
npm install
```

### 2. ตั้งค่า Cloudflare

```bash
npm install -g wrangler
wrangler login
```

สร้าง D1 database:
```bash
npx wrangler d1 create shop-order-db
```

Copy `database_id` ที่ได้ไปใส่ใน `wrangler.jsonc`

รัน migrations:
```bash
npx wrangler d1 execute shop-order-db --remote --file=./migrations/0001_init.sql
npx wrangler d1 execute shop-order-db --remote --file=./migrations/0002_order_code.sql
```

### 3. ตั้งค่า Secrets

```bash
npx wrangler secret put LINE_CHANNEL_SECRET
npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
npx wrangler secret put ADMIN_REGISTER_CODE
```

### 4. Deploy

```bash
# Worker (backend)
npx wrangler deploy

# LIFF ฟอร์มสั่งของ
npx wrangler pages deploy liff --project-name=shop-order-liff

# Dashboard
npx wrangler pages deploy admin --project-name=shop-order-admin
```

### 5. ตั้งค่า LINE

1. **Messaging API channel** → ใส่ Webhook URL = `https://[worker-ของคุณ].workers.dev/webhook`
2. **LINE Login channel** → สร้าง LIFF 2 ตัว:
   - ฟอร์มสั่งของ → endpoint = URL ของ LIFF Pages
   - Dashboard → endpoint = URL ของ Admin Pages
3. แก้ LIFF ID ใน `liff/index.html` และ `admin/index.html`

### 6. ลงทะเบียนตัวเองเป็น admin

ในแชท bot พิมพ์:
```
ลงทะเบียนแอดมิน [รหัสที่ตั้งใน secret]
```

---

## โครงสร้าง project

```
shop-order-bot/
├─ src/
│  └─ index.ts              # Backend หลัก
├─ liff/
│  └─ index.html            # ฟอร์มสั่งของ (ลูกค้า)
├─ admin/
│  └─ index.html            # Dashboard (admin)
├─ migrations/
│  ├─ 0001_init.sql
│  ├─ 0002_order_code.sql
│  └─ 0003_backfill_order_code.sql
├─ wrangler.jsonc           # Config + D1 binding
└─ README.md
```

---

## สถานะออเดอร์

```
รอดำเนินการ ──► ยืนยันแล้ว ──► จัดส่งแล้ว ──► เสร็จสิ้น
    │              │
    └──────────────┴───► ยกเลิก
```

ระบบจะป้องกันการเปลี่ยนสถานะข้ามขั้น (เช่น เปลี่ยนจาก completed กลับเป็น pending ไม่ได้)

---

## ค่าใช้จ่าย

ทุกอย่างใช้ **free tier** ของแต่ละบริการ ไม่เสียค่าใช้จ่ายจนกว่าจะ scale ใหญ่:

| บริการ | Free tier | พอใช้สำหรับ |
|--------|----------|-------------|
| Cloudflare Workers | 100,000 request/วัน | ~3,000 ออเดอร์/วัน |
| Cloudflare D1 | 5GB + 100K writes/วัน | หลายหมื่นออเดอร์ |
| Cloudflare Pages | unlimited static | ไม่มีขีดจำกัด |
| LINE Messaging API | 200 push/เดือน (free) หรือไม่จำกัด (LINE OA Pro) | depend on plan |

---

## หมายเหตุด้านความปลอดภัย

- LINE webhook ตรวจสอบ signature ทุก request
- Admin API ต้องส่ง `X-LINE-User-Id` + ตรวจสอบกับตาราง `admins`
- Secret ทั้งหมดเก็บใน Cloudflare Workers secret store ไม่อยู่ใน source code

**สำหรับ production จริงจัง:** แนะนำให้ upgrade เป็น LIFF ID Token verification (verify server-side) แทนการเชื่อ user_id ที่ส่งจาก client ระบบปัจจุบันเหมาะสำหรับร้านค้าทั่วไปที่เชื่อใจ LINE network ได้แล้ว

---

## รับงานเพิ่มเติม / ปรับแต่ง

ต้องการเวอร์ชันที่ปรับให้เหมาะกับร้านของคุณ? เช่น:
- เพิ่มหลายสินค้า + ภาพประกอบ
- ระบบ catalog แบบเลือกได้
- รวมการชำระเงิน (PromptPay, Stripe)
- รายงานยอดขายแบบละเอียด
- ระบบสมาชิก + ส่วนลด
- เชื่อม Shopee / Lazada

ติดต่อได้เลย จะคุยให้ก่อน ไม่กดดัน

---

## ผู้พัฒนา

**นพรุจ พัฒนสาร** ([@CxllmxZ](https://github.com/CxllmxZ))

- 🌐 [Portfolio](https://project-bimav.vercel.app)
- 📧 n.pattanasarn@gmail.com
- 💬 [LINE](https://line.me/ti/p/bp1re7o1jJ)

---

## License

MIT — ใช้ได้ฟรี แก้ได้ ขายต่อได้ (ดู [LICENSE](LICENSE))