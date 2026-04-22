import { useCallback, useState } from 'react';

const getCardKey = (scope, id) => `${scope}:${Number(id || 0)}`;

const useExpandableCards = () => {
  const [expandedCards, setExpandedCards] = useState({});

  const isCardExpanded = useCallback(
    (scope, id) => Boolean(expandedCards[getCardKey(scope, id)]),
    [expandedCards]
  );

  const toggleCard = useCallback((scope, id) => {
    const key = getCardKey(scope, id);
    setExpandedCards((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleCardKeyToggle = useCallback(
    (event, scope, id) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleCard(scope, id);
      }
    },
    [toggleCard]
  );

  return { isCardExpanded, toggleCard, handleCardKeyToggle };
};

export default useExpandableCards;
