import ProductsPageLayout from '../components/ProductsPageLayout';
import useProductsController from '../hooks/useProductsController';
import './ProductsPage.css';

function ProductsPage(props) {
  const pageProps = useProductsController(props);
  return <ProductsPageLayout {...pageProps} />;
}

export default ProductsPage;
