# PizzaHub Server

REST API for **PizzaHub**, a role-based pizza ordering and delivery platform. Customers browse menus and place orders, vendors (restaurants) publish menu items and manage orders, and admins moderate users, items and transactions. Vendors can upgrade to a Premium subscription through Stripe Checkout.

- **Live API:** <https://your-server.vercel.app>
- **Live Website:** <https://your-client.vercel.app>
- **Server Repository:** <https://github.com/your-username/pizzahub-server>
- **Client Repository:** <https://github.com/your-username/pizzahub-client>

## Important Features

- JWT verification (Better Auth JWKS) with role-based middleware: Admin, Vendor, Customer
- Blocked users are rejected on every protected route
- Menu items go through admin approval: `pending` → `approved` / `rejected`
- Public menu with search, category and location filters, price sorting and pagination
- Free plan: max 3 active items. Premium: unlimited (enforced inside a MongoDB transaction)
- Orders with duplicate-active-order protection (unique partial index)
- Vendors can accept or reject only pending orders, and only once
- Customers can cancel only their own pending orders
- Stripe Checkout (subscription mode) with signed webhooks. Premium is activated **only** after a verified webhook event
- Subscription cancellation and expiry handled through webhooks and the Stripe Billing Portal
- Image upload to ImgBB through the server, so the API key stays private
- Validation with Zod, centralized error handling, Helmet security headers
- Seed scripts for the admin user and sample menu items

## Technology Stack

| Package         | Purpose                                       |
| --------------- | --------------------------------------------- |
| `express` (v5)  | Web framework                                 |
| `mongodb`       | Database driver                               |
| `jose`          | JWT verification against the Better Auth JWKS |
| `stripe`        | Checkout, Billing Portal, webhooks            |
| `multer`        | Image upload (memory storage)                 |
| `zod`           | Request validation                            |
| `cors`          | CORS configuration                            |
| `helmet`        | Security headers                              ||
| `dotenv`        | Environment variables                         |
| `nodemon` (dev) | Auto-restart in development                   |

## Environment Variables

Copy `.env.example` to `.env` and fill in the values. **Never commit `.env`.**

| Name                      | Description                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| `PORT`                    | Local server port                                                                          |
| `NODE_ENV`                | `development` or `production`                                                              |
| `MONGODB_URI`             | MongoDB connection string                                                                  |
| `DB_NAME`                 | Database name (must be the same database Better Auth uses)                                 |
| `CLIENT_URL`              | Frontend URL, no trailing slash. Used for CORS and Stripe redirect URLs                    |
| `BETTER_AUTH_URL`         | URL where Better Auth runs (the Next.js app). Used to verify JWT issuer, audience and JWKS |
| `STRIPE_SECRET_KEY`       | Stripe secret key                                                                          |
| `STRIPE_WEBHOOK_SECRET`   | Stripe webhook signing secret (`whsec_...`)                                                |
| `STRIPE_PREMIUM_PRICE_ID` | Stripe recurring Price ID for the Premium plan                                             |
| `IMGBB_API_KEY`           | ImgBB API key                                                                              |
| `SEED_ADMIN_EMAIL`        | Email of an already registered user to promote to admin                                    |
| `SEED_VENDOR_EMAIL`       | Email of an already registered vendor who will own the sample items                        |

## Installation and Running Locally

```bash
git clone <server-repo-url>
cd pizzahub-server
npm install
cp .env.example .env     # then fill in the values
npm run dev              # http://localhost:5000
```

Database setup (run once):

```bash
npm run db:indexes       # create unique and compound indexes
```

1. Register the admin and a vendor account from the client app (Better Auth creates them).
2. Put their emails in `SEED_ADMIN_EMAIL` and `SEED_VENDOR_EMAIL`.
3. Run:

```bash
npm run db:seed:admin    # promotes the account to admin
npm run db:seed:menu     # inserts sample approved menu items
```

Stripe webhook (local testing):

```bash
stripe listen --forward-to localhost:5000/api/webhooks/stripe
```

Copy the printed `whsec_...` value into `STRIPE_WEBHOOK_SECRET`.

## Scripts

| Script                  | Description              |
| ----------------------- | ------------------------ |
| `npm start`             | Start the server         |
| `npm run dev`           | Start with nodemon       |
| `npm run db:indexes`    | Create database indexes  |
| `npm run db:seed:admin` | Assign the admin role    |
| `npm run db:seed:menu`  | Insert sample menu items |

## API Overview

Protected routes need the header `Authorization: Bearer <JWT>`.

