const createScheduleUtils = ({ normalizeWeekdayLabel }) => {
  const getDistributorOrderScheduleDay = (distributor = {}) => (
    normalizeWeekdayLabel(distributor.order_day || distributor.visit_day || distributor.delivery_day)
  );

  return { getDistributorOrderScheduleDay };
};

module.exports = { createScheduleUtils };
