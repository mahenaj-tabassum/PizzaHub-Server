import stripe from "../config/stripe.js";
import { getCollection } from "../config/db.js";

const CreatePremiumCheckoutSession = async (req, res, next) => {
  let session;

  try {
    const vendor = req.user;

    if (!vendor || vendor.role !== "vendor") {
      return res.status(403).json({
        success: false,
        message: "Vendor access is required",
      });
    }

    const vendorId = String(vendor.id || vendor._id);

    const priceId = process.env.STRIPE_PREMIUM_PRICE_ID;
    const clientUrl = process.env.CLIENT_URL?.replace(/\/+$/, "");

    if (!priceId || !clientUrl) {
      return res.status(500).json({
        success: false,
        message: "Stripe subscription configuration is missing",
      });
    }

    // Avoid creating a second subscription when one is active.
    const activePremium =
      vendor.subscriptionPlan === "premium" &&
      vendor.subscriptionExpiresAt instanceof Date &&
      vendor.subscriptionExpiresAt > new Date();

    if (activePremium) {
      return res.status(409).json({
        success: false,
        message: "You already have an active Premium subscription",
      });
    }

    // Validate the server-configured Stripe Price.
    const price = await stripe.prices.retrieve(priceId);

    if (!price.active || price.type !== "recurring" || !price.recurring) {
      return res.status(500).json({
        success: false,
        message: "Premium Stripe price is not configured correctly",
      });
    }

    const sessionParams = {
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url:
        `${clientUrl}/vendor/subscription/success` +
        "?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: `${clientUrl}/vendor/subscription/cancel`,
      client_reference_id: vendorId,
      metadata: {
        vendorId,
        plan: "premium",
      },
      subscription_data: {
        metadata: {
          vendorId,
          plan: "premium",
        },
      },
    };

    if (vendor.email) {
      sessionParams.customer_email = vendor.email;
    }

    if (vendor.stripeCustomerId) {
      delete sessionParams.customer_email;
      sessionParams.customer = vendor.stripeCustomerId;
    }

    session = await stripe.checkout.sessions.create(sessionParams, {
      idempotencyKey: `premium-checkout-${vendorId}-${Date.now()}`,
    });

    const transactions = await getCollection("transactions");

    await transactions.insertOne({
      vendorId,
      plan: "premium",
      amount: price.unit_amount,
      currency: price.currency,
      stripeSessionId: session.id,
      stripeSubscriptionId: null,
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return res.status(201).json({
      success: true,
      message: "Stripe Checkout session created",
      data: {
        checkoutUrl: session.url,
        sessionId: session.id,
      },
    });
  } catch (error) {
    // If saving the pending transaction fails, expire the unused session.
    if (session?.id) {
      try {
        await stripe.checkout.sessions.expire(session.id);
      } catch {
        // Keep the original error.
      }
    }

    next(error);
  }
};

export default CreatePremiumCheckoutSession;
