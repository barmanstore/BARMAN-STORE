const { createPhoneMergeImpactSummary } = require('./approvals/mergeImpact');
const { createPhoneMergeRecords } = require('./approvals/mergeRecords');
const { createPhoneChangeApprove } = require('./approvals/approveRequest');
const { createPhoneChangeReject } = require('./approvals/rejectRequest');
const { createPhoneChangeAdminReview } = require('./approvals/adminReview');

const createPhoneChangeApprovals = (deps = {}) => {
  const mergeSummary = createPhoneMergeImpactSummary(deps);
  const mergeRecords = createPhoneMergeRecords(deps);
  const approve = createPhoneChangeApprove({
    ...deps,
    getPhoneMergeImpactSummary: mergeSummary.getPhoneMergeImpactSummary,
    movePhoneLinkedIdentityRecords: mergeRecords.movePhoneLinkedIdentityRecords,
  });
  const reject = createPhoneChangeReject(deps);
  const adminReview = createPhoneChangeAdminReview(deps);

  return {
    getPhoneMergeImpactSummary: mergeSummary.getPhoneMergeImpactSummary,
    approvePhoneChangeRequest: approve.approvePhoneChangeRequest,
    rejectPhoneChangeRequest: reject.rejectPhoneChangeRequest,
    movePhoneChangeRequestToAdminReview: adminReview.movePhoneChangeRequestToAdminReview,
  };
};

module.exports = { createPhoneChangeApprovals };
