import useIsMobile from '../hooks/useIsMobile';
import MobileBottomSheet from './mobile/MobileBottomSheet';
import WindowModal from './window/WindowModal';
import './AppModal.css';

function AppModal({
  open,
  title,
  onClose,
  children,
  dialogClassName = '',
  contentClassName = '',
  dismissible = true,
  closeOnBackdrop = true,
  closeOnEscape = true,
  initialSize = { width: 720, height: 480 },
}) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <MobileBottomSheet
        open={open}
        title={title}
        onClose={onClose}
        dismissible={dismissible}
        closeOnBackdrop={closeOnBackdrop}
        closeOnEscape={closeOnEscape}
        className={dialogClassName}
      >
        <div className={`app-modal-content ${contentClassName}`.trim()}>{children}</div>
      </MobileBottomSheet>
    );
  }

  return (
    <WindowModal
      open={open}
      title={title}
      onClose={onClose}
      dismissible={dismissible}
      closeOnBackdrop={closeOnBackdrop}
      closeOnEscape={closeOnEscape}
      dialogClassName={`app-modal-dialog ${dialogClassName}`.trim()}
      headerClassName="app-modal-header"
      contentClassName={`app-modal-content ${contentClassName}`.trim()}
      closeButtonClassName="app-modal-close-btn"
      initialSize={initialSize}
    >
      {children}
    </WindowModal>
  );
}

export default AppModal;
