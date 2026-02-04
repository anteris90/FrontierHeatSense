/**
 * concurrency.js
 * 
 * Concurrency control utility for parallel operations with configurable limits.
 * Prevents overwhelming external APIs with too many simultaneous requests.
 * 
 * Used by: player-gate resolver (system + assembly fetches)
 */

/**
 * Map with concurrency control
 * Processes array items through async mapper function with limited parallelism
 * 
 * @param {array} list - Items to process
 * @param {function} mapper - Async function (item, index) => result
 * @param {number} concurrency - Max parallel operations (default 6)
 * @returns {array} Results array in same order as input
 */
async function mapWithConcurrency(list, mapper, concurrency = 6) {
  const results = new Array(list.length);
  let i = 0;
  
  // Create worker coroutines
  const workers = new Array(Math.min(concurrency, list.length)).fill(0).map(async () => {
    while (true) {
      const idx = i++;
      if (idx >= list.length) return;
      try {
        results[idx] = await mapper(list[idx], idx);
      } catch (err) {
        results[idx] = null;
      }
    }
  });
  
  await Promise.all(workers);
  return results;
}

export { mapWithConcurrency };
