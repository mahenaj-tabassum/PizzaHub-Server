import { Router } from "express";
const router = Router();

router.post("/", (req, res) => {
  // Stripe webhook body should be a Buffer
  if (!Buffer.isBuffer(req.body)) {
    return res.status(400).json({
      success: false,
      message: "Invalid webhook request body",
    });
  }

  // Stripe signature verification and event handling will be implemented in the payment integration step.

  return res.status(501).json({
    success: false,
    message: "Webhook handler is not implemented yet",
  });
});

export default router;
