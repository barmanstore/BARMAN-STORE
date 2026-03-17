import { Link } from 'react-router-dom';
import { LogOut, X, Menu, ChevronLeft, ChevronRight } from 'lucide-react';

const AdminShell = ({
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
  mainContent,
  modals,
}) => (
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
      <aside className={`admin-sidebar-shell ${desktopPanelCollapsed ? 'panel-collapsed' : ''}`} aria-label="Admin desktop navigation">
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
              <LogOut size={18} />
            </Link>
          </div>
        </div>
        <div className="admin-sidebar-panel" aria-hidden={desktopPanelCollapsed}>
          <div className="sidebar-panel-header">
            <h2>{desktopCurrentSection.label}</h2>
          </div>
          <nav className="sidebar-panel-nav">
            {desktopCurrentSection.items.map((item) => {
              const ItemIcon = item.icon;
              const isActiveItem = activeTab === item.tab;
              return (
                <button
                  key={item.tab}
                  type="button"
                  className={`panel-item ${isActiveItem ? 'active' : ''} ${item.sub ? 'sub-item' : ''}`}
                  aria-current={isActiveItem ? 'page' : undefined}
                  onClick={() => handleTabChange(item.tab)}
                >
                  <ItemIcon size={item.sub ? 16 : 18} />
                  <span>{item.label}</span>
                </button>
              );
            })}
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
                {isExpanded && (
                  <div className="sidebar-group-items">
                    {section.items.map((item) => {
                      const ItemIcon = item.icon;
                      const isActiveItem = activeTab === item.tab;
                      return (
                        <button
                          key={item.tab}
                          className={`${isActiveItem ? 'active' : ''} ${item.sub ? 'sub-item' : ''}`}
                          onClick={() => handleTabChange(item.tab)}
                        >
                          <ItemIcon size={item.sub ? 18 : 20} /> {item.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          <Link to="/" className="logout-link">
            <LogOut size={20} />
          </Link>
        </nav>
      </div>

      <div className="admin-shell-main">
        <div className="admin-content">
          {mainContent}
        </div>
      </div>
    </div>

    {modals}
  </div>
);

export default AdminShell;
