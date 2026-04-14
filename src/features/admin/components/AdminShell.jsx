import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, X, Menu, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAdminShellContext } from '../context/AdminPageContext';

const AdminNavItems = ({ items, activeTab, handleTabChange }) => (
  <>
    {items.map((item) => {
      const ItemIcon = item.icon;
      const isActiveItem = activeTab === item.tab;
      const itemClassName = `panel-item ${isActiveItem ? 'active' : ''} ${item.sub ? 'sub-item' : ''}`;
      return (
        <button
          key={item.tab}
          type="button"
          className={itemClassName}
          aria-current={isActiveItem ? 'page' : undefined}
          onClick={() => handleTabChange(item.tab)}
        >
          <ItemIcon size={item.sub ? 16 : 18} />
          <span>{item.label}</span>
        </button>
      );
    })}
  </>
);

const AdminShell = ({ children }) => {
  const {
    notification,
    closeNotification,
    isMobileSidebarOpen,
    setIsMobileSidebarOpen,
    desktopPanelCollapsed,
    setDesktopPanelCollapsed,
    SIDEBAR_SECTIONS,
    desktopActiveGroup,
    handleDesktopGroupSelect,
    desktopCurrentSection,
    activeTab,
    handleTabChange,
    mobileSidebarSections,
    expandedGroups,
    toggleSidebarGroup,
  } = useAdminShellContext();
  const desktopSidebarRef = useRef(null);

  useEffect(() => {
    if (desktopPanelCollapsed) return undefined;

    const handlePointerDown = (event) => {
      if (desktopSidebarRef.current?.contains(event.target)) return;
      setDesktopPanelCollapsed(true);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [desktopPanelCollapsed, setDesktopPanelCollapsed]);

  return (
    <div className="admin-page admin-shell">
      {notification && (
        <div className={`notification ${notification.type}`}>
          <span>{notification.message}</span>
          <button onClick={closeNotification}><X size={16} /></button>
        </div>
      )}

      <div className="admin-mobile-topbar">
        <button
          type="button"
          className="admin-mobile-menu-btn"
          onClick={() => setIsMobileSidebarOpen((prev) => !prev)}
          aria-label="Toggle admin menu"
        >
          {isMobileSidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <h2>Admin Panel</h2>
      </div>

      <div className="admin-shell-body">
        <aside
          ref={desktopSidebarRef}
          className={`admin-sidebar-shell ${desktopPanelCollapsed ? 'panel-collapsed' : ''}`}
          aria-label="Admin desktop navigation"
          onPointerEnter={() => setDesktopPanelCollapsed(false)}
          onPointerLeave={() => setDesktopPanelCollapsed(true)}
        >
          <div className="admin-sidebar-rail">
            <div className="admin-sidebar-rail-top">
              <button
                type="button"
                className="rail-item rail-collapse-toggle"
                onClick={() => setDesktopPanelCollapsed((prev) => !prev)}
                aria-label={desktopPanelCollapsed ? 'Expand sidebar panel' : 'Collapse sidebar panel'}
                title={desktopPanelCollapsed ? 'Expand panel' : 'Collapse panel'}
              >
                {desktopPanelCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
              </button>
              {SIDEBAR_SECTIONS.map((section) => {
                const SectionIcon = section.icon;
                const isSectionActive = section.key === desktopActiveGroup;
                return (
                  <button
                    key={section.key}
                    type="button"
                    className={`rail-item ${isSectionActive ? 'active' : ''}`}
                    onClick={() => handleDesktopGroupSelect(section.key)}
                    aria-label={section.label}
                    title={section.label}
                  >
                    <SectionIcon size={18} />
                  </button>
                );
              })}
            </div>
            <div className="admin-sidebar-rail-bottom">
              <Link to="/" className="rail-item rail-home-link" aria-label="Back to Store" title="Back to Store">
                <ArrowLeft size={18} />
              </Link>
            </div>
          </div>
          <div className="admin-sidebar-panel" aria-hidden={desktopPanelCollapsed}>
            <div className="sidebar-panel-header">
              <h2>{desktopCurrentSection.label}</h2>
            </div>
            <nav className="sidebar-panel-nav">
              <AdminNavItems
                items={desktopCurrentSection.items}
                activeTab={activeTab}
                handleTabChange={handleTabChange}
              />
            </nav>
          </div>
        </aside>

        {isMobileSidebarOpen && (
          <button
            type="button"
            className="admin-sidebar-overlay"
            aria-label="Close admin menu"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
        )}

        <div className={`admin-sidebar ${isMobileSidebarOpen ? 'open' : ''}`}>
          <h2>Admin Panel</h2>
          <nav>
            {mobileSidebarSections.map((section) => {
              const SectionIcon = section.icon;
              const isExpanded = Boolean(expandedGroups[section.key]);
              return (
                <div className="sidebar-group" key={section.key}>
                  <button
                    type="button"
                    className={`sidebar-group-toggle ${isExpanded ? 'expanded' : ''}`}
                    data-label={section.label}
                    onClick={() => toggleSidebarGroup(section.key)}
                  >
                    <SectionIcon size={20} />
                  </button>
                  {isExpanded ? (
                    <div className="sidebar-group-items">
                      <AdminNavItems
                        items={section.items}
                        activeTab={activeTab}
                        handleTabChange={handleTabChange}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}

            <Link to="/" className="logout-link" aria-label="Back to Store" title="Back to Store">
              <ArrowLeft size={18} />
              <span>Back to Store</span>
            </Link>
          </nav>
        </div>

        <div className="admin-shell-main">
          <div className="admin-content">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminShell;
