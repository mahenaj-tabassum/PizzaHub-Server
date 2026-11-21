import express from "express";
import helmet from "helmet";
import cors from "cors";

import apiRoutes from "./routes/index.js";
import webhookRoutes from "./routes/webhook.routes.js";

import notFound from "./middleware/notFound.js";
import errorHandler from "./middleware/errorHandler.js";

const app = express();

// 1. Security Headers
app.use(helmet());

// 2. CORS: only the real client (plus localhost while developing).
const clientUrl = process.env.CLIENT_URL?.trim().replace(/\/+$/, "");

const allowedOrigins = [
  clientUrl,
  ...(process.env.NODE_ENV === "production" ? [] : ["http://localhost:3000"]),
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // No Origin header: Stripe webhooks, Postman, server-to-server calls.
      if (!origin) return callback(null, true);

      // Disallowed origins simply get no CORS headers (browser blocks them).
      return callback(null, allowedOrigins.includes(origin));
    },
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  }),
);

// 3. Stripe webhook (must come before express.json)
app.use(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  webhookRoutes,
);

app.get("/", (req, res) => {
  res.send("Server is running successfully");
});

// 4. Parse incoming JSON requests
app.use(express.json());

// 5. API routes
app.use("/api", apiRoutes);

// 6. Handle unknown routes
app.use(notFound);

// 7. Global error handler (must be last)
app.use(errorHandler);

export default app;
