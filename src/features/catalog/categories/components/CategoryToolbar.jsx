import { FolderTree, GitBranch, RefreshCcw } from 'lucide-react';

const CategoryToolbar = ({ activeView, onViewChange, onRefresh }) => (
  <div className="category-toolbar">
    <div className="view-switch">
      <button
        type="button"
        className={activeView === 'tree' ? 'active' : ''}
        onClick={() => onViewChange('tree')}
      >
        <FolderTree size={16} />
        Tree
      </button>
      <button
        type="button"
        className={activeView === 'diagram' ? 'active' : ''}
        onClick={() => onViewChange('diagram')}
      >
        <GitBranch size={16} />
        Diagram
      </button>
    </div>
    <button type="button" className="refresh-btn" onClick={onRefresh}>
      <RefreshCcw size={15} />
      Refresh
    </button>
  </div>
);

export default CategoryToolbar;
