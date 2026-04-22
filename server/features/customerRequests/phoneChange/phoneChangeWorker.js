const { processAutoValidationRequests } = require('./worker/autoValidation');
const { processOverdueReviewRequests } = require('./worker/overdueReview');

const createPhoneChangeWorker = (deps = {}) => {
  const {
    dbAllAsync,
    dbGetAsync,
    parsePhoneInput,
    approvePhoneChangeRequest,
    rejectPhoneChangeRequest,
    movePhoneChangeRequestToAdminReview,
    notifyPhoneChangeAdminReview,
    notifyPhoneChangeApproved,
    notifyPhoneChangeRejected,
    notifyAdminsPhoneChangeReview,
    PHONE_CHANGE_STATUS_PENDING,
    PHONE_CHANGE_DECISION_AUTO,
    PHONE_CHANGE_AUTO_BATCH_SIZE,
    PHONE_CHANGE_PROCESS_INTERVAL_MS,
    PHONE_CHANGE_EXPIRED_REASON,
    IS_VERCEL_RUNTIME,
  } = deps;

  let phoneChangeWorkerTimer = null;
  let phoneChangeWorkerRunning = false;

  const processPendingPhoneChangeRequests = async ({
    limit = PHONE_CHANGE_AUTO_BATCH_SIZE,
  } = {}) => {
    if (phoneChangeWorkerRunning) return null;
    phoneChangeWorkerRunning = true;
    try {
      const autoStats = await processAutoValidationRequests({
        dbAllAsync,
        dbGetAsync,
        parsePhoneInput,
        approvePhoneChangeRequest,
        rejectPhoneChangeRequest,
        movePhoneChangeRequestToAdminReview,
        notifyPhoneChangeAdminReview,
        notifyPhoneChangeApproved,
        notifyPhoneChangeRejected,
        notifyAdminsPhoneChangeReview,
        PHONE_CHANGE_STATUS_PENDING,
        PHONE_CHANGE_DECISION_AUTO,
        PHONE_CHANGE_AUTO_BATCH_SIZE: limit,
      });
      const overdueStats = await processOverdueReviewRequests({
        dbAllAsync,
        rejectPhoneChangeRequest,
        notifyPhoneChangeRejected,
        PHONE_CHANGE_STATUS_PENDING,
        PHONE_CHANGE_EXPIRED_REASON,
        PHONE_CHANGE_AUTO_BATCH_SIZE: limit,
      });
      return {
        auto_approved: autoStats.auto_approved,
        escalated_admin_review: autoStats.escalated_admin_review,
        auto_rejected_invalid: autoStats.auto_rejected_invalid,
        auto_rejected_missing_user: autoStats.auto_rejected_missing_user,
        expired_rejected: overdueStats.expired_rejected,
        scanned_auto_candidates: autoStats.scanned_auto_candidates,
        scanned_overdue_candidates: overdueStats.scanned_overdue_candidates,
      };
    } finally {
      phoneChangeWorkerRunning = false;
    }
  };

  const startPhoneChangeWorker = () => {
    if (IS_VERCEL_RUNTIME) return;
    if (phoneChangeWorkerTimer) return;
    phoneChangeWorkerTimer = setInterval(() => {
      void processPendingPhoneChangeRequests().catch((error) => {
        console.warn('[PHONE_CHANGE] Background worker failed:', error?.message || error);
      });
    }, PHONE_CHANGE_PROCESS_INTERVAL_MS);
    void processPendingPhoneChangeRequests().catch(() => {});
  };

  const stopPhoneChangeWorker = () => {
    if (!phoneChangeWorkerTimer) return;
    clearInterval(phoneChangeWorkerTimer);
    phoneChangeWorkerTimer = null;
  };

  return {
    processPendingPhoneChangeRequests,
    startPhoneChangeWorker,
    stopPhoneChangeWorker,
  };
};

module.exports = { createPhoneChangeWorker };
