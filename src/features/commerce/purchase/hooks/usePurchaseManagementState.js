import { useRef, useState } from 'react';

const usePurchaseManagementState = ({
  initialActiveSubTab = 'dashboard',
  getDefaultOrderFormData,
  getDefaultProcessFormData,
  getDefaultPoPaymentFormData,
  getDefaultLedgerFormData,
  getDefaultPoCorrectionFormData,
  createDefaultOperationsSummary,
  createClientRequestId,
}) => {
  const [activeSubTab, setActiveSubTab] = useState(initialActiveSubTab);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [purchaseReturns, setPurchaseReturns] = useState([]);
  const [distributors, setDistributors] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderFormClientRequestId, setOrderFormClientRequestId] = useState(() => createClientRequestId('po'));
  const orderSubmitLockRef = useRef(false);
  const [filters, setFilters] = useState({
    distributor_id: '',
    status: '',
    payment_status: '',
    start_date: '',
    end_date: '',
  });
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [showPoProductForm, setShowPoProductForm] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [receiveSubmitting, setReceiveSubmitting] = useState(false);
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [showLedgerForm, setShowLedgerForm] = useState(false);
  const [ledgerSubmitting, setLedgerSubmitting] = useState(false);
  const [showPoCorrectionForm, setShowPoCorrectionForm] = useState(false);
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [processSubmitting, setProcessSubmitting] = useState(false);
  const [sendingWhatsAppOrderId, setSendingWhatsAppOrderId] = useState(null);
  const [processingOrder, setProcessingOrder] = useState(null);
  const [processFormData, setProcessFormData] = useState(getDefaultProcessFormData());
  const [showPoPaymentModal, setShowPoPaymentModal] = useState(false);
  const [poPaymentSubmitting, setPoPaymentSubmitting] = useState(false);
  const poPaymentLockRef = useRef(false);
  const poPaymentClientRequestIdRef = useRef('');
  const ledgerSubmitLockRef = useRef(false);
  const returnSubmitLockRef = useRef(false);
  const poCorrectionLockRef = useRef(false);
  const processSubmitLockRef = useRef(false);
  const receiveSubmitLockRef = useRef(false);
  const [paymentOrder, setPaymentOrder] = useState(null);
  const [poPaymentFormData, setPoPaymentFormData] = useState(getDefaultPoPaymentFormData());
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedCorrectionOrder, setSelectedCorrectionOrder] = useState(null);
  const [ledgerRecords, setLedgerRecords] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [operationsLoading, setOperationsLoading] = useState(false);
  const [rollupParams, setRollupParams] = useState({
    mode: '30',
    days: 30,
    start_date: '',
    end_date: '',
  });
  const [operationsSummary, setOperationsSummary] = useState(() => createDefaultOperationsSummary());
  const [ledgerFormData, setLedgerFormData] = useState(getDefaultLedgerFormData());
  const [poCorrectionFormData, setPoCorrectionFormData] = useState(getDefaultPoCorrectionFormData());
  const [poCorrectionContext, setPoCorrectionContext] = useState({
    expectedAmount: 0,
    currentImpact: 0,
    delta: 0,
    linkedEntries: 0,
  });
  const [poCorrectionSubmitting, setPoCorrectionSubmitting] = useState(false);
  const [showOrderDetail, setShowOrderDetail] = useState(false);
  const [orderDetail, setOrderDetail] = useState(null);
  const [orderDetailLoading, setOrderDetailLoading] = useState(false);
  const [orderDetailEditMode, setOrderDetailEditMode] = useState(false);
  const [orderDetailSaving, setOrderDetailSaving] = useState(false);
  const [orderDetailDraft, setOrderDetailDraft] = useState(null);
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [orderFullMode, setOrderFullMode] = useState(false);
  const [loadingDistributorItems, setLoadingDistributorItems] = useState(false);
  const [activePoProductField, setActivePoProductField] = useState({ mode: 'entry', index: null });
  const [poProductFormTarget, setPoProductFormTarget] = useState(null);
  const [orderFormData, setOrderFormData] = useState(getDefaultOrderFormData());
  const [receiveData, setReceiveData] = useState({
    invoice_number: '',
    items: [],
  });
  const [returnFormData, setReturnFormData] = useState({
    distributor_id: '',
    reference_po: '',
    return_type: 'return',
    reason: '',
    items: [],
  });

  return {
    activeSubTab,
    setActiveSubTab,
    purchaseOrders,
    setPurchaseOrders,
    purchaseReturns,
    setPurchaseReturns,
    distributors,
    setDistributors,
    products,
    setProducts,
    loading,
    setLoading,
    error,
    setError,
    success,
    setSuccess,
    orderSubmitting,
    setOrderSubmitting,
    orderFormClientRequestId,
    setOrderFormClientRequestId,
    orderSubmitLockRef,
    filters,
    setFilters,
    showOrderForm,
    setShowOrderForm,
    showPoProductForm,
    setShowPoProductForm,
    showReceiveModal,
    setShowReceiveModal,
    receiveSubmitting,
    setReceiveSubmitting,
    showReturnForm,
    setShowReturnForm,
    returnSubmitting,
    setReturnSubmitting,
    showLedgerForm,
    setShowLedgerForm,
    ledgerSubmitting,
    setLedgerSubmitting,
    showPoCorrectionForm,
    setShowPoCorrectionForm,
    showProcessModal,
    setShowProcessModal,
    processSubmitting,
    setProcessSubmitting,
    sendingWhatsAppOrderId,
    setSendingWhatsAppOrderId,
    processingOrder,
    setProcessingOrder,
    processFormData,
    setProcessFormData,
    showPoPaymentModal,
    setShowPoPaymentModal,
    poPaymentSubmitting,
    setPoPaymentSubmitting,
    poPaymentLockRef,
    poPaymentClientRequestIdRef,
    ledgerSubmitLockRef,
    returnSubmitLockRef,
    poCorrectionLockRef,
    processSubmitLockRef,
    receiveSubmitLockRef,
    paymentOrder,
    setPaymentOrder,
    poPaymentFormData,
    setPoPaymentFormData,
    selectedOrder,
    setSelectedOrder,
    selectedCorrectionOrder,
    setSelectedCorrectionOrder,
    ledgerRecords,
    setLedgerRecords,
    ledgerLoading,
    setLedgerLoading,
    operationsLoading,
    setOperationsLoading,
    rollupParams,
    setRollupParams,
    operationsSummary,
    setOperationsSummary,
    ledgerFormData,
    setLedgerFormData,
    poCorrectionFormData,
    setPoCorrectionFormData,
    poCorrectionContext,
    setPoCorrectionContext,
    poCorrectionSubmitting,
    setPoCorrectionSubmitting,
    showOrderDetail,
    setShowOrderDetail,
    orderDetail,
    setOrderDetail,
    orderDetailLoading,
    setOrderDetailLoading,
    orderDetailEditMode,
    setOrderDetailEditMode,
    orderDetailSaving,
    setOrderDetailSaving,
    orderDetailDraft,
    setOrderDetailDraft,
    editingOrderId,
    setEditingOrderId,
    orderFullMode,
    setOrderFullMode,
    loadingDistributorItems,
    setLoadingDistributorItems,
    activePoProductField,
    setActivePoProductField,
    poProductFormTarget,
    setPoProductFormTarget,
    orderFormData,
    setOrderFormData,
    receiveData,
    setReceiveData,
    returnFormData,
    setReturnFormData,
  };
};

export default usePurchaseManagementState;
