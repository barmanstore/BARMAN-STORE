import PurchaseModals from './PurchaseModals';
import {
  PurchaseDashboardSection,
  PurchaseOrdersSection,
  PurchasePaymentsSection,
  PurchaseRemindersSection,
  PurchaseReturnsSection,
  PurchaseSectionTabs,
} from './sections';

const PurchaseManagementPageLayout = ({
  loading,
  error,
  success,
  activeSubTab,
  handlePurchaseSectionChange,
  operationsSummary,
  purchaseReturns,
  operationsLoading,
  operationsCardItems,
  rollupParams,
  setRollupParams,
  openCreateOrderFormForDistributor,
  handleViewOrder,
  handleOpenPoPaymentById,
  openCreateOrderForm,
  handleOpenLedgerForm,
  handleReturnFormOpen,
  formatCurrency,
  toNumber,
  filters,
  distributors,
  handleFilterChange,
  purchaseOrders,
  isPoEditable,
  canAddPaymentToPo,
  canReceivePo,
  canClosePo,
  getPoPaymentStatus,
  handleOpenProcessModal,
  handleSendDistributorWhatsApp,
  sendingWhatsAppOrderId,
  handleReceiveClick,
  handleOpenPoPaymentModal,
  handleOpenPoCorrectionForm,
  poCorrectionSubmitting,
  handleUpdateStatus,
  handleDeleteOrder,
  getOrderDisplayTotal,
  getStatusBadgeForOrder,
  getPoPaymentBadgeForOrder,
  getPoBalanceDue,
  getPoNextAction,
  ledgerBalanceSummary,
  ledgerLoading,
  ledgerRecords,
  getLedgerRowStatusClassForEntry,
  getDistributorName,
  getLedgerTypeLabel,
  getEntryDisplayBalance,
  getLedgerBillNumber,
  showOrderForm,
  closeOrderForm,
  poModalRef,
  isMobile,
  poModalSize,
  editingOrderId,
  handleOrderSubmit,
  orderFullMode,
  setOrderFullMode,
  loadingDistributorItems,
  handleLoadDistributorItems,
  orderFormData,
  setOrderFormData,
  orderDraftProjection,
  handleDistributorInputChange,
  orderProductOptions,
  products,
  findProductForItem,
  getAllowedPurchaseUnitsForProduct,
  getPurchasePackStep,
  handleOrderProductInputChange,
  handleOrderProductFieldFocus,
  handleOrderItemChange,
  GST_RATE_OPTIONS,
  handleOrderItemRemove,
  handleOrderItemAdd,
  handleOpenPoProductForm,
  handleInlinePoProductCreate,
  orderTotals,
  getProductSearchOptionLabel,
  orderSubmitting,
  showPoProductForm,
  poProductFormTarget,
  closePoProductForm,
  handlePoProductSave,
  showReceiveModal,
  selectedOrder,
  setShowReceiveModal,
  receiveSubmitting,
  handleReceiveSubmit,
  receiveData,
  setReceiveData,
  handleReceiveQtyStep,
  handleReceiveItemChange,
  getProductUomProfile,
  resolvePurchaseUnitForProduct,
  toBaseQtyForProduct,
  showOrderDetail,
  closeOrderDetail,
  orderDetail,
  orderDetailLoading,
  orderDetailSupplier,
  orderDetailEditMode,
  orderDetailDraft,
  handleOrderDetailFieldChange,
  formatDateTime,
  formatDate,
  getPoLifecycleStatus,
  getPoPaidAmount,
  orderDetailItems,
  getItemFinancials,
  getOrderDetailOriginalItem,
  hasOrderDetailItemChanged,
  getOrderDetailItemFieldChanged,
  handleOrderDetailProductInputChange,
  getProductSearchLabel,
  getOrderDetailItemOriginalLabel,
  handleOrderDetailItemChange,
  handleOrderDetailItemRemove,
  handleOrderDetailItemAdd,
  orderDetailHasComputedChanges,
  orderDetailComputedTotals,
  orderDetailDraftDiagnostics,
  orderDetailIsEditable,
  orderDetailSaving,
  handleOrderDetailSave,
  openOrderDetailEditMode,
  handlePrintOrderDetail,
  showProcessModal,
  processingOrder,
  closeProcessModal,
  handleProcessSubmit,
  processSubmitting,
  processFormData,
  setProcessFormData,
  showPoPaymentModal,
  paymentOrder,
  closePoPaymentModal,
  handlePoPaymentSubmit,
  poPaymentSubmitting,
  poPaymentFormData,
  setPoPaymentFormData,
  showLedgerForm,
  closeLedgerForm,
  ledgerSubmitting,
  handleLedgerSubmit,
  ledgerFormData,
  setLedgerFormData,
  showPoCorrectionForm,
  selectedCorrectionOrder,
  closePoCorrectionForm,
  handlePoCorrectionSubmit,
  poCorrectionFormData,
  setPoCorrectionFormData,
  poCorrectionContext,
  showReturnForm,
  closeReturnForm,
  returnSubmitting,
  handleReturnSubmit,
  returnFormData,
  setReturnFormData,
  handleReturnItemAdd,
  handleReturnItemChange,
  handleReturnItemRemove,
  showSectionTabs,
  popupMode,
}) => {
  if (loading) {
    return (
      <div className="purchase-management">
        <div className="purchase-loading-shell" role="status" aria-live="polite">
          <div className="purchase-loading-shell__hero">
            <span className="purchase-loading-shell__kicker">Purchase Workspace</span>
            <h2>Loading purchase data...</h2>
            <p>Preparing suppliers, products, and purchase records for the next action.</p>
          </div>
          <div className="purchase-loading-shell__grid" aria-hidden="true">
            <div className="purchase-loading-card purchase-loading-card--wide">
              <span className="purchase-loading-line purchase-loading-line--title" />
              <span className="purchase-loading-line" />
              <span className="purchase-loading-line purchase-loading-line--short" />
            </div>
            <div className="purchase-loading-card">
              <span className="purchase-loading-line purchase-loading-line--title" />
              <span className="purchase-loading-line purchase-loading-line--short" />
            </div>
            <div className="purchase-loading-card purchase-loading-card--wide">
              <span className="purchase-loading-line purchase-loading-line--title" />
              <span className="purchase-loading-line" />
              <span className="purchase-loading-line" />
              <span className="purchase-loading-line purchase-loading-line--short" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`purchase-management${popupMode ? ' purchase-management-popup-entry' : ''}`}>
      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {showSectionTabs && !popupMode ? (
        <PurchaseSectionTabs
          activeTab={activeSubTab}
          onChange={handlePurchaseSectionChange}
          counts={{
            reminders: operationsSummary?.reminders?.length || 0,
            returns: purchaseReturns?.length || 0,
          }}
        />
      ) : null}

      {!popupMode && activeSubTab === 'dashboard' ? (
        <PurchaseDashboardSection
          operationsLoading={operationsLoading}
          operationsCardItems={operationsCardItems}
          operationsSummary={operationsSummary}
          rollupParams={rollupParams}
          setRollupParams={setRollupParams}
          onDraftDistributor={openCreateOrderFormForDistributor}
          onOpenOrder={handleViewOrder}
          onOpenPayable={handleOpenPoPaymentById}
          onNewOrder={openCreateOrderForm}
          onOpenLedgerForm={handleOpenLedgerForm}
          onOpenReturn={handleReturnFormOpen}
          formatCurrency={formatCurrency}
          toNumber={toNumber}
        />
      ) : null}

      {!popupMode && activeSubTab === 'orders' ? (
        <PurchaseOrdersSection
          filters={filters}
          distributors={distributors}
          onFilterChange={handleFilterChange}
          onOpenLedgerForm={handleOpenLedgerForm}
          onOpenReturn={handleReturnFormOpen}
          onNewOrder={openCreateOrderForm}
          purchaseOrders={purchaseOrders}
          isPoEditable={isPoEditable}
          canAddPaymentToPo={canAddPaymentToPo}
          canReceivePo={canReceivePo}
          canClosePo={canClosePo}
          getPoPaymentStatus={getPoPaymentStatus}
          handleViewOrder={handleViewOrder}
          handleOpenProcessModal={handleOpenProcessModal}
          handleSendDistributorWhatsApp={handleSendDistributorWhatsApp}
          sendingWhatsAppOrderId={sendingWhatsAppOrderId}
          handleReceiveClick={handleReceiveClick}
          handleOpenPoPaymentModal={handleOpenPoPaymentModal}
          handleOpenPoCorrectionForm={handleOpenPoCorrectionForm}
          poCorrectionSubmitting={poCorrectionSubmitting}
          handleUpdateStatus={handleUpdateStatus}
          handleDeleteOrder={handleDeleteOrder}
          getOrderDisplayTotal={getOrderDisplayTotal}
          getStatusBadge={getStatusBadgeForOrder}
          getPoPaymentBadge={getPoPaymentBadgeForOrder}
          getPoBalanceDue={getPoBalanceDue}
          getPoNextAction={getPoNextAction}
          formatCurrency={formatCurrency}
        />
      ) : null}

      {!popupMode && activeSubTab === 'payments' ? (
        <PurchasePaymentsSection
          filters={filters}
          distributors={distributors}
          onFilterChange={handleFilterChange}
          onOpenLedgerForm={handleOpenLedgerForm}
          ledgerBalanceSummary={ledgerBalanceSummary}
          payables={operationsSummary.payables || []}
          onOpenPayable={handleOpenPoPaymentById}
          ledgerLoading={ledgerLoading}
          ledgerRecords={ledgerRecords}
          getLedgerRowStatusClass={getLedgerRowStatusClassForEntry}
          getDistributorName={getDistributorName}
          getLedgerTypeLabel={getLedgerTypeLabel}
          formatCurrency={formatCurrency}
          toNumber={toNumber}
          getEntryDisplayBalance={getEntryDisplayBalance}
          getLedgerBillNumber={getLedgerBillNumber}
        />
      ) : null}

      {!popupMode && activeSubTab === 'reminders' ? (
        <PurchaseRemindersSection
          operationsLoading={operationsLoading}
          operationsSummary={operationsSummary}
          onDraftDistributor={openCreateOrderFormForDistributor}
          onOpenOrder={handleViewOrder}
          formatCurrency={formatCurrency}
          toNumber={toNumber}
        />
      ) : null}

      {!popupMode && activeSubTab === 'returns' ? (
        <PurchaseReturnsSection
          filters={filters}
          distributors={distributors}
          onFilterChange={handleFilterChange}
          onOpenReturn={handleReturnFormOpen}
          purchaseReturns={purchaseReturns}
          formatCurrency={formatCurrency}
        />
      ) : null}

      <PurchaseModals
        showOrderForm={showOrderForm}
        closeOrderForm={closeOrderForm}
        poModalRef={poModalRef}
        isMobile={isMobile}
        poModalSize={poModalSize}
        editingOrderId={editingOrderId}
        handleOrderSubmit={handleOrderSubmit}
        orderFullMode={orderFullMode}
        setOrderFullMode={setOrderFullMode}
        loadingDistributorItems={loadingDistributorItems}
        handleLoadDistributorItems={handleLoadDistributorItems}
        orderFormData={orderFormData}
        setOrderFormData={setOrderFormData}
        orderDraftProjection={orderDraftProjection}
        handleDistributorInputChange={handleDistributorInputChange}
        distributors={distributors}
        orderProductOptions={orderProductOptions}
        products={products}
        findProductForItem={findProductForItem}
        getAllowedPurchaseUnitsForProduct={getAllowedPurchaseUnitsForProduct}
        getPurchasePackStep={getPurchasePackStep}
        handleOrderProductInputChange={handleOrderProductInputChange}
        handleOrderProductFieldFocus={handleOrderProductFieldFocus}
        handleOrderItemChange={handleOrderItemChange}
        GST_RATE_OPTIONS={GST_RATE_OPTIONS}
        toNumber={toNumber}
        handleOrderItemRemove={handleOrderItemRemove}
        handleOrderItemAdd={handleOrderItemAdd}
        handleOpenPoProductForm={handleOpenPoProductForm}
        handleInlinePoProductCreate={handleInlinePoProductCreate}
        orderTotals={orderTotals}
        getProductSearchOptionLabel={getProductSearchOptionLabel}
        orderSubmitting={orderSubmitting}
        showPoProductForm={showPoProductForm}
        poProductFormTarget={poProductFormTarget}
        closePoProductForm={closePoProductForm}
        handlePoProductSave={handlePoProductSave}
        showReceiveModal={showReceiveModal}
        selectedOrder={selectedOrder}
        setShowReceiveModal={setShowReceiveModal}
        receiveSubmitting={receiveSubmitting}
        handleReceiveSubmit={handleReceiveSubmit}
        receiveData={receiveData}
        setReceiveData={setReceiveData}
        handleReceiveQtyStep={handleReceiveQtyStep}
        handleReceiveItemChange={handleReceiveItemChange}
        formatCurrency={formatCurrency}
        getProductUomProfile={getProductUomProfile}
        resolvePurchaseUnitForProduct={resolvePurchaseUnitForProduct}
        toBaseQtyForProduct={toBaseQtyForProduct}
        showOrderDetail={showOrderDetail}
        closeOrderDetail={closeOrderDetail}
        orderDetail={orderDetail}
        orderDetailLoading={orderDetailLoading}
        orderDetailSupplier={orderDetailSupplier}
        orderDetailEditMode={orderDetailEditMode}
        orderDetailDraft={orderDetailDraft}
        handleOrderDetailFieldChange={handleOrderDetailFieldChange}
        formatDateTime={formatDateTime}
        formatDate={formatDate}
        getPoLifecycleStatus={getPoLifecycleStatus}
        getPoPaymentStatus={getPoPaymentStatus}
        getPoPaidAmount={getPoPaidAmount}
        getPoBalanceDue={getPoBalanceDue}
        getPoNextAction={getPoNextAction}
        orderDetailItems={orderDetailItems}
        getItemFinancials={getItemFinancials}
        getOrderDetailOriginalItem={getOrderDetailOriginalItem}
        hasOrderDetailItemChanged={hasOrderDetailItemChanged}
        getOrderDetailItemFieldChanged={getOrderDetailItemFieldChanged}
        handleOrderDetailProductInputChange={handleOrderDetailProductInputChange}
        getProductSearchLabel={getProductSearchLabel}
        getOrderDetailItemOriginalLabel={getOrderDetailItemOriginalLabel}
        handleOrderDetailItemChange={handleOrderDetailItemChange}
        handleOrderDetailItemRemove={handleOrderDetailItemRemove}
        handleOrderDetailItemAdd={handleOrderDetailItemAdd}
        orderDetailHasComputedChanges={orderDetailHasComputedChanges}
        orderDetailComputedTotals={orderDetailComputedTotals}
        orderDetailDraftDiagnostics={orderDetailDraftDiagnostics}
        orderDetailIsEditable={orderDetailIsEditable}
        orderDetailSaving={orderDetailSaving}
        handleOrderDetailSave={handleOrderDetailSave}
        openOrderDetailEditMode={openOrderDetailEditMode}
        handlePrintOrderDetail={handlePrintOrderDetail}
        showProcessModal={showProcessModal}
        processingOrder={processingOrder}
        closeProcessModal={closeProcessModal}
        handleProcessSubmit={handleProcessSubmit}
        processSubmitting={processSubmitting}
        processFormData={processFormData}
        setProcessFormData={setProcessFormData}
        getDistributorName={getDistributorName}
        getOrderDisplayTotal={getOrderDisplayTotal}
        showPoPaymentModal={showPoPaymentModal}
        paymentOrder={paymentOrder}
        closePoPaymentModal={closePoPaymentModal}
        handlePoPaymentSubmit={handlePoPaymentSubmit}
        poPaymentSubmitting={poPaymentSubmitting}
        poPaymentFormData={poPaymentFormData}
        setPoPaymentFormData={setPoPaymentFormData}
        showLedgerForm={showLedgerForm}
        closeLedgerForm={closeLedgerForm}
        ledgerSubmitting={ledgerSubmitting}
        handleLedgerSubmit={handleLedgerSubmit}
        ledgerFormData={ledgerFormData}
        setLedgerFormData={setLedgerFormData}
        showPoCorrectionForm={showPoCorrectionForm}
        selectedCorrectionOrder={selectedCorrectionOrder}
        closePoCorrectionForm={closePoCorrectionForm}
        poCorrectionSubmitting={poCorrectionSubmitting}
        handlePoCorrectionSubmit={handlePoCorrectionSubmit}
        poCorrectionFormData={poCorrectionFormData}
        setPoCorrectionFormData={setPoCorrectionFormData}
        poCorrectionContext={poCorrectionContext}
        showReturnForm={showReturnForm}
        closeReturnForm={closeReturnForm}
        returnSubmitting={returnSubmitting}
        handleReturnSubmit={handleReturnSubmit}
        returnFormData={returnFormData}
        setReturnFormData={setReturnFormData}
        handleReturnItemAdd={handleReturnItemAdd}
        handleReturnItemChange={handleReturnItemChange}
        handleReturnItemRemove={handleReturnItemRemove}
        renderOrderFormInline={popupMode}
      />
    </div>
  );
};

export default PurchaseManagementPageLayout;
