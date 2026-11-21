import { getCollection } from "../config/db.js";
import { adminVendorInfoStages } from "../services/menuVendor.service.js";

// GET: /api/admin/transactions
const GetAllTransactions = async (req, res, next) => {
  try {
    const { page = "1", limit = "10", status } = req.query;

    const currentPage = Number(page);
    const perPage = Number(limit);

    if (
      !Number.isInteger(currentPage) ||
      currentPage < 1 ||
      !Number.isInteger(perPage) ||
      perPage < 1
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid pagination values",
      });
    }

    const safeLimit = Math.min(perPage, 50);
    const skip = (currentPage - 1) * safeLimit;

    const query = {};

    // Optional status filter.
    if (status !== undefined) {
      if (typeof status !== "string" || !status.trim()) {
        return res.status(400).json({
          success: false,
          message: "Invalid transaction status",
        });
      }

      query.status = status.trim();
    }

    const transactionCollection = await getCollection("transactions");

    const [transactions, totalTransactions] = await Promise.all([
      transactionCollection
        .aggregate([
          { $match: query },
          { $sort: { createdAt: -1, _id: -1 } },
          { $skip: skip },
          { $limit: safeLimit },
          ...adminVendorInfoStages(),
          // Internal webhook bookkeeping is not needed by the admin UI.
          {
            $project: {
              processedStripeEventIds: 0,
              lastStripeEventId: 0,
            },
          },
        ])
        .toArray(),

      transactionCollection.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      message: "Transactions retrieved successfully",
      data: transactions,
      pagination: {
        currentPage,
        limit: safeLimit,
        totalTransactions,
        totalPages: Math.ceil(totalTransactions / safeLimit),
      },
    });
  } catch (error) {
    next(error);
  }
};

export default GetAllTransactions;
