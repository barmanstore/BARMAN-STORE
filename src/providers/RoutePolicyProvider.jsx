import { createContext, useContext, useMemo } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { DEFAULT_ROUTE_POLICY, APP_ROUTE_DEFINITIONS } from '../app/routeDefinitions';
import useIsMobile from '../shared/hooks/useIsMobile';

const RoutePolicyContext = createContext(null);

const resolveShellVariant = (shell, isMobile) => {
  if (!shell || typeof shell !== 'object') return 'default';
  return isMobile ? shell.mobile || shell.desktop || 'default' : shell.desktop || shell.mobile || 'default';
};

const matchRouteDefinition = (pathname) => (
  APP_ROUTE_DEFINITIONS.find((definition) => Boolean(matchPath({ path: definition.path, end: true }, pathname)))
  || null
);

export function RoutePolicyProvider({ children }) {
  const location = useLocation();
  const isMobile = useIsMobile();
  const matchedRoute = matchRouteDefinition(location.pathname) || DEFAULT_ROUTE_POLICY;

  const value = useMemo(() => {
    const policy = matchedRoute.policy || DEFAULT_ROUTE_POLICY.policy;
    return {
      routeKey: matchedRoute.key || DEFAULT_ROUTE_POLICY.key,
      pathname: location.pathname,
      search: location.search,
      isMobile,
      shell: policy.shell,
      variant: resolveShellVariant(policy.shell, isMobile),
      sideEffects: {
        analytics: policy?.sideEffects?.analytics !== false,
        notifications: policy?.sideEffects?.notifications !== false,
      },
      runtime: {
        allowAdminShortcuts: policy?.runtime?.allowAdminShortcuts !== false,
        isPopupRoute: Boolean(policy?.runtime?.isPopupRoute),
        isAdminArea: Boolean(policy?.runtime?.isAdminArea),
      },
    };
  }, [isMobile, location.pathname, location.search, matchedRoute]);

  return (
    <RoutePolicyContext.Provider value={value}>
      {children}
    </RoutePolicyContext.Provider>
  );
}

export const useRoutePolicy = () => {
  const context = useContext(RoutePolicyContext);
  if (!context) {
    throw new Error('useRoutePolicy must be used within RoutePolicyProvider');
  }
  return context;
};
