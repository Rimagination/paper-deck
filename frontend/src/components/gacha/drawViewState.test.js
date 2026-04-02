import test from "node:test";
import assert from "node:assert/strict";

import { shouldShowExhaustedState, shouldShowLoadingStage } from "./drawViewState.js";

test("shows the loading ritual while the first draw is still pending", () => {
  assert.equal(
    shouldShowLoadingStage({
      hasInterestMemory: true,
      seedPaperCount: 3,
      drawStatus: "idle",
      cardCount: 0,
      currentIndex: 0,
      isFetching: false,
    }),
    true
  );
});

test("keeps showing the loading ritual when the user has consumed the last card and prefetch is in flight", () => {
  assert.equal(
    shouldShowLoadingStage({
      hasInterestMemory: true,
      seedPaperCount: 3,
      drawStatus: "ready",
      cardCount: 1,
      currentIndex: 1,
      isFetching: true,
    }),
    true
  );

  assert.equal(
    shouldShowExhaustedState({
      cardCount: 1,
      currentIndex: 1,
      isFetching: true,
    }),
    false
  );
});

test("shows the exhausted state only after prefetch has finished and no next card arrived", () => {
  assert.equal(
    shouldShowLoadingStage({
      hasInterestMemory: true,
      seedPaperCount: 3,
      drawStatus: "ready",
      cardCount: 1,
      currentIndex: 1,
      isFetching: false,
    }),
    false
  );

  assert.equal(
    shouldShowExhaustedState({
      cardCount: 1,
      currentIndex: 1,
      isFetching: false,
    }),
    true
  );
});
