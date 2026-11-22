import stripe from "../config/stripe.js";
import { getCollection } from "../config/db.js";
import {
  findVendorIdBySubscription,
  isSubscriptionActive,
  updateVendorSubscription,
  upsertSubscriptionTransaction,
} from "../services/subscription.service.js";

const getId = (value) => {
  if (!value) return null;
  return typeof value === "string" ? value : value.id || null;
};

// Newer Stripe API versions keep the period end on subscription items.
const getPeriodEnd = (subscription) => {
  const itemEnds = (subscription.items?.data || [])
    .map((item) => item.current_period_end)
    .filter(Number.isFinite);

  if (itemEnds.length > 0) return Math.max(...itemEnds);

  return subscription.current_period_end ?? null;
};

const getInvoiceSubscriptionId = (invoice) =>
  getId(invoice.subscription) ||
  getId(invoice.parent?.subscription_details?.subscription);

// Which transaction does this event belong to? null = no identity.
const getEventIdentity = (event) => {
  const object = event.data.object;

  if (event.type.startsWith("checkout.session.")) {
    return { sessionId: object.id };
  }

  if (event.type.startsWith("customer.subscription.")) {
    return { subscriptionId: object.id };
  }

  if (event.type.startsWith("invoice.")) {
    const subscriptionId = getInvoiceSubscriptionId(object);
    return subscriptionId ? { subscriptionId } : null;
  }

  return null;
};

const buildIdentityQuery = ({ sessionId, subscriptionId }) =>
  sessionId
    ? { stripeSessionId: sessionId }
    : { stripeSubscriptionId: subscriptionId };

const isEventProcessed = async (identity, eventId) => {
  const transactions = await getCollection("transactions");

  const existing = await transactions.findOne(buildIdentityQuery(identity), {
    projection: { processedStripeEventIds: 1 },
  });

  return existing?.processedStripeEventIds?.includes(eventId) || false;
};

const markEventProcessed = async (identity, eventId) => {
  const transactions = await getCollection("transactions");

  await transactions.updateOne(buildIdentityQuery(identity), {
    $addToSet: { processedStripeEventIds: eventId },
    $set: { updatedAt: new Date() },
  });
};

// Reads the real subscription state from Stripe and syncs it to the vendor.
// Every subscription/invoice event uses this, so order and duplicates
// of events do not matter.
const syncSubscription = async (subscriptionId, vendorIdHint = null) => {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  const vendorId =
    vendorIdHint ||
    subscription.metadata?.vendorId ||
    (await findVendorIdBySubscription(subscription.id));

  if (!vendorId) {
    throw new Error("Subscription is missing vendor information");
  }

  await updateVendorSubscription({
    vendorId,
    subscriptionId: subscription.id,
    customerId: getId(subscription.customer),
    status: subscription.status,
    currentPeriodEnd: getPeriodEnd(subscription),
  });

  return { subscription, vendorId };
};

const handleCheckoutCompleted = async (session, eventId) => {
  if (session.mode !== "subscription") return;

  // Never activate Premium unless Stripe says the session is paid.
  if (
    session.payment_status !== "paid" &&
    session.payment_status !== "no_payment_required"
  ) {
    return;
  }

  const vendorId = session.metadata?.vendorId || session.client_reference_id;
  const subscriptionId = getId(session.subscription);

  if (!vendorId || !subscriptionId) {
    throw new Error("Checkout session is missing subscription metadata");
  }

  const { subscription } = await syncSubscription(subscriptionId, vendorId);

  await upsertSubscriptionTransaction({
    vendorId,
    sessionId: session.id,
    subscriptionId,
    customerId: getId(session.customer),
    amount: session.amount_total,
    currency: session.currency,
    status: isSubscriptionActive(subscription.status) ? "completed" : "failed",
    eventId,
  });
};

// Expired / failed checkout. A completed payment is never overwritten.
const handleCheckoutNotCompleted = async (session, eventId, status) => {
  const transactions = await getCollection("transactions");

  await transactions.updateOne(
    { stripeSessionId: session.id, status: { $ne: "completed" } },
    {
      $set: {
        status,
        lastStripeEventId: eventId,
        updatedAt: new Date(),
      },
    },
  );
};

const handleSubscriptionEvent = async (eventSubscription) => {
  await syncSubscription(eventSubscription.id);
};

const handleInvoiceEvent = async (invoice) => {
  const subscriptionId = getInvoiceSubscriptionId(invoice);
  if (!subscriptionId) return;

  await syncSubscription(subscriptionId);
};

export const HandleStripeWebhook = async (req, res) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return res.status(500).json({
      success: false,
      message: "Stripe webhook secret is not configured",
    });
  }

  if (!Buffer.isBuffer(req.body)) {
    return res.status(400).json({
      success: false,
      message: "Invalid webhook request body",
    });
  }

  const signature = req.headers["stripe-signature"];

  if (!signature) {
    return res.status(400).json({
      success: false,
      message: "Stripe signature is missing",
    });
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (error) {
    console.error("Stripe signature verification failed:", error.message);

    return res.status(400).json({
      success: false,
      message: "Webhook signature verification failed",
    });
  }

  try {
    const identity = getEventIdentity(event);

    // Skip duplicates only when we can tell which transaction owns the event.
    if (identity && (await isEventProcessed(identity, event.id))) {
      return res.status(200).json({ received: true, duplicate: true });
    }

    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await handleCheckoutCompleted(event.data.object, event.id);
        break;

      case "checkout.session.async_payment_failed":
        await handleCheckoutNotCompleted(event.data.object, event.id, "failed");
        break;

      case "checkout.session.expired":
        await handleCheckoutNotCompleted(
          event.data.object,
          event.id,
          "expired",
        );
        break;

      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await handleSubscriptionEvent(event.data.object);
        break;

      case "invoice.payment_succeeded":
      case "invoice.payment_failed":
        await handleInvoiceEvent(event.data.object);
        break;

      default:
        // Other valid Stripe events need no action.
        break;
    }

    if (identity) {
      await markEventProcessed(identity, event.id);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Stripe webhook processing failed:", {
      eventId: event.id,
      eventType: event.type,
      message: error.message,
    });

    // Non-2xx tells Stripe to retry the event.
    return res.status(500).json({
      success: false,
      message: "Webhook processing failed",
    });
  }
};
