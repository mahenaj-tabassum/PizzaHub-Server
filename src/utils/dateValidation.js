/**
 * Validate YYYY-MM-DD format.
 * Reject impossible dates such as 2026-02-31.
 */
export const isValidDeliveryDate = (value) => {
  if (typeof value !== "string") {
    return false;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
};
