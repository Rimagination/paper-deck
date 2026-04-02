import test from "node:test";
import assert from "node:assert/strict";

import { fetchNextDrawBatch } from "./drawSession.js";

test("keeps already seen papers excluded when a draw returns no cards", async () => {
  const requestCalls = [];

  const result = await fetchNextDrawBatch({
    requestCards: async (excludedPaperIds) => {
      requestCalls.push(excludedPaperIds);
      return [];
    },
    collectedPaperIds: ["collected-1"],
    seenPaperIds: ["seen-1", "seen-2"],
  });

  assert.deepEqual(requestCalls, [["collected-1", "seen-1", "seen-2"]]);
  assert.equal(result.exhausted, true);
  assert.deepEqual(result.nextSeenPaperIds, ["seen-1", "seen-2"]);
});

test("records newly drawn papers into the seen set", async () => {
  const result = await fetchNextDrawBatch({
    requestCards: async () => [{ paper_id: "new-1" }, { paper_id: "new-2" }],
    collectedPaperIds: ["collected-1"],
    seenPaperIds: ["seen-1"],
  });

  assert.equal(result.exhausted, false);
  assert.deepEqual(result.nextSeenPaperIds, ["seen-1", "new-1", "new-2"]);
});
