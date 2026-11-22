# PizzaHub Server — REST API

Express + MongoDB API for the PizzaHub pizza ordering platform. It handles menu items, orders, role-based dashboards, ImgBB uploads and Stripe subscriptions with webhook-verified Premium activation.

## Live Links

- **Live API:** https://pizzahub-api-server.vercel.app
- **Live site:** https://pizzahub-client-web.vercel.app
- **Server repository:** https://github.com/mahenaj-tabassum/PizzaHub-Server
- **Client repository:** https://github.com/mahenaj-tabassum/PizzaHub-Client

## Key Features

- JWT verification (Better Auth JWKS) with role-based middleware for Admin, Vendor and Customer
- Blocked users rejected on every protected route
- Public menu API with search, category and location filters, price sorting and pagination
- Order system with duplicate-order protection (partial unique index)
- Free plan limit of 3 active items, enforced inside a MongoDB transaction
- Stripe Checkout (subscription mode), Billing Portal and signed webhooks
- Premium is activated **only** after a verified webhook event
- ImgBB upload proxy so the API key stays on the server
- Zod validation, Helmet, CORS allow-list, global error handler

## Technology Stack

| Package          | Use                                |
| ---------------- | ---------------------------------- |
| `express`        | HTTP server                        |
| `mongodb`        | Database driver                    |
| `jose`           | JWT verification via remote JWKS   |
| `stripe`         | Checkout, Billing Portal, webhooks |
| `zod`            | Request validation                 |
| `multer`         | Image upload (memory storage)      |
| `cors`, `helmet` | Security                           |
| `dotenv`         | Environment variables              |
| `nodemon`        | Dev auto-restart                   |

## Installation

```bash
git clone https://github.com/mahenaj-tabassum/PizzaHub-Server.git
cd PizzaHub-Server
npm install
cp .env.example .env
# fill in the values
```

## Run Locally

```bash
npm run dev          # nodemon, http://localhost:5000
npm start            # plain node
npm run db:indexes   # create indexes (run once per database)
```

## Environment Variables

Create `.env` (never commit it):

```
PORT=

MONGODB_URI=
DB_NAME=

CLIENT_URL=
BETTER_AUTH_URL=

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PREMIUM_PRICE_ID=

IMGBB_API_KEY=
```

| Variable                  | Purpose                                                                 |
| ------------------------- | ----------------------------------------------------------------------- |
| `CLIENT_URL`              | Client origin allowed by CORS and used for Stripe redirect URLs         |
| `BETTER_AUTH_URL`         | Client URL that runs Better Auth (JWT issuer, audience and JWKS source) |
| `STRIPE_PREMIUM_PRICE_ID` | A **recurring** monthly Price in Stripe                                 |
| `STRIPE_WEBHOOK_SECRET`   | Signing secret of the webhook endpoint                                  |

## Stripe Webhook Setup

Endpoint URL: `https://pizzahub-api-server.vercel.app/api/webhooks/stripe`

Subscribe to these events:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

Also enable the **Customer Portal** in Stripe settings so "Manage subscription" works.

## Middleware Flow

Every protected route runs:

```
verifyToken  →  checkBlocked  →  requireRole(...)  →  validate(zodSchema)  →  controller
```

| Step                                                             | Failure |
| ---------------------------------------------------------------- | ------- |
| `verifyToken` (signature, issuer, audience, expiry, user exists) | 401     |
| `checkBlocked`                                                   | 403     |
| `requireRole`                                                    | 403     |
| `validate`                                                       | 400     |

Ownership is verified in every controller. `vendorId` and `customerId` always come from the token's user, never from the request body.

## API Overview

**Public**

| Method | Endpoint              | Description                             |
| ------ | --------------------- | --------------------------------------- |
| GET    | `/api/menu`           | List approved and available items       |
| GET    | `/api/menu/featured`  | 6 featured items, Premium vendors first |
| GET    | `/api/menu/locations` | Distinct locations for the filter       |
| GET    | `/api/menu/:id`       | Single item                             |

**Menu query parameters** (`GET /api/menu`)

| Param           | Rule                                                                     |
| --------------- | ------------------------------------------------------------------------ |
| `q`             | Regex-escaped, case-insensitive match on `itemName` or `description`     |
| `category`      | Exact match                                                              |
| `location`      | Case-insensitive match                                                   |
| `sort`          | `price_asc` or `price_desc` (default: newest). Anything else returns 400 |
| `page`, `limit` | Positive integers, default 1 and 12, max limit 50                        |

**Customer**: `POST /api/orders`, `GET /api/orders/my-orders`, `GET /api/orders/:id`, `PATCH /api/orders/:id/cancel`, `GET /api/customer/stats`

**Vendor**: `POST|GET /api/vendor/items`, `GET|PATCH|DELETE /api/vendor/items/:id`, `PATCH /api/vendor/items/:id/status`, `GET /api/vendor/orders`, `PATCH /api/vendor/orders/:id/status`, `GET /api/vendor/stats`

**Payment (vendor)**: `POST /api/payment/checkout`, `GET /api/payment/status`, `POST /api/payment/portal`

**Admin**: `GET /api/admin/stats`, `GET /api/admin/users`, `PATCH /api/admin/users/:id/block|unblock`, `GET /api/admin/items`, `PATCH /api/admin/items/:id/approve|reject|status`, `DELETE /api/admin/items/:id`, `GET /api/admin/transactions`

**Other**: `POST /api/upload`, `GET|PATCH /api/users/me`, `POST /api/webhooks/stripe`

## Business Rules Enforced on the Server

- Only `approved` and `isAvailable` items are public and orderable
- Vendors cannot order their own items; only customers can place orders
- Only `pending` orders can be accepted, rejected or cancelled, and only once
- One active order per customer, item and delivery date (unique partial index)
- Free vendors may have at most 3 active items (pending and approved count)
- Editing an item resets it to `pending` for re-approval
- Admins cannot block admins or themselves, and there is no endpoint to edit transactions
- Profile updates accept only `name`, `image` and `businessName`. Role and plan cannot be changed

## Deployment (Vercel)

`api/index.js` exports the Express app and `vercel.json` rewrites all paths to it. Set all environment variables in the Vercel dashboard, then run `npm run db:indexes` once against the production database.
