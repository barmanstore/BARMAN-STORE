import ProductsView from './components/ProductsView';
import useProductsController from './hooks/useProductsController';
import './Products.css';

function Products(props) {
  const viewProps = useProductsController(props);
  return <ProductsView {...viewProps} />;
}

export default Products;
