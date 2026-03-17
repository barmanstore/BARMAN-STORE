import { Edit2, Plus, Trash2 } from 'lucide-react';

const CategoryTreeNode = ({
  node,
  depth,
  expandedMap,
  selectedCategoryId,
  onToggleExpanded,
  onSelectCategory,
  onEditCategory,
  onAddChild,
  onDeleteCategory,
  onDropProduct,
  renderChild,
}) => {
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;
  const expanded = Boolean(expandedMap[node.id]);
  const selected = Number(selectedCategoryId) === Number(node.id);

  return (
    <div>
      <div
        className={`category-tree-node${selected ? ' selected' : ''}`}
        style={{ marginLeft: `${depth * 14}px` }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          onDropProduct(node.id);
        }}
      >
        <button
          type="button"
          className={`tree-expand-btn${hasChildren ? '' : ' empty'}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (hasChildren) onToggleExpanded(node.id);
          }}
        >
          {hasChildren ? (expanded ? '-' : '+') : '.'}
        </button>
        <button
          type="button"
          className="tree-node-title"
          onClick={() => onSelectCategory(node.id)}
          title={node.path || node.name}
        >
          {node.image ? (
            <img
              src={node.image}
              alt=""
              className="tree-node-media"
              width={Number(node.image_width || 20)}
              height={Number(node.image_height || 20)}
              loading="lazy"
            />
          ) : node.icon ? (
            <span className="tree-node-icon">{node.icon}</span>
          ) : null}
          <span className="tree-node-label">{node.name}</span>
        </button>
        <span className="tree-node-count" title="Direct products / Total subtree products">
          {Number(node.product_count || 0)} / {Number(node.total_product_count || 0)}
        </span>
        <div className="tree-node-actions">
          <button
            type="button"
            className="cat-icon-btn cat-edit-btn"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onEditCategory(node);
            }}
            title="Edit category"
          >
            <Edit2 size={14} />
          </button>
          <button
            type="button"
            className="cat-icon-btn cat-add-btn"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onAddChild(node.id);
            }}
            title="Add child category"
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            className="cat-icon-btn cat-delete-btn"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onDeleteCategory(node.id);
            }}
            title="Delete category"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {hasChildren && expanded ? node.children.map((child) => renderChild(child, depth + 1)) : null}
    </div>
  );
};

const CategoryTreePanel = ({
  categoryTree,
  expandedMap,
  selectedCategoryId,
  onToggleExpanded,
  onSelectCategory,
  onEditCategory,
  onAddChild,
  onDeleteCategory,
  onDropProduct,
}) => {
  const renderTreeNode = (node, depth = 0) => (
    <CategoryTreeNode
      key={node.id}
      node={node}
      depth={depth}
      expandedMap={expandedMap}
      selectedCategoryId={selectedCategoryId}
      onToggleExpanded={onToggleExpanded}
      onSelectCategory={onSelectCategory}
      onEditCategory={onEditCategory}
      onAddChild={onAddChild}
      onDeleteCategory={onDeleteCategory}
      onDropProduct={onDropProduct}
      renderChild={renderTreeNode}
    />
  );

  return (
    <div className="category-tree-list">
      {categoryTree.map((node) => renderTreeNode(node))}
    </div>
  );
};

export default CategoryTreePanel;
