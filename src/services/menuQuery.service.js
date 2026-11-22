/**
 * Responsibility:
 * - Validate public menu query parameters.
 * - Build safe MongoDB search and filter queries.
 * - Apply supported sorting options.
 * - Calculate pagination values.
 */

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;

const ALLOWED_SORT_OPTIONS = ["price_asc", "price_desc"];

class MenuQueryValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "MenuQueryValidationError";
    this.statusCode = 400;
  }
}

// Escape special regex characters supplied by users.
const escapeRegex = (value) => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// Validate optional text query parameters.
// An empty or whitespace-only value is treated as "not provided".
const validateText = (value, fieldName, maxLength = 100) => {
  if (value === undefined) return undefined;

  if (typeof value !== "string") {
    throw new MenuQueryValidationError(`${fieldName} must be a string`);
  }

  const trimmedValue = value.trim();

  // Ignore the filter instead of failing the whole request.
  if (!trimmedValue) return undefined;

  if (trimmedValue.length > maxLength) {
    throw new MenuQueryValidationError(
      `${fieldName} cannot exceed ${maxLength} characters`,
    );
  }

  return trimmedValue;
};

// Validate positive integer query parameters.
const parsePositiveInteger = (value, fieldName, defaultValue) => {
  if (value === undefined) return defaultValue;

  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw new MenuQueryValidationError(
      `${fieldName} must be a positive integer`,
    );
  }

  const parsedValue = Number(value);

  if (!Number.isSafeInteger(parsedValue)) {
    throw new MenuQueryValidationError(`${fieldName} is too large`);
  }

  return parsedValue;
};

// Build public menu search and filter query.
const buildMenuQuery = ({ q, category, location }) => {
  const search = validateText(q, "q");
  const selectedCategory = validateText(category, "category");
  const selectedLocation = validateText(location, "location");

  const query = {
    status: "approved",
    isAvailable: true,
  };

  // Search item name and description.
  if (search) {
    const safeSearch = escapeRegex(search);

    query.$or = [
      {
        itemName: {
          $regex: safeSearch,
          $options: "i",
        },
      },
      {
        description: {
          $regex: safeSearch,
          $options: "i",
        },
      },
    ];
  }

  if (selectedCategory) {
    query.category = selectedCategory;
  }

  if (selectedLocation) {
    query.location = {
      $regex: escapeRegex(selectedLocation),
      $options: "i",
    };
  }

  return query;
};

// Return supported MongoDB sort object.
const getMenuSort = (sort) => {
  // Missing or empty sort means "newest first".
  if (sort === undefined || sort === "") {
    return { createdAt: -1, _id: -1 };
  }

  if (typeof sort !== "string" || !ALLOWED_SORT_OPTIONS.includes(sort)) {
    throw new MenuQueryValidationError(
      "Invalid sort option. Use price_asc or price_desc",
    );
  }

  switch (sort) {
    case "price_asc":
      return { price: 1, _id: 1 };

    case "price_desc":
      return { price: -1, _id: -1 };

    default:
      return { createdAt: -1, _id: -1 };
  }
};

// Calculate pagination.
const getPagination = (page, limit) => {
  const currentPage = parsePositiveInteger(page, "page", DEFAULT_PAGE);

  const perPage = parsePositiveInteger(limit, "limit", DEFAULT_LIMIT);

  if (perPage > MAX_LIMIT) {
    throw new MenuQueryValidationError(`limit cannot exceed ${MAX_LIMIT}`);
  }

  return {
    page: currentPage,
    limit: perPage,
    skip: (currentPage - 1) * perPage,
  };
};

export { buildMenuQuery, getMenuSort, getPagination, MenuQueryValidationError };
