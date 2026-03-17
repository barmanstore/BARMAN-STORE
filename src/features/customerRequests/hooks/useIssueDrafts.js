import { useState, useCallback } from 'react';

const buildIssueDraft = (issue, current) => ({
  admin_reason: current.admin_reason ?? issue.admin_reason ?? issue.resolution_note ?? '',
  correction_type: current.correction_type ?? '',
  correction_amount: current.correction_amount ?? '',
  correction_description: current.correction_description ?? '',
  correction_reference: current.correction_reference ?? ''
});

const useIssueDrafts = () => {
  const [issueDrafts, setIssueDrafts] = useState({});

  const setIssueDraft = useCallback((id, patch) => {
    setIssueDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        ...patch
      }
    }));
  }, []);

  const getIssueDraft = useCallback((issue) => {
    const current = issueDrafts[issue.id] || {};
    return buildIssueDraft(issue, current);
  }, [issueDrafts]);

  return { setIssueDraft, getIssueDraft };
};

export default useIssueDrafts;
