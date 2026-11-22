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

// 2. CORS Configuration
const clientUrl = process.env.CLIENT_URL?.trim().replace(/\/+$/, "");

const allowedOrigins = [
  clientUrl,
  ...(process.env.NODE_ENV !== "production" ? ["http://localhost:3000"] : []),
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
 
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(null, false);
  },

  credentials: true,

  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],

  allowedHeaders: ["Content-Type", "Authorization"],

  maxAge: 86400,
};

app.use(cors(corsOptions));

// 3. Stripe Webhook
// Must come before express.json()
app.use(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  webhookRoutes,
);

// 4. Root Route
app.get("/", (req, res) => {
  res.send("Server is running successfully");
});

// 5. Parse JSON
app.use(express.json());

// 6. API Routes
app.use("/api", apiRoutes);

// 7. Not Found
app.use(notFound);

// 8. Global Error Handler
app.use(errorHandler);

export default app;
