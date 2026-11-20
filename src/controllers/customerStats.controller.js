/**
 * Customer Dashboard-এর Overview-এ Assignment অনুযায়ী দেখাবে:
 * - Total orders
 * - Pending orders
 * - Accepted orders
 * - Rejected orders
 */

import { getCollection } from "../config/db.js";

const GetCustomerStats = async (req, res, next) => {
  try {
    const customerId = String(req.user.id || req.user._id);
    const orderCollection = await getCollection("orders");
    const [totalOrders, pendingOrders, acceptedOrders, rejectedOrders] =
      await Promise.all([
        orderCollection.countDocuments({ customerId }),
        orderCollection.countDocuments({ customerId, status: "pending" }),
        orderCollection.countDocuments({ customerId, status: "accepted" }),
        orderCollection.countDocuments({ customerId, status: "rejected" }),
      ]);
    res.status(200).json({
      success: true,
      message: "Customer statistics retrieved successfully",
      data: {
        totalOrders,
        pendingOrders,
        acceptedOrders,
        rejectedOrders,
      },
    });
  } catch (error) {
    next(error);
  }
};
