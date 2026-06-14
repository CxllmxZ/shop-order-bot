# Shop Order Bot

> Production-ready LINE bot for small shops — customers order via LINE, you manage everything from one dashboard.

A complete order management system built on Cloudflare Workers, LINE Messaging API, and LIFF. Customers add the bot, tap a button, fill a form, and the order arrives in your inbox. Admins manage orders through a mobile-first dashboard, all inside LINE.

![Tech](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)
![Tech](https://img.shields.io/badge/Database-D1-F38020?logo=cloudflare&logoColor=white)
![Tech](https://img.shields.io/badge/LINE-Messaging%20API-00C300?logo=line&logoColor=white)
![Tech](https://img.shields.io/badge/LIFF-2.0-00C300?logo=line&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## Features

**Customer side**
- Add bot → tap order button → fill form → done
- LIFF form opens inside LINE (no browser switch)
- Instant order confirmation with order code

**Admin side**
- LINE-authenticated dashboard (no separate login)
- Real-time stats (today / month / pending)
- Filter / search / sort orders
- One-tap status updates with optimistic UI
- Direct-call buttons + Google Maps integration
- Mobile-first, works on desktop too

**System**
- LINE webhook with HMAC-SHA256 signature verification
- Auto-generated 6-digit unique order codes
- Status transition validation (no skipping states)
- Admin registration via secret code
- Push notifications to admins on new orders

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Cloudflare Workers (TypeScript) |
| Database | Cloudflare D1 (SQLite, serverless) |
| Frontend | HTML + Vanilla JS + Tailwind CDN |
| Auth | LINE LIFF + user_id verification |
| Messaging | LINE Messaging API + Flex Messages |
| Hosting | Cloudflare Pages |

No frameworks, no build step on frontend. Edge-deployed, sub-50ms response globally.

---

## Architecture

```
┌─ Customer ──────────────┐         ┌─ Admin ────────────┐
│                         │         │                    │
│ LINE OA                 │         │ LINE OA            │
│   ↓                     │         │   ↓                │
│ Rich Menu / Flex        │         │ #dashboard         │
│   ↓                     │         │   ↓                │
│ LIFF Form (Pages)       │         │ LIFF Dashboard     │
│   ↓                     │         │   ↓ ↑              │
└───────┬─────────────────┘         └───────┬────────────┘
        ↓                                   ↓
        ↓        Cloudflare Worker          ↓
        └──────────►  /webhook   ◄──────────┘
                     /order
                     /admin/me
                     /admin/stats
                     /admin/orders
                            ↓
                     ┌──────────────┐
                     │ Cloudflare D1│
                     │   - orders   │
                     │   - admins   │
                     │   - sessions │
                     │   - config   │
                     └──────────────┘
```

---

## Demo

[![Demo Video](https://img.youtube.com/vi/Gtz1SvxyMpU/maxresdefault.jpg)](https://www.youtube.com/shorts/Gtz1SvxyMpU)

### Try it yourself

<img src="[docs/line-qr.png](https://github.com/CxllmxZ/shop-order-bot/blob/main/docs/301flifo.png)" alt="LINE OA QR Code" width="200">

Scan with LINE app to add the bot and try ordering.

- **Demo video:** [Watch on YouTube](https://www.youtube.com/shorts/Gtz1SvxyMpU)
- **Portfolio:** [project-bimav.vercel.app](https://project-bimav.vercel.app)

---

## Setup

### Prerequisites

- Node.js 18+
- Cloudflare account (free tier works)
- LINE Developer account
- LINE Messaging API channel + LINE Login channel

### 1. Clone and install

```bash
git clone https://github.com/CxllmxZ/shop-order-bot.git
cd shop-order-bot
npm install
```

### 2. Cloudflare setup

```bash
npm install -g wrangler
wrangler login
```

Create D1 database:

```bash
npx wrangler d1 create shop-order-db
```

Copy the `database_id` into `wrangler.jsonc`.

Run migrations:

```bash
npx wrangler d1 execute shop-order-db --remote --file=./migrations/0001_init.sql
npx wrangler d1 execute shop-order-db --remote --file=./migrations/0002_order_code.sql
```

### 3. Set secrets

```bash
npx wrangler secret put LINE_CHANNEL_SECRET
npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
npx wrangler secret put ADMIN_REGISTER_CODE
```

### 4. Deploy

```bash
# Worker (backend)
npx wrangler deploy

# LIFF form (frontend)
npx wrangler pages deploy liff --project-name=shop-order-liff

# Admin dashboard
npx wrangler pages deploy admin --project-name=shop-order-admin
```

### 5. Configure LINE

1. **Messaging API channel** — set webhook URL to `https://[your-worker].workers.dev/webhook`
2. **LINE Login channel** — create 2 LIFF apps:
   - Order form → endpoint = LIFF Pages URL
   - Admin dashboard → endpoint = Admin Pages URL
3. Update LIFF IDs in `liff/index.html` and `admin/index.html`

### 6. Register yourself as admin

In LINE chat with the bot:
```
ลงทะเบียนแอดมิน [your-admin-code]
```

---

## Configuration

### Environment variables (set via `wrangler secret put`)

| Name | Description |
|------|-------------|
| `LINE_CHANNEL_SECRET` | From Messaging API channel → Basic settings |
| `LINE_CHANNEL_ACCESS_TOKEN` | From Messaging API channel → Messaging API tab |
| `ADMIN_REGISTER_CODE` | Secret code admins type to register themselves |

### Bindings (in `wrangler.jsonc`)

- `DB` → D1 database `shop-order-db`

---

## API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/webhook` | LINE signature | Receive LINE events |
| `POST` | `/order` | None (LIFF user_id in body) | Submit new order |
| `GET` | `/admin/me` | `X-LINE-User-Id` | Verify admin status |
| `GET` | `/admin/stats` | `X-LINE-User-Id` | Dashboard statistics |
| `GET` | `/admin/orders` | `X-LINE-User-Id` | List orders (paginated) |
| `PATCH` | `/admin/orders/:id` | `X-LINE-User-Id` | Update order status |

### Query params for `/admin/orders`

- `status` — `all` | `pending` | `confirmed` | `shipped` | `completed` | `cancelled`
- `search` — keyword (name, phone, order code)
- `sort` — `new` | `old` | `high` | `low`
- `page` — page number (1-based)
- `limit` — items per page (default 20, max 100)

---

## Project Structure

```
shop-order-bot/
├─ src/
│  └─ index.ts              # Worker entry — all backend logic
├─ liff/
│  └─ index.html            # Order form (customer)
├─ admin/
│  └─ index.html            # Dashboard (admin)
├─ migrations/
│  ├─ 0001_init.sql         # Initial schema
│  ├─ 0002_order_code.sql   # Add order_code column
│  └─ 0003_backfill_order_code.sql
├─ wrangler.jsonc           # Worker config + D1 binding
├─ package.json
└─ README.md
```

---

## Status Flow

```
pending ──► confirmed ──► shipped ──► completed
   │           │
   └───────────┴───► cancelled
```

Invalid transitions return 400 from the API.

---

## Security Notes

- LINE webhook signature is verified on every request (HMAC-SHA256)
- Admin API requires `X-LINE-User-Id` header + presence in `admins` table
- LIFF apps verify user via `liff.getProfile()` before submitting
- Secrets stored in Cloudflare Workers secret store, never in source

**For production deployments:** Consider upgrading to LIFF ID Token verification (server-side) instead of trusting client-sent user_id. Current setup is sufficient for trusted shops but not for high-security scenarios.

---

## License

MIT — see [LICENSE](LICENSE)

---

## Author

Built by **Nopparut Pattanasarn** ([@CxllmxZ](https://github.com/CxllmxZ))

- 🌐 [Portfolio](https://project-bimav.vercel.app)
- 📧 n.pattanasarn@gmail.com
- 💬 [LINE](https://line.me/ti/p/bp1re7o1jJ)

If you find this useful or want a custom version for your shop, get in touch.
