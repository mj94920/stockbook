'use strict';
const { randomUUID } = require('node:crypto');
const policy = require('./policy.js');
const { request } = require('./research.cjs');
function limit(p, ms) {
  let timer;
  return Promise.race([
    p,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error('대기 시간 초과')), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
function registerAI({ ipcMain, getMainWindow, research, home = null, timeoutMs = 120000 }) {
  let active = null;
  const main = (event) => {
    const win = getMainWindow();
    return (
      !!win && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame
    );
  };
  async function status() {
    if (!home)
      return {
        ok: true,
        configured: false,
        providers: [],
        message: '홈 연동 경로가 아직 등록되지 않았습니다.',
      };
    try {
      const value = await limit(home.status(), 5000);
      return {
        ok: true,
        configured: true,
        providers: ['codex', 'claude'].map((id) => ({
          id,
          connected: value?.providers?.some((p) => p.id === id && p.connected === true) || false,
        })),
        message: '홈 연결 상태',
        running: !!active,
      };
    } catch {
      return {
        ok: false,
        configured: true,
        providers: [],
        error: '홈 연결 상태를 확인하지 못했습니다.',
      };
    }
  }
  ipcMain.handle('stockbook-ai', async (event, op, value) => {
    if (!main(event)) return { ok: false, error: '요청한 화면을 확인할 수 없습니다.' };
    try {
      if (op === 'status') return await status();
      if (op === 'research') {
        const input = request(value);
        return { ok: true, bundle: await research.collect(input, { refresh: true }) };
      }
      if (op === 'cancel') {
        if (!active) return { ok: true, requested: false, confirmed: true };
        const job = active;
        job.controller.abort();
        let confirmed = false;
        if (home?.cancel)
          try {
            confirmed = (await limit(home.cancel(job.id), 3000)) === true;
          } catch {}
        return { ok: true, requested: true, confirmed };
      }
      if (op !== 'analyze') throw Error('지원하지 않는 AI 요청입니다.');
      const input = request(value),
        pattern = value.pattern || 'stock',
        provider = value.provider || 'auto';
      if (
        !Object.hasOwn(policy.patterns, pattern) ||
        !['auto', 'codex', 'claude'].includes(provider)
      )
        throw Error('분석 패턴·모델을 확인하세요.');
      if (!home) return { ok: false, error: '홈 연결 경로를 먼저 등록해야 합니다.' };
      if (active) return { ok: false, error: '진행 중인 분석을 먼저 마치거나 취소하세요.' };
      const connection = await status();
      if (
        !connection.ok ||
        !connection.providers.some((p) => p.connected && (provider === 'auto' || p.id === provider))
      )
        return { ok: false, error: '홈에서 선택 모델의 연결 상태를 확인하세요.' };
      if (active) return { ok: false, error: '진행 중인 분석을 먼저 마치거나 취소하세요.' };
      const job = { id: randomUUID(), controller: new AbortController() };
      active = job;
      let timer,
        timedOut = false;
      try {
        const bundle = await research.collect(input);
        if (job.controller.signal.aborted) throw Error('취소 요청한 분석입니다.');
        if (
          !bundle.evidence.some(
            (e) => ['prices', 'finance', 'news'].includes(e.id) && e.status === 'received',
          )
        )
          throw Error('가격·재무·뉴스 자료를 받지 못했습니다. 자료 수집을 먼저 확인하세요.');
        const available = new Set(
          bundle.evidence.filter((e) => e.status === 'received').map((e) => e.id),
        );
        if (!policy.patterns[pattern].needs.some((n) => available.has(n)))
          throw Error('이 점검에 필요한 사용자 기록·자료가 아직 연결되지 않았습니다.');
        const context = {
          ...bundle,
          missing: [
            ...new Set([
              ...bundle.missing,
              ...policy.patterns[pattern].needs.filter((n) => !available.has(n)),
            ]),
          ],
        };
        const prompt = policy.prompt(context, pattern);
        if (Buffer.byteLength(prompt) > 120000)
          throw Error('분석 자료 크기가 한도를 초과했습니다.');
        const remote = home.analyze({
          requestId: job.id,
          code: input.code,
          mode: 'stock',
          provider,
          pattern,
          prompt,
          schema: policy.schema,
          signal: job.controller.signal,
        });
        const stop = new Promise((_, reject) => {
          timer = setTimeout(() => {
            timedOut = true;
            job.controller.abort();
            reject(Error('분석 대기 시간이 초과됐습니다. 홈에서 실행 상태를 확인하세요.'));
          }, timeoutMs);
          job.controller.signal.addEventListener(
            'abort',
            () =>
              reject(
                Error(
                  timedOut
                    ? '분석 대기 시간이 초과됐습니다. 홈에서 실행 상태를 확인하세요.'
                    : '취소 요청한 분석입니다.',
                ),
              ),
            { once: true },
          );
        });
        const answer = await Promise.race([remote, stop]);
        if (job.controller.signal.aborted) throw Error('취소 요청한 분석입니다.');
        if (
          !answer ||
          answer.requestId !== job.id ||
          answer.code !== input.code ||
          !['codex', 'claude'].includes(answer.provider) ||
          (provider !== 'auto' && answer.provider !== provider)
        )
          throw Error('홈이 반환한 모델 정보를 확인할 수 없습니다.');
        const result = policy.validate(answer.result, context);
        return {
          ok: true,
          provider: answer.provider,
          pattern,
          createdAt: new Date().toISOString(),
          bundle: context,
          result: { ...result, missing: [...new Set([...context.missing, ...result.missing])] },
          requestId: job.id,
        };
      } finally {
        clearTimeout(timer);
        if (active === job) active = null;
      }
    } catch (error) {
      return { ok: false, error: publicError(error) };
    }
  });
  function publicError(error) {
    const allowed = [
      '이 점검에 필요한 사용자 기록·자료가 아직 연결되지 않았습니다.',
      'AI 결과 형식 오류',
      'AI 요약·선택지 형식 오류',
      'AI 근거 참조 오류',
      'AI 선택지 근거 오류',
      'AI 누락·질문 형식 오류',
      '분석 요청 형식 오류',
      '국내 종목코드를 확인하세요.',
      '개별 주식만 지원합니다.',
      '자료 기간을 확인하세요.',
      '분석 패턴·모델을 확인하세요.',
      '분석 자료 크기가 한도를 초과했습니다.',
      '취소 요청한 분석입니다.',
      '가격·재무·뉴스 자료를 받지 못했습니다. 자료 수집을 먼저 확인하세요.',
      '분석 대기 시간이 초과됐습니다. 홈에서 실행 상태를 확인하세요.',
      '홈이 반환한 모델 정보를 확인할 수 없습니다.',
    ];
    return allowed.includes(error?.message)
      ? error.message
      : '자료 수집 또는 홈 분석 요청에 실패했습니다.';
  }
  return {
    status,
    dispose() {
      active?.controller.abort();
    },
  };
}
module.exports = { registerAI };
