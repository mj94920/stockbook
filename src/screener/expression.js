(function (root, factory) {
  const api = factory(
    typeof module === 'object' && module.exports ? require('./engine.js') : root.StockBookScreener,
    typeof module === 'object' && module.exports
      ? require('./temporal.js')
      : root.StockBookScreenTemporal,
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StockBookScreenExpression = api;
})(typeof window === 'object' ? window : globalThis, function (engine, temporal) {
  'use strict';
  function combine(type, states) {
    if (
      !['all', 'any'].includes(type) ||
      !states.length ||
      states.some((s) => !['match', 'no-match', 'unknown'].includes(s))
    )
      throw Error('논리 판정 자료 오류');
    return type === 'all'
      ? states.includes('no-match')
        ? 'no-match'
        : states.includes('unknown')
          ? 'unknown'
          : 'match'
      : states.includes('match')
        ? 'match'
        : states.includes('unknown')
          ? 'unknown'
          : 'no-match';
  }
  function migrateLegacy(conditions, { join = 'all', cycle = 'day', mode = 'closed' } = {}) {
    if (
      !['all', 'any'].includes(join) ||
      !['day', 'week', 'month', 'year'].includes(cycle) ||
      !['closed', 'latest'].includes(mode) ||
      !Array.isArray(conditions) ||
      !conditions.length ||
      conditions.length > 12
    )
      throw Error('기존 조건식 형식 오류');
    const records = conditions.map((condition, i) => ({
      key: String.fromCharCode(65 + i),
      condition: engine.validate(condition),
      time: { cycle, mode, barsAgo: 0 },
    }));
    return {
      version: 2,
      conditions: records,
      root: { type: join, children: records.map((r) => ({ type: 'ref', key: r.key })) },
    };
  }
  // Gate 1: flat migrated expressions only. Nested logic and offsets are connected after parity passes.
  function evaluate(dataset, document, { turnover = null } = {}) {
    if (
      document?.version !== 2 ||
      !Array.isArray(document.conditions) ||
      !document.conditions.length ||
      document.conditions.length > 12
    )
      throw Error('조건식 버전·항목 오류');
    const root = document.root,
      records = document.conditions;
    if (
      !root ||
      !['all', 'any'].includes(root.type) ||
      !Array.isArray(root.children) ||
      root.children.length !== records.length ||
      root.children.some((node, i) => node.type !== 'ref' || node.key !== records[i].key)
    )
      throw Error('평면 이관 식 형식 오류');
    const first = records[0].time;
    if (
      records.some(
        (r) =>
          r.time?.cycle !== first.cycle ||
          r.time?.mode !== first.mode ||
          r.time?.barsAgo !== 0 ||
          r.window !== undefined,
      )
    )
      throw Error('이관 식 평가 맥락 오류');
    const context = engine.prepare(dataset, { ...first, turnover });
    const results = records.map((r) => engine.evaluateLeaf(context, engine.validate(r.condition)));
    return engine.summarize(
      context,
      results,
      combine(
        root.type,
        results.map((r) => r.state),
      ),
      root.type,
    );
  }
  function notState(state) {
    if (!['match', 'no-match', 'unknown'].includes(state)) throw Error('NOT 판정 자료 오류');
    return state === 'unknown' ? 'unknown' : state === 'match' ? 'no-match' : 'match';
  }
  function keysOnly(value, keys) {
    return (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).every((k) => keys.includes(k))
    );
  }
  function validateDocument(document) {
    if (
      !keysOnly(document, ['version', 'conditions', 'root']) ||
      document.version !== 2 ||
      !Array.isArray(document.conditions) ||
      !document.conditions.length ||
      document.conditions.length > 12
    )
      throw Error('조건식 버전·항목 오류');
    const keys = new Set();
    const conditions = document.conditions.map((record) => {
      if (
        !keysOnly(record, ['key', 'condition', 'time', 'window']) ||
        typeof record.key !== 'string' ||
        !/^[A-L]$/.test(record.key) ||
        keys.has(record.key)
      )
        throw Error('조건 식별자 오류');
      keys.add(record.key);
      const time = record.time;
      if (
        !keysOnly(time, ['cycle', 'mode', 'barsAgo']) ||
        !['day', 'week', 'month', 'year'].includes(time.cycle) ||
        !['closed', 'latest'].includes(time.mode) ||
        !Number.isInteger(time.barsAgo) ||
        time.barsAgo < 0 ||
        time.barsAgo > 1200
      )
        throw Error('조건별 봉 주기·봉전 오류');
      return {
        key: record.key,
        condition: engine.validate(record.condition),
        time: { cycle: time.cycle, mode: time.mode, barsAgo: time.barsAgo },
        ...(record.window === undefined ? {} : { window: temporal.validate(record.window) }),
      };
    });
    let nodes = 0;
    function walk(node, depth = 0) {
      if (++nodes > 128 || depth > 8 || !node || typeof node !== 'object')
        throw Error('논리식 크기·깊이 오류');
      if (node.type === 'ref') {
        if (!keysOnly(node, ['type', 'key']) || !keys.has(node.key))
          throw Error('존재하지 않는 조건 참조');
        return { type: 'ref', key: node.key };
      }
      if (node.type === 'not') {
        if (!keysOnly(node, ['type', 'child'])) throw Error('NOT 형식 오류');
        return { type: 'not', child: walk(node.child, depth + 1) };
      }
      if (
        !keysOnly(node, ['type', 'children']) ||
        !['all', 'any'].includes(node.type) ||
        !Array.isArray(node.children) ||
        !node.children.length ||
        node.children.length > 12
      )
        throw Error('AND/OR 형식 오류');
      return { type: node.type, children: node.children.map((child) => walk(child, depth + 1)) };
    }
    return { version: 2, conditions, root: walk(document.root) };
  }
  function usedKeys(document) {
    const keys = new Set();
    function visit(node) {
      if (node.type === 'ref') keys.add(node.key);
      else if (node.type === 'not') visit(node.child);
      else node.children.forEach(visit);
    }
    visit(validateDocument(document).root);
    return [...keys];
  }
  function evaluateExpression(dataset, input, { turnover = null } = {}) {
    const document = validateDocument(input),
      records = new Map(document.conditions.map((r) => [r.key, r])),
      contexts = new Map(),
      memo = new Map();
    function prepare(time) {
      const key = time.cycle + ':' + time.mode;
      if (!contexts.has(key))
        contexts.set(
          key,
          engine.prepare(dataset, { cycle: time.cycle, mode: time.mode, turnover }),
        );
      return contexts.get(key);
    }
    function visit(node) {
      if (node.type === 'ref') {
        if (!memo.has(node.key)) {
          const record = records.get(node.key),
            context = prepare(record.time),
            index = context.index - record.time.barsAgo,
            point = engine.evaluateLeaf(context, record.condition, index);
          const window = record.window
            ? temporal.evaluate(record.window, (ago) =>
                ago === 0 ? point : engine.evaluateLeaf(context, record.condition, index - ago),
              )
            : null;
          memo.set(node.key, {
            ...point,
            ...(window
              ? {
                  state: window.state,
                  reason:
                    '기간 판정 ' +
                    { match: '충족', 'no-match': '미충족', unknown: '불가' }[window.state],
                  pointState: point.state,
                  window,
                }
              : {}),
            key: node.key,
            time: record.time,
            anchorIndex: context.index,
            barIndex: index,
          });
        }
        return { type: 'ref', key: node.key, state: memo.get(node.key).state };
      }
      if (node.type === 'not') {
        const child = visit(node.child);
        return { type: 'not', state: notState(child.state), child };
      }
      const children = node.children.map(visit);
      return {
        type: node.type,
        state: combine(
          node.type,
          children.map((c) => c.state),
        ),
        children,
      };
    }
    const trace = visit(document.root),
      results = document.conditions.filter((r) => memo.has(r.key)).map((r) => memo.get(r.key));
    const one = (field) =>
        new Set(results.map((r) => r.time[field])).size === 1 ? results[0].time[field] : 'mixed',
      dates = new Set(results.map((r) => r.date));
    return {
      code: dataset.metadata.stockCode,
      date: dates.size === 1 ? results[0].date : null,
      mode: one('mode'),
      cycle: one('cycle'),
      provisional: results.some((r) => r.provisional),
      historyStartPartial: [...contexts.values()].some((c) => c.bars[0].incompleteStart),
      state: trace.state,
      join: 'expression',
      source: dataset.metadata.source || '공급자 미표시',
      fetchedAt: dataset.metadata.fetchedAt || null,
      expressionVersion: 2,
      results,
      trace,
    };
  }
  function parseLogic(text, allowedKeys) {
    if (typeof text !== 'string' || !text.trim() || text.length > 500)
      throw Error('논리식은 1~500자로 입력하세요.');
    const input = text.toUpperCase(),
      tokens = [];
    let offset = 0;
    while (offset < input.length) {
      if (/\s/.test(input[offset])) {
        offset++;
        continue;
      }
      const match = /^(AND\b|OR\b|NOT\b|[A-L]\b|[()])/.exec(input.slice(offset));
      if (!match) throw Error('조건 기호 A~L과 AND·OR·NOT·괄호만 사용할 수 있습니다.');
      tokens.push(match[0]);
      offset += match[0].length;
      if (tokens.length > 128) throw Error('논리식이 너무 깁니다.');
    }
    let index = 0;
    const allowed = new Set(allowedKeys);
    function atom(depth = 0) {
      if (depth > 8) throw Error('논리식이 너무 깊습니다.');
      const token = tokens[index++];
      if (token === 'NOT') return { type: 'not', child: atom(depth + 1) };
      if (token === '(') {
        const node = or(depth + 1);
        if (tokens[index++] !== ')') throw Error('괄호를 확인하세요.');
        return node;
      }
      if (!allowed.has(token)) throw Error('존재하지 않는 조건: ' + (token || '입력 끝'));
      return { type: 'ref', key: token };
    }
    function and(depth) {
      const children = [atom(depth)];
      while (tokens[index] === 'AND') {
        index++;
        children.push(atom(depth));
      }
      return children.length === 1 ? children[0] : { type: 'all', children };
    }
    function or(depth = 0) {
      const children = [and(depth)];
      while (tokens[index] === 'OR') {
        index++;
        children.push(and(depth));
      }
      return children.length === 1 ? children[0] : { type: 'any', children };
    }
    const root = or();
    if (index !== tokens.length) throw Error('논리 연산자·괄호를 확인하세요.');
    return root;
  }
  return Object.freeze({
    migrateLegacy,
    evaluate,
    combine,
    notState,
    validateDocument,
    evaluateExpression,
    parseLogic,
    usedKeys,
  });
});
