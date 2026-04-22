import { Route, Routes } from 'react-router-dom';
import { APP_ROUTE_DEFINITIONS } from './routeDefinitions';

export const AppRoutes = () => (
  <Routes>
    {APP_ROUTE_DEFINITIONS.map(({ key, path, component: Component }) => (
      <Route key={key} path={path} element={<Component />} />
    ))}
  </Routes>
);
