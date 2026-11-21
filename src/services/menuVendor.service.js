/**
 * Responsibility:
 * - Attach safe public vendor info to menu items.
 * - Calculate whether the vendor currently has an active Premium plan.
 */

// Step 1: find the vendor and calculate the Premium flag.
export const vendorLookupStages = (now = new Date()) => [
  {
    $lookup: {
      from: "users",
      let: { itemVendorId: "$vendorId" },
      pipeline: [
        {
          $match: {
            $expr: {
              $or: [
                { $eq: ["$id", "$$itemVendorId"] },
                { $eq: [{ $toString: "$_id" }, "$$itemVendorId"] },
              ],
            },
          },
        },
        {
          $project: {
            name: 1,
            businessName: 1,
            image: 1,
            subscriptionPlan: 1,
            subscriptionExpiresAt: 1,
          },
        },
      ],
      as: "vendor",
    },
  },
  { $addFields: { vendor: { $arrayElemAt: ["$vendor", 0] } } },
  {
    // Premium must not be expired.
    $addFields: {
      isPremiumVendor: {
        $and: [
          { $eq: ["$vendor.subscriptionPlan", "premium"] },
          { $gt: ["$vendor.subscriptionExpiresAt", now] },
        ],
      },
    },
  },
];

// Step 2: keep only public fields and remove internal ones.
export const vendorShapeStages = [
  {
    $addFields: {
      vendorInfo: {
        name: { $ifNull: ["$vendor.name", ""] },
        businessName: { $ifNull: ["$vendor.businessName", ""] },
        image: { $ifNull: ["$vendor.image", null] },
        isPremium: "$isPremiumVendor",
      },
    },
  },
  { $project: { vendor: 0, isPremiumVendor: 0 } },
];

// ---------------------------------------------------------------------------
// ADMIN ONLY: attaches vendor name, email, business name and image.
// Never use this in a public endpoint because it exposes the email.
// Works for menuItems and transactions (both have a vendorId field).
// ---------------------------------------------------------------------------
export const adminVendorInfoStages = () => [
  {
    $lookup: {
      from: "users",
      let: { itemVendorId: "$vendorId" },
      pipeline: [
        {
          $match: {
            $expr: {
              $or: [
                { $eq: ["$id", "$$itemVendorId"] },
                { $eq: [{ $toString: "$_id" }, "$$itemVendorId"] },
              ],
            },
          },
        },
        {
          $project: {
            name: 1,
            email: 1,
            businessName: 1,
            image: 1,
          },
        },
      ],
      as: "vendor",
    },
  },
  { $addFields: { vendor: { $arrayElemAt: ["$vendor", 0] } } },
  {
    $addFields: {
      // null if the vendor account no longer exists
      vendorInfo: {
        $cond: [
          "$vendor",
          {
            name: { $ifNull: ["$vendor.name", ""] },
            email: { $ifNull: ["$vendor.email", ""] },
            businessName: { $ifNull: ["$vendor.businessName", ""] },
            image: { $ifNull: ["$vendor.image", null] },
          },
          null,
        ],
      },
    },
  },
  { $project: { vendor: 0 } },
];
