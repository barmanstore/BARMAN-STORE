const CategoryDiagramPanel = ({ diagram, selectedCategoryId, onSelectCategory }) => (
  <div className="diagram-scroll">
    <svg
      className="category-diagram"
      viewBox={`0 0 ${diagram.width} ${diagram.height}`}
      role="img"
      aria-label="Category hierarchy diagram"
    >
      {diagram.edges.map((edge) => (
        <line
          key={`edge-${edge.from}-${edge.to}`}
          x1={edge.fromPos.x + 138}
          y1={edge.fromPos.y + 26}
          x2={edge.toPos.x}
          y2={edge.toPos.y + 26}
          className="diagram-edge"
        />
      ))}
      {diagram.nodes.map((node) => {
        const selected = Number(selectedCategoryId) === Number(node.id);
        return (
          <g
            key={`node-${node.id}`}
            className={`diagram-node${selected ? ' selected' : ''}`}
            onClick={() => onSelectCategory(node.id)}
          >
            <rect x={node.x} y={node.y} width="138" height="52" rx="9" />
            <text x={node.x + 8} y={node.y + 20} className="diagram-node-name">{node.name}</text>
            <text x={node.x + 8} y={node.y + 38} className="diagram-node-meta">
              {node.count}/{node.total}
            </text>
          </g>
        );
      })}
    </svg>
  </div>
);

export default CategoryDiagramPanel;
