import { getCollection } from "../config/db.js";

// GET: /api/customer/stats

const GetCustomerStats = async (req, res, next) => {
  try {
    const customerId = String(req.user.id || req.user._id);

    const orderCollection = await getCollection("orders");

    const [totalOrders, pendingOrders, acceptedOrders, rejectedOrders] =
      await Promise.all([
        orderCollection.countDocuments({
          customerId,
        }),

        orderCollection.countDocuments({
          customerId,
          status: "pending",
        }),

        orderCollection.countDocuments({
          customerId,
          status: "accepted",
        }),

        orderCollection.countDocuments({
          customerId,
          status: "rejected",
        }),
      ]);

    return res.status(200).json({
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

export default GetCustomerStats;
