import VirtualizedFamilyGrid from '../VirtualizedFamilyGrid';

const ProductsGroupedList = ({
  groupedVisibleFamilies,
  renderFamilyCard,
  estimatedGridColumns,
  VIRTUALIZE_GROUP_THRESHOLD,
  isMobile,
}) => (
  <div className="products-grouped-list">
    {groupedVisibleFamilies.map((topGroup) => (
      <section key={topGroup.key} className="products-group-section">
        <header className="products-group-header">
          <h2>{topGroup.name}</h2>
          <span>{topGroup.total}</span>
        </header>
        <div className="products-subgroups-wrap">
          {topGroup.subGroups.map((subGroup) => (
            <div key={subGroup.key} className="products-subgroup">
              <div className="products-subgroup-header">
                <h3>{subGroup.name}</h3>
                <span>{subGroup.total}</span>
              </div>
              <VirtualizedFamilyGrid
                families={subGroup.families}
                renderFamilyCard={renderFamilyCard}
                estimatedColumns={estimatedGridColumns}
                shouldVirtualize={subGroup.families.length >= VIRTUALIZE_GROUP_THRESHOLD}
                estimatedCardHeight={isMobile ? 248 : 326}
              />
            </div>
          ))}
        </div>
      </section>
    ))}
  </div>
);

export default ProductsGroupedList;

