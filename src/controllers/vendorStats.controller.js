import { getCollection } from "../config/db.js";

const getVendorId = (user) => {
  return String(user.id || user._id);
};

const getCurrentSubscriptionPlan = (vendor) => {
  const plan = vendor.subscriptionPlan || "free";

  if (plan !== "premium") {
    return "free";
  }

  if (!vendor.subscriptionExpiresAt) {
    return "free";
  }

  const expiryDate = new Date(vendor.subscriptionExpiresAt);

  if (Number.isNaN(expiryDate.getTime())) {
    return "free";
  }

  return expiryDate > new Date() ? "premium" : "free";
};

// GET: /api/vendor/stats
const GetVendorStats = async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== "vendor") {
      return res.status(403).json({
        success: false,
        message: "Vendor access is required",
      });
    }

    const vendorId = getVendorId(req.user);

    if (!vendorId || vendorId === "undefined") {
      return res.status(401).json({
        success: false,
        message: "Invalid vendor identity",
      });
    }

    const menuCollection = await getCollection("menuItems");
    const orderCollection = await getCollection("orders");

    const [
      totalItems,
      activeItems,
      pendingOrders,
      acceptedOrders,
      rejectedOrders,
    ] = await Promise.all([
      // All menu items created by this vendor.
      menuCollection.countDocuments({
        vendorId,
      }),

      // Publicly active menu items.
      menuCollection.countDocuments({
        vendorId,
        status: "approved",
        isAvailable: true,
      }),

      orderCollection.countDocuments({
        vendorId,
        status: "pending",
      }),

      orderCollection.countDocuments({
        vendorId,
        status: "accepted",
      }),

      orderCollection.countDocuments({
        vendorId,
        status: "rejected",
      }),
    ]);

    const subscriptionPlan = getCurrentSubscriptionPlan(req.user);

    return res.status(200).json({
      success: true,
      message: "Vendor statistics retrieved successfully",
      data: {
        totalItems,
        activeItems,
        pendingOrders,
        acceptedOrders,
        rejectedOrders,
        subscriptionPlan,
        subscriptionExpiresAt: req.user.subscriptionExpiresAt || null,
      },
    });
  } catch (error) {
    next(error);
  }
};

export default GetVendorStats;
