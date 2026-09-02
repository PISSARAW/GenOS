/**
 * Generic list-pagination wrapper.
 *
 * Wraps an array-returning route handler so `?limit=&offset=` bounds the
 * payload while the full count travels in `X-Total-Count`. Without paging
 * params, behavior is unchanged (plain array), which keeps every existing
 * client compatible.
 *
 * This lives at the routing layer because some list handlers sit in files
 * above the 400-line repo limit and must not be edited casually.
 */

function sliceArray(res, items, limit, offset) {
  const total = items.length;
  res.setHeader('X-Total-Count', String(total));
  return res.json(items.slice(offset, offset + limit));
}

function paginateList(handler) {
  return async (req, res) => {
    const limit = Number.parseInt(req.query?.limit, 10);
    const offset = Number.parseInt(req.query?.offset, 10);

    if (!Number.isFinite(limit) || limit <= 0) {
      return handler(req, res);
    }

    let captured;
    let capturedThis;
    const originalJson = res.json;
    res.json = function patchedJson(data) {
      captured = data;
      capturedThis = this;
      return this;
    };

    try {
      await handler(req, res);
    } finally {
      res.json = originalJson;
    }

    if (captured === undefined) {
      // The handler already responded (error path); nothing to do.
      return;
    }
    if (!Array.isArray(captured)) {
      return originalJson.call(capturedThis, captured);
    }
    const start = Number.isFinite(offset) && offset > 0 ? offset : 0;
    return sliceArray(res, captured, limit, start);
  };
}

module.exports = { paginateList };
