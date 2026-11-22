/**
 * Responsibilities of this file:
 * - Find the account using the Vendor's database identity.
 * - Store the Stripe subscription period in the database.
 * - Upgrade the account to Premium when the subscription is active.
 * - Downgrade the account to Free when the subscription is deleted or inactive.
 * - Create or update transaction records.
 */

import { ObjectId } from "mongodb";
import { getCollection } from "../config/db.js";
import { SUBSCRIPTION_PLANS } from "../utils/constants.js";

const ACTIVE_SUBSCRIPTION_STATUSES = ["active", "trialing"];

export const isSubscriptionActive = (status) =>
  ACTIVE_SUBSCRIPTION_STATUSES.includes(status);

const buildVendorQuery = (vendorId) => {
  const conditions = [{ id: vendorId }, { _id: vendorId }];

  if (/^[0-9a-fA-F]{24}$/.test(vendorId)) {
    conditions.push({ _id: new ObjectId(vendorId) });
  }

  return {
    role: "vendor",
    $or: conditions,
  };
};

// Used when Stripe metadata does not contain vendorId.
export const findVendorIdBySubscription = async (subscriptionId) => {
  if (!subscriptionId) return null;

  const transactions = await getCollection("transactions");
  const transaction = await transactions.findOne(
    { stripeSubscriptionId: subscriptionId },
    { projection: { vendorId: 1 } },
  );

  if (transaction?.vendorId) return transaction.vendorId;

  const users = await getCollection("users");
  const vendor = await users.findOne(
    { stripeSubscriptionId: subscriptionId },
    { projection: { _id: 1 } },
  );

  return vendor ? String(vendor._id) : null;
};

export const updateVendorSubscription = async ({
  vendorId,
  subscriptionId,
  customerId,
  status,
  currentPeriodEnd,
  subscriptionCreatedAt,
}) => {
  if (!vendorId) {
    throw new Error("Vendor ID is required");
  }

  const users = await getCollection("users");

  const vendor = await users.findOne(buildVendorQuery(String(vendorId)), {
    projection: {
      stripeSubscriptionId: 1,
      stripeSubscriptionCreatedAt: 1,
    },
  });

  if (!vendor) {
    throw new Error("Vendor account not found");
  }

  const isActive = isSubscriptionActive(status);

  // Ignore events from an older subscription after a newer subscription has
  // already become the vendor's current subscription.
  const incomingCreatedAt = Number.isFinite(subscriptionCreatedAt)
    ? new Date(subscriptionCreatedAt * 1000)
    : null;
  const storedCreatedAt = vendor.stripeSubscriptionCreatedAt
    ? new Date(vendor.stripeSubscriptionCreatedAt)
    : null;

  if (
    incomingCreatedAt &&
    storedCreatedAt &&
    incomingCreatedAt < storedCreatedAt
  ) {
    return { skipped: true, reason: "stale_subscription_event" };
  }

  // Without a period end Premium could never be activated safely.
  // Throwing makes Stripe retry the event and keeps the error visible.
  if (isActive && !currentPeriodEnd) {
    throw new Error("Active subscription is missing its period end");
  }

  // A late event from an old subscription must not cancel a newer one.
  if (
    !isActive &&
    vendor.stripeSubscriptionId &&
    vendor.stripeSubscriptionId !== subscriptionId
  ) {
    return { skipped: true };
  }

  const updateFilter = { _id: vendor._id };

  // Make the stale-event guard atomic. Two webhook requests can run at the
  // same time, so a pre-read check alone is not sufficient.
  if (incomingCreatedAt) {
    updateFilter.$or = [
      { stripeSubscriptionCreatedAt: { $exists: false } },
      { stripeSubscriptionCreatedAt: { $lte: incomingCreatedAt } },
    ];
  }

  const updateResult = await users.updateOne(updateFilter, {
    $set: {
      subscriptionPlan: isActive
        ? SUBSCRIPTION_PLANS.PREMIUM
        : SUBSCRIPTION_PLANS.FREE,
      subscriptionStatus: status || "inactive",
      subscriptionExpiresAt: isActive
        ? new Date(currentPeriodEnd * 1000)
        : null,
      stripeSubscriptionId: subscriptionId || null,
      stripeSubscriptionCreatedAt:
        incomingCreatedAt || vendor.stripeSubscriptionCreatedAt || null,
      stripeCustomerId: customerId || null,
      updatedAt: new Date(),
    },
  });

  if (updateResult.matchedCount !== 1) {
    return { skipped: true, reason: "stale_subscription_event" };
  }

  return { skipped: false };
};

export const upsertSubscriptionTransaction = async ({
  vendorId,
  sessionId,
  subscriptionId,
  customerId,
  amount,
  currency,
  status,
  paidAt,
  eventId,
}) => {
  const transactions = await getCollection("transactions");
  const now = new Date();

  const update = {
    $set: {
      vendorId: String(vendorId),
      plan: "premium",
      status,
      updatedAt: now,
    },
    $setOnInsert: {
      createdAt: now,
    },
  };

  if (subscriptionId) update.$set.stripeSubscriptionId = subscriptionId;
  if (customerId) update.$set.stripeCustomerId = customerId;
  if (typeof amount === "number") update.$set.amount = amount;
  if (currency) update.$set.currency = currency.toLowerCase();
  if (paidAt instanceof Date && !Number.isNaN(paidAt.getTime())) {
    update.$set.paidAt = paidAt;
  }
  if (eventId) update.$set.lastStripeEventId = eventId;

  const run = () =>
    transactions.updateOne({ stripeSessionId: sessionId }, update, {
      upsert: true,
    });

  try {
    return await run();
  } catch (error) {
    // Two events upserting the same session at once: retry once.
    if (error.code === 11000) return run();
    throw error;
  }
};
