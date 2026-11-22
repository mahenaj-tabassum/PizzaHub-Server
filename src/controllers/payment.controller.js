import { randomUUID } from "node:crypto";
import stripe from "../config/stripe.js";
import { getCollection } from "../config/db.js";

const getVendorId = (user) => String(user.id || user._id);

const isPremiumActive = (vendor) => {
  if (vendor.subscriptionPlan !== "premium") {
    return false;
  }

  const expiry = vendor.subscriptionExpiresAt
    ? new Date(vendor.subscriptionExpiresAt)
    : null;

  return (
    expiry instanceof Date &&
    !Number.isNaN(expiry.getTime()) &&
    expiry > new Date()
  );
};

// POST /api/payment/checkout
export const CreateCheckoutSession = async (req, res, next) => {
  const vendor = req.user;
  const vendorId = getVendorId(vendor);
  const priceId = process.env.STRIPE_PREMIUM_PRICE_ID;
  const clientUrl = process.env.CLIENT_URL?.replace(/\/+$/, "");

  if (!priceId || !clientUrl) {
    return res.status(500).json({
      success: false,
      message: "Payment configuration is missing",
    });
  }

  const users = await getCollection("users");
  const transactions = await getCollection("transactions");
  const lockToken = randomUUID();
  const now = new Date();
  const lockUntil = new Date(now.getTime() + 5 * 60 * 1000);

  // Atomically allow only one checkout-creation request per vendor.
  // The lock expires if a serverless invocation is terminated unexpectedly.
  const lockResult = await users.updateOne(
    {
      _id: vendor._id,
      $or: [
        { premiumCheckoutLockUntil: { $exists: false } },
        { premiumCheckoutLockUntil: { $lte: now } },
      ],
    },
    {
      $set: {
        premiumCheckoutLockToken: lockToken,
        premiumCheckoutLockUntil: lockUntil,
      },
    },
  );

  if (lockResult.matchedCount !== 1) {
    return res.status(409).json({
      success: false,
      message: "A Premium checkout request is already being processed",
    });
  }

  let session;

  try {
    if (isPremiumActive(vendor)) {
      return res.status(409).json({
        success: false,
        message: "Your Premium subscription is already active",
      });
    }

    // Reuse an existing open Checkout Session instead of creating another
    // subscription when the vendor retries or double-clicks.
    const pendingTransaction = await transactions.findOne(
      {
        vendorId,
        status: "pending",
        stripeSessionId: { $type: "string" },
      },
      { sort: { createdAt: -1 } },
    );

    if (pendingTransaction) {
      const pendingSession = await stripe.checkout.sessions.retrieve(
        pendingTransaction.stripeSessionId,
      );

      if (pendingSession.status === "open" && pendingSession.url) {
        return res.status(200).json({
          success: true,
          message: "An existing checkout session is ready",
          data: {
            checkoutUrl: pendingSession.url,
            sessionId: pendingSession.id,
          },
        });
      }

      if (pendingSession.status === "complete") {
        return res.status(409).json({
          success: false,
          message: "Your payment is being confirmed. Please refresh shortly.",
        });
      }

      if (pendingSession.status === "expired") {
        await transactions.updateOne(
          {
            _id: pendingTransaction._id,
            status: "pending",
          },
          {
            $set: {
              status: "expired",
              updatedAt: new Date(),
            },
          },
        );
      }
    }

    const price = await stripe.prices.retrieve(priceId);

    if (!price.active || price.type !== "recurring") {
      return res.status(500).json({
        success: false,
        message: "Premium recurring price is not configured correctly",
      });
    }

    // Check Stripe itself too, because local subscription data can be stale.
    // Policy: block a second checkout while any non-terminal subscription
    // exists. In particular, past_due is blocked while Stripe retries payment.
    if (vendor.stripeCustomerId) {
      const subscriptions = stripe.subscriptions.list({
        customer: vendor.stripeCustomerId,
        status: "all",
        limit: 100,
      });

      const blockingStatuses = new Set([
        "active",
        "trialing",
        "past_due",
        "unpaid",
        "incomplete",
        "paused",
      ]);

      for await (const subscription of subscriptions) {
        if (blockingStatuses.has(subscription.status)) {
          return res.status(409).json({
            success: false,
            message:
              subscription.status === "past_due"
                ? "Your existing Premium subscription has a payment issue. Please update the payment method in the billing portal before starting another subscription."
                : "An existing Premium subscription must be resolved before creating another checkout session.",
            data: { subscriptionStatus: subscription.status },
          });
        }
      }
    }

    const params = {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
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
      success_url: `${clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${clientUrl}/payment/cancel`,
    };

    if (vendor.stripeCustomerId) {
      params.customer = vendor.stripeCustomerId;
    } else if (vendor.email) {
      params.customer_email = vendor.email;
    }

    session = await stripe.checkout.sessions.create(params, {
      idempotencyKey: `premium-checkout-${vendorId}-${lockToken}`,
    });

    await transactions.updateOne(
      { stripeSessionId: session.id },
      {
        $setOnInsert: {
          vendorId,
          plan: "premium",
          amount: price.unit_amount,
          currency: price.currency,
          stripeSessionId: session.id,
          stripeSubscriptionId: null,
          status: "pending",
          createdAt: new Date(),
        },
        $set: {
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );

    return res.status(201).json({
      success: true,
      message: "Checkout session created successfully",
      data: {
        checkoutUrl: session.url,
        sessionId: session.id,
      },
    });
  } catch (error) {
    if (session?.id) {
      try {
        await stripe.checkout.sessions.expire(session.id);
      } catch (expireError) {
        console.error(
          "Could not expire unused Stripe session:",
          expireError.message,
        );
      }
    }

    return next(error);
  } finally {
    await users
      .updateOne(
        {
          _id: vendor._id,
          premiumCheckoutLockToken: lockToken,
        },
        {
          $unset: {
            premiumCheckoutLockToken: "",
            premiumCheckoutLockUntil: "",
          },
        },
      )
      .catch((error) => {
        console.error(
          "Could not release Premium checkout lock:",
          error.message,
        );
      });
  }
};

// GET /api/payment/status?session_id=cs_...
// This endpoint ONLY reads database state. It never activates Premium.
export const GetPaymentStatus = async (req, res, next) => {
  try {
    const vendorId = getVendorId(req.user);
    const sessionId = req.query.session_id;

    if (typeof sessionId !== "string" || !sessionId.startsWith("cs_")) {
      return res.status(400).json({
        success: false,
        message: "A valid session_id is required",
      });
    }

    const transactions = await getCollection("transactions");

    const transaction = await transactions.findOne({
      vendorId,
      stripeSessionId: sessionId,
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Payment session not found",
      });
    }

    const expiry = req.user.subscriptionExpiresAt
      ? new Date(req.user.subscriptionExpiresAt)
      : null;

    const isPremiumActive =
      req.user.subscriptionPlan === "premium" &&
      expiry instanceof Date &&
      !Number.isNaN(expiry.getTime()) &&
      expiry > new Date();

    return res.status(200).json({
      success: true,
      data: {
        paymentStatus: transaction.status,
        subscriptionPlan: isPremiumActive ? "premium" : "free",
        isPremiumActive,
        subscriptionExpiresAt: req.user.subscriptionExpiresAt || null,

        // Payment details
        amount: transaction.amount,
        currency: transaction.currency,
        createdAt: transaction.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/payment/portal
// Vendor manages/cancels their subscription in Stripe Billing Portal.
export const CreateBillingPortalSession = async (req, res, next) => {
  try {
    const vendor = req.user;
    const clientUrl = process.env.CLIENT_URL?.replace(/\/+$/, "");

    if (!vendor.stripeCustomerId) {
      return res.status(409).json({
        success: false,
        message: "No Stripe customer account is linked to this vendor",
      });
    }

    if (!clientUrl) {
      return res.status(500).json({
        success: false,
        message: "CLIENT_URL is not configured",
      });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: vendor.stripeCustomerId,
      return_url: `${clientUrl}/dashboard/vendor/subscription`,
    });

    return res.status(200).json({
      success: true,
      data: {
        portalUrl: portalSession.url,
      },
    });
  } catch (error) {
    next(error);
  }
};
