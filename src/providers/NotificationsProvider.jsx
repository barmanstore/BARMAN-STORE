import { createContext, useContext } from 'react';
import { useNotificationsInbox } from '../features/notifications/hooks/useNotificationsInbox';
import { useRoutePolicy } from './RoutePolicyProvider';
import { useSession } from './SessionProvider';

const NotificationsContext = createContext(null);

export function NotificationsProvider({ children }) {
  const { user, isAdminUser } = useSession();
  const routePolicy = useRoutePolicy();
  const value = useNotificationsInbox({
    user,
    isAdminUser,
    enabled: routePolicy.sideEffects.notifications,
  });

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export const useNotifications = () => {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationsProvider');
  }
  return context;
};
