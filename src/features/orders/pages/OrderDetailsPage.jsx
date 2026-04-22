import { Navigate, useParams } from 'react-router-dom';

function OrderDetailsPage() {
  const { id } = useParams();
  return <Navigate to={id ? `/order-tracking/${id}` : '/order-history'} replace />;
}

export default OrderDetailsPage;
