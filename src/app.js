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

// 2. CORS configuration
/* app.use(
	  cors({
	    origin: process.env.CLIENT_URL,
	    credentials: true,
	  }),
 ) */
app.use(cors());
// 3. Stripe webhook (must come before express.json)
app.use(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  webhookRoutes,
);

// 4. Parse incoming JSON requests
app.use(express.json());

// 5. API routes
app.use("/api", apiRoutes);

// 6. Handle unknown routes
app.use(notFound);

// 7. Global error handler (must be last)
app.use(errorHandler);

export default app;
