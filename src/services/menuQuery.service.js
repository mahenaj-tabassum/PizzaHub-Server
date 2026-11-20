/**
 * Responsibility:
 * - Build MongoDB queries for filtering menu items.
 * - Escape special regex characters to ensure safe text searches.
 * - Apply sorting based on the selected sort options.
 * - Handle pagination by calculating the current page, limit, and skip value.
 */

const escapeRegex = (value) => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const buildMenuQuery = ({ q, category, location }) => {
  const query = {
    status: "approved",
    isAvailable: true,
  };

  //   Search by item name
  if (q) {
    query.itemName = {
      $regex: escapeRegex(q),
      $options: "i", // no differentiation between uppercase and lowercase.
    };
  }

  //   Filter by category
  if (category) {
    query.category = {
      $regex: escapeRegex(category),
      $options: "i",
    };
  }

  //   Filter by location
  if (location) {
    query.location = {
      $regex: escapeRegex(location),
      $options: "i",
    };
  }
  return query;
};

const getMenuSort = (sort) => {
  switch (sort) {
    case "price_asc":
      return { price: 1 }; // 1 = ascending
    case "price_desc":
      return { price: -1 };
    default:
      return { createdAt: -1 };
  }
};

const getPagination = (page, limit) => {
  const currentPage = Math.max(1, Number(page) || 1);
  const perPage = Math.min(50, Math.max(1, Number(limit)) || 12);

  return {
    page: currentPage,
    limit: perPage,
    skip: (currentPage - 1) * perPage,
  };
};

export { buildMenuQuery, getMenuSort, getPagination };
