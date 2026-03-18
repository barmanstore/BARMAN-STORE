const buildAdminPageProps = ({
  core,
  navigation,
  stats,
  products,
  orders,
  users,
  modals,
  billing,
}) => ({
  ...core,
  ...navigation,
  ...stats,
  ...products,
  ...orders,
  ...users,
  ...modals,
  ...billing,
});

export default buildAdminPageProps;
