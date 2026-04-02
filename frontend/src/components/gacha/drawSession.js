function normalizePaperId(value) {
  return typeof value === "string" ? value.trim() : "";
}

function uniquePaperIds(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(normalizePaperId).filter(Boolean))];
}

function paperIdsFromCards(cards) {
  if (!Array.isArray(cards)) return [];
  return cards.map((card) => normalizePaperId(card?.paper_id)).filter(Boolean);
}

export function buildDrawExcludedPaperIds({ collectedPaperIds = [], seenPaperIds = [] } = {}) {
  return uniquePaperIds([...collectedPaperIds, ...seenPaperIds]);
}

export async function fetchNextDrawBatch({
  requestCards,
  collectedPaperIds = [],
  seenPaperIds = [],
}) {
  const excludedPaperIds = buildDrawExcludedPaperIds({ collectedPaperIds, seenPaperIds });
  const cards = await requestCards(excludedPaperIds);

  if (!Array.isArray(cards) || cards.length === 0) {
    return {
      cards: [],
      exhausted: true,
      excludedPaperIds,
      nextSeenPaperIds: uniquePaperIds(seenPaperIds),
    };
  }

  return {
    cards,
    exhausted: false,
    excludedPaperIds,
    nextSeenPaperIds: uniquePaperIds([...seenPaperIds, ...paperIdsFromCards(cards)]),
  };
}
