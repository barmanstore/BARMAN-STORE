const { createPhoneChangeQueue } = require('./phoneChange/phoneChangeQueue');
const { createPhoneChangeApprovals } = require('./phoneChange/phoneChangeApprovals');
const { createPhoneChangeNotifications } = require('./phoneChange/phoneChangeNotifications');
const { createPhoneChangeWorker } = require('./phoneChange/phoneChangeWorker');

const createPhoneChangeService = (deps = {}) => {
  const queue = createPhoneChangeQueue(deps);
  const approvals = createPhoneChangeApprovals({
    ...deps,
    normalizePhoneChangeRequestStatus: queue.normalizePhoneChangeRequestStatus,
  });
  const notifications = createPhoneChangeNotifications(deps);
  const worker = createPhoneChangeWorker({
    ...deps,
    approvePhoneChangeRequest: approvals.approvePhoneChangeRequest,
    rejectPhoneChangeRequest: approvals.rejectPhoneChangeRequest,
    movePhoneChangeRequestToAdminReview: approvals.movePhoneChangeRequestToAdminReview,
    notifyPhoneChangeAdminReview: notifications.notifyPhoneChangeAdminReview,
    notifyPhoneChangeApproved: notifications.notifyPhoneChangeApproved,
    notifyPhoneChangeRejected: notifications.notifyPhoneChangeRejected,
    notifyAdminsPhoneChangeReview: notifications.notifyAdminsPhoneChangeReview,
  });

  return {
    ...queue,
    ...approvals,
    ...notifications,
    ...worker,
  };
};

module.exports = { createPhoneChangeService };
