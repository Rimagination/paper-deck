export function shouldShowLoadingStage({
  hasInterestMemory,
  seedPaperCount,
  drawStatus,
  cardCount,
  currentIndex,
  isFetching,
}) {
  if (!hasInterestMemory || seedPaperCount === 0) return false;

  const isWaitingForFirstCard =
    cardCount === 0 && (drawStatus === "loading" || drawStatus === "idle" || isFetching);
  const isWaitingForNextCard =
    cardCount > 0 && currentIndex >= cardCount && (drawStatus === "loading" || isFetching);

  return isWaitingForFirstCard || isWaitingForNextCard;
}

export function shouldShowExhaustedState({ cardCount, currentIndex, isFetching }) {
  return cardCount > 0 && currentIndex >= cardCount && !isFetching;
}
