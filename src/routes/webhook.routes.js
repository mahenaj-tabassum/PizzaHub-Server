import { Router } from "express";
import { HandleStripeWebhook } from "../controllers/webhook.controller.js";

const router = Router();

router.post("/", HandleStripeWebhook);

export default router;
