/**
 * Vendor Dashboard Statistics
 *
 * Endpoint: GET /api/vendor/stats
 *
 * Responsibilities:
 * - Retrieve the authenticated vendor's ID from req.user.
 * - Count the vendor's total menu items.
 * - Count active menu items (approved and currently available).
 * - Count pending customer orders.
 * - Count accepted customer orders.
 * - Retrieve the vendor's current subscription plan.
 * - Return all statistics in a structured JSON response.
 * - Ensure vendors can only access their own statistics.
 * - Handle database errors appropriately.
 */

import { getCollection } from "../config/db.js";
const GetVendorStats = async (req, res, next) => {
  try {
    const vendorId = String(req.user.id || req.user._id);
    const menuCollection = await getCollection("menuItems");
    const orderCollection = await getCollection("orders");
    const usersCollection = await getCollection("users");

    const [totalItems, activeItems, pendingOrders, acceptedOrders, vendor] =
      await Promise.all([
        menuCollection.countDocuments({ vendorId }),
        menuCollection.countDocuments({
          vendorId,
          status: "approved",
          isAvailable: true,
        }),
        orderCollection.countDocuments({ vendorId, status: "pending" }),
        orderCollection.countDocuments({ vendorId, status: "accepted" }),
        usersCollection.findOne({ $or: [{ id: vendorId }, { _id: vendorId }] }),
      ]);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor account not found",
      });
    }
    res.status(200).json({
      success: true,
      data: {
        totalItems,
        activeItems,
        pendingOrders,
        acceptedOrders,
        subscriptionPlan: vendor.subscriptionPlan || "free",
      },
    });
  } catch (error) {
    next(error);
  }
};

export default GetVendorStats;
