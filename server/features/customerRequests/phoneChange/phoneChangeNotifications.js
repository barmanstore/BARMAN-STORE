const createPhoneChangeNotifications = (deps = {}) => {
  const {
    createAppNotification,
    notifyAdmins,
    PHONE_CHANGE_STATUS_PENDING,
    PHONE_CHANGE_STATUS_APPROVED,
    PHONE_CHANGE_STATUS_REJECTED,
  } = deps;

  const notifyPhoneChangeSubmitted = async ({ userId }) => {
    await createAppNotification({
      userId,
      title: 'Phone update request received',
      message: 'Phone update is pending. You will be notified once it is updated.',
      level: 'info',
      entityType: 'phone_change_request',
      metadata: {
        route: '/profile',
        status: PHONE_CHANGE_STATUS_PENDING,
      },
      createdBy: Number(userId || 0) || null,
    });
  };

  const notifyPhoneChangeAdminReview = async ({ userId, requestId }) => {
    await createAppNotification({
      userId,
      title: 'Phone update under admin review',
      message: 'Phone update is pending. You will be notified once it is updated.',
      level: 'warning',
      entityType: 'phone_change_request',
      entityId: requestId,
      metadata: {
        route: '/profile',
        status: PHONE_CHANGE_STATUS_PENDING,
        needs_admin_review: true,
      },
      createdBy: null,
    });
  };

  const notifyPhoneChangeApproved = async ({ userId, requestId, newPhone, decisionSource }) => {
    await createAppNotification({
      userId,
      title: 'Phone update approved',
      message: `Your phone number has been updated to ${newPhone}.`,
      level: 'success',
      entityType: 'phone_change_request',
      entityId: requestId,
      metadata: {
        route: '/profile',
        status: PHONE_CHANGE_STATUS_APPROVED,
        decision_source: decisionSource,
      },
      createdBy: null,
    });
  };

  const notifyPhoneChangeRejected = async ({ userId, requestId, reason }) => {
    await createAppNotification({
      userId,
      title: 'Phone update rejected',
      message: reason
        ? `Your phone update request was rejected: ${reason}`
        : 'Your phone update request was rejected. Please contact support.',
      level: 'error',
      entityType: 'phone_change_request',
      entityId: requestId,
      metadata: {
        route: '/profile',
        status: PHONE_CHANGE_STATUS_REJECTED,
      },
      createdBy: null,
    });
  };

  const notifyAdminsPhoneChangeReview = async ({ requestId, userName, newPhone }) => {
    await notifyAdmins({
      title: 'Phone update needs review',
      message: `${userName || 'Customer'} requested phone ${newPhone}. Review pending request #${requestId}.`,
      level: 'warning',
      entityType: 'phone_change_request',
      entityId: requestId,
      metadata: {
        route: '/admin?tab=customer-requests',
        request_id: requestId,
      },
      createdBy: null,
    });
  };

  return {
    notifyPhoneChangeSubmitted,
    notifyPhoneChangeAdminReview,
    notifyPhoneChangeApproved,
    notifyPhoneChangeRejected,
    notifyAdminsPhoneChangeReview,
  };
};

module.exports = { createPhoneChangeNotifications };