| Area          | Endpoints                                                                                                         | Access                      |
| ------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Menu          | `GET /api/menu`, `GET /api/menu/featured`, `GET /api/menu/:id`                                                    | Public                      |
| Profile       | `GET /api/users/me`, `PATCH /api/users/me`                                                                        | Any signed-in user          |
| Upload        | `POST /api/upload` (field name: `image`)                                                                          | Any signed-in user          |
| Orders        | `POST /api/orders`, `GET /api/orders/my-orders`, `GET /api/orders/:id`, `PATCH /api/orders/:id/cancel`            | Customer                    |
| Customer      | `GET /api/customer/stats`                                                                                         | Customer                    |
| Vendor items  | `POST/GET /api/vendor/items`, `GET/PATCH/DELETE /api/vendor/items/:id`, `PATCH /api/vendor/items/:id/status`      | Vendor                      |
| Vendor orders | `GET /api/vendor/orders`, `PATCH /api/vendor/orders/:id/status`                                                   | Vendor                      |
| Vendor stats  | `GET /api/vendor/stats`                                                                                           | Vendor                      |
| Payment       | `POST /api/payment/checkout`, `GET /api/payment/status`, `POST /api/payment/portal`                               | Vendor                      |
| Admin users   | `GET /api/admin/users`, `PATCH /api/admin/users/:id/block`, `PATCH /api/admin/users/:id/unblock`                  | Admin                       |
| Admin items   | `GET /api/admin/items`, `PATCH /api/admin/items/:id/approve`, `/reject`, `/status`, `DELETE /api/admin/items/:id` | Admin                       |
| Admin data    | `GET /api/admin/stats`, `GET /api/admin/transactions`                                                             | Admin                       |
| Webhook       | `POST /api/webhooks/stripe`                                                                                       | Stripe (signature verified) |

## Challenge Implementation Notes

### 1. Advanced search and sorting

`GET /api/menu` accepts these query parameters:

| Parameter  | Description                                          |
| ---------- | ---------------------------------------------------- |
| `q`        | Case-insensitive search in item name and description |
| `category` | Exact match with one of the six fixed categories     |
| `location` | Case-insensitive partial match on location           |
| `sort`     | `price_asc` or `price_desc` (default: newest first)  |
| `page`     | Page number, default `1`                             |
| `limit`    | Items per page, default `12`, max `50`               |

Example: `/api/menu?q=chicken&category=Meat%20Lovers&location=Chattogram&sort=price_asc&page=1&limit=12`

How it works (`src/services/menuQuery.service.js`):

1. Every parameter is validated. Invalid input returns `400`.
2. User text is regex-escaped before use, which prevents regex injection.
3. The base filter is always `status: "approved"` and `isAvailable: true`, so pending, rejected or inactive items can never leak to the public.
4. `_id` is added to the sort as a tie-breaker so pagination is stable.
5. A `$lookup` attaches public vendor info and the Premium flag to the items of the requested page only.

### 2. JWT verification middleware

Middleware flow for protected routes:

```
Request
  → verifyToken     (401 if missing, invalid or expired token)
  → checkBlocked    (403 if the account is blocked)
  → requireRole     (403 if the role is not allowed)
  → validate        (400 if the body fails Zod validation)
  → controller      (ownership is checked inside the query)
```

`verifyToken` details (`src/middleware/verifyToken.js`):

1. Reads `Authorization: Bearer <token>`.
2. Verifies signature, issuer, audience and expiry with `jose` and the remote JWKS at `<BETTER_AUTH_URL>/api/auth/jwks`.
3. Loads the current user from MongoDB using the token `sub`.
4. Attaches that database user to `req.user`.

The role and blocked status always come from the database, never from the token or the client. Resource ownership is enforced inside the query itself (for example `{ _id, vendorId }`), so one user can never touch another user's data.

### 3. Payment flow

1. Vendor calls `POST /api/payment/checkout`. The vendor ID comes from the verified token, so nobody can create a session for another vendor.
2. The server creates a Stripe Checkout Session and saves a `pending` transaction.
3. The vendor pays on Stripe and is redirected to the Payment Success page. **This redirect never activates Premium.**
4. Stripe sends a signed webhook. The server verifies the signature, reads the real subscription from Stripe, and only then sets `subscriptionPlan: "premium"` and `subscriptionExpiresAt`.
5. Duplicate events are skipped, and cancelled or expired subscriptions are downgraded to Free through the same webhook handler.

## Testing the Application

- **Admin Email:** `<admin email>`
- **Admin Password:** `<admin password>`
- **Stripe test card:** `4242 4242 4242 4242`, any future expiry date, any CVC, any ZIP.
- To test as a vendor, sign up with the Vendor role, add items, then upgrade from the Subscription page.
