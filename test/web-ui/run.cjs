// Run with NODE_PATH=$(npm root -g) node test/web-ui/run.cjs
// Requires Playwright Chromium. All mutations and transcript requests are mocked.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const base = process.env.TEST_BASE_URL || 'http://localhost:3001';
const rows = [
  { id: 101, title: 'Alpha <script> & 音频', owner_name: 'Alice', source_type: 'bilibili', source_url: 'https://bilibili.com/video/BVtest', created_at: '2026-10-13T00:00:00Z', duration: 120 },
  { id: 102, title: 'Beta Podcast', owner_name: 'Bob', source_type: 'youtube', source_url: 'https://youtu.be/test', created_at: '2026-10-12T00:00:00Z', duration: 3600 },
];
const text = '正文第一行\n<script>alert("unsafe")</script>\n最后一行';
const job = (id, status, extra = {}) => ({ id, status, title: 'Example job', source_url: rows[0].source_url, source_type: 'bilibili', ...extra });

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    let history = structuredClone(rows), jobs = [], historyFailure = false, transcriptFailure = false;
    let deleteFailure = false, postFailure = false, pollFailure = false, jobDeleteFailure = false;
    let posts = 0, jobDeletes = 0, transcriptGets = 0;
    let slowTranscript = null, slowJobs = null, jobsRequested = null, nextJobId = 202;
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    await page.route('**/api/**', async route => {
      const req = route.request(), url = new URL(req.url()), method = req.method();
      const send = (status, payload) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
      if (url.pathname === '/api/transcriptions') return send(historyFailure ? 503 : 200, historyFailure ? { error: 'history unavailable' } : history);
      if (url.pathname.startsWith('/api/transcriptions/')) {
        if (method === 'DELETE') {
          if (deleteFailure) return send(500, { error: 'delete rejected' });
          history = history.filter(row => row.id !== Number(url.pathname.split('/').pop()));
          return route.fulfill({ status: 204 });
        }
        transcriptGets++;
        if (slowTranscript) await slowTranscript;
        return send(transcriptFailure ? 503 : 200, transcriptFailure ? { error: 'body unavailable' } : { transcript: text });
      }
      if (url.pathname === '/api/jobs') {
        if (method === 'POST') {
          posts++;
          if (postFailure) return send(503, { error: 'retry rejected' });
          jobs.push(job(nextJobId, 'queued'));
          return send(201, { id: nextJobId, status: 'queued' });
        }
        assert.equal(url.searchParams.get('includeDone'), 'true');
        const snapshot = structuredClone(jobs);
        if (slowJobs) { jobsRequested(); await slowJobs; }
        return send(pollFailure ? 503 : 200, pollFailure ? { error: 'poll unavailable' } : snapshot);
      }
      if (url.pathname.startsWith('/api/jobs/') && method === 'DELETE') {
        jobDeletes++;
        if (jobDeleteFailure) return send(409, { error: 'cannot remove job' });
        jobs = jobs.filter(j => j.id !== Number(url.pathname.split('/').pop()));
        return route.fulfill({ status: 204 });
      }
      throw new Error('Unexpected API request: ' + method + ' ' + url.pathname);
    });
    const poll = () => page.evaluate(() => pollJobs());
    const notice = page.locator('#completion-notice');
    const reader = page.locator('#transcript-reader');
    const title = id => page.locator('[data-action="view-transcript"][data-id="' + id + '"]');
    await page.goto(base);
    await page.waitForFunction(() => document.getElementById('history-count').textContent === '2 / 2 条');
    assert.equal(await page.locator('#history-body tbody tr').count(), 2);
    await page.locator('#history-search').fill('aLiCe');
    assert.equal(await page.locator('#history-body tbody tr').count(), 1);
    await page.locator('#history-source').selectOption('youtube');
    assert.match(await page.locator('#history-body').innerText(), /没有匹配/);
    await page.locator('#history-refresh').click();
    await page.waitForFunction(() => !document.getElementById('history-refresh').disabled);
    assert.equal(await page.locator('#history-search').inputValue(), 'aLiCe');
    await page.locator('#history-search').fill('');
    await page.locator('#history-source').selectOption('');

    await title(101).click();
    await page.waitForFunction(() => !document.getElementById('reader-txt').disabled);
    assert.equal(await page.locator('#reader-text').textContent(), text);
    assert.equal(await page.locator('#reader-text script').count(), 0);
    for (const [button, extension] of [['reader-txt', 'txt'], ['reader-md', 'md']]) {
      const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#' + button).click()]);
      assert.ok(download.suggestedFilename().endsWith('.' + extension));
      assert.equal(await fs.readFile(await download.path(), 'utf8'), text);
    }
    await page.evaluate(() => { copyToClipboard = async () => false; });
    await page.locator('#reader-copy').click();
    assert.match(await page.locator('#reader-status').innerText(), /复制失败/);
    await page.keyboard.press('Escape');
    assert.equal(await reader.isVisible(), false);
    assert.equal(await title(101).evaluate(el => el === document.activeElement), true);
    await title(101).click();
    await page.waitForFunction(() => !document.getElementById('reader-txt').disabled);
    assert.equal(transcriptGets, 1, 'reader should reuse the cached transcript');
    await page.locator('#reader-close').click();

    transcriptFailure = true;
    await title(102).click();
    await page.waitForFunction(() => !document.getElementById('reader-retry').classList.contains('hidden'));
    assert.equal(await page.locator('#reader-copy').isDisabled(), true);
    transcriptFailure = false;
    await page.locator('#reader-retry').click();
    await page.waitForFunction(() => !document.getElementById('reader-copy').disabled);
    await page.locator('#reader-close').click();

    // A closed reader must not be updated by a late response.
    await page.evaluate(() => transcriptCache.clear());
    let release;
    slowTranscript = new Promise(resolve => { release = resolve; });
    await title(101).click();
    await page.waitForFunction(() => document.getElementById('reader-status').textContent === '正在加载正文…');
    await page.locator('#reader-close').click();
    release(); slowTranscript = null;
    await page.waitForTimeout(100);
    assert.equal(await reader.isVisible(), false);
    assert.equal(await page.locator('#reader-text').textContent(), '');

    historyFailure = true;
    await page.locator('#history-refresh').click();
    await page.waitForFunction(() => document.getElementById('history-status').classList.contains('error'));
    assert.equal(await page.locator('#history-body tbody tr').count(), 2);
    historyFailure = false;
    deleteFailure = true;
    const del = page.locator('[data-action="delete"][data-id="101"]');
    await del.click();
    await page.waitForFunction(() => document.getElementById('history-status').textContent.includes('delete rejected'));
    assert.equal(await del.isDisabled(), false);
    assert.equal(await page.locator('#history-body tbody tr').count(), 2);
    deleteFailure = false;

    jobs = [job(201, 'processing')]; await poll();
    jobs = [job(201, 'done', { transcription_id: 101 })]; await poll();
    assert.equal(await notice.isVisible(), true);
    assert.equal(await page.locator('[data-history-id="101"]').getAttribute('class'), 'highlighted');
    await page.locator('#history-search').fill('nothing');
    await notice.locator('button').click();
    await page.waitForFunction(() => !document.getElementById('reader-copy').disabled);
    assert.equal(await page.locator('#history-search').inputValue(), '');
    await page.locator('#reader-close').click();
    jobs = [job(203, 'queued')]; await poll(); jobs = []; await poll();
    assert.equal(await notice.locator('button').count(), 1, 'disappearance must not announce completion');

    jobs = [job(204, 'failed', { error: 'test failure' })]; await poll();
    postFailure = true;
    await page.locator('[data-action="retry-job"][data-id="204"]').click();
    await page.waitForFunction(() => document.getElementById('queue-action-status').textContent.includes('retry rejected'));
    assert.equal(jobDeletes, 0, 'failed retry must not delete the original job');
    assert.equal(await page.locator('[data-action="retry-job"][data-id="204"]').isDisabled(), false);
    await poll();
    assert.match(await page.locator('#queue-action-status').innerText(), /retry rejected/);
    postFailure = false; jobDeleteFailure = true;
    await page.locator('[data-action="retry-job"][data-id="204"]').click();
    await page.waitForFunction(() => document.getElementById('queue-action-status').textContent.includes('新任务已提交'));
    assert.equal(await page.locator('[data-action="retry-job"][data-id="204"]').isDisabled(), true);
    assert.equal(posts, 2);
    jobDeleteFailure = false;
    await page.locator('[data-action="dismiss-job"][data-id="204"]').click();
    await page.waitForFunction(() => document.getElementById('queue-action-status').textContent === '已移除失败记录');
    assert.equal(posts, 2, 'cleanup must not resubmit');
    jobDeleteFailure = true;
    await page.locator('[data-action="cancel-job"][data-id="202"]').click();
    await page.waitForFunction(() => document.getElementById('queue-action-status').textContent.includes('cannot remove job'));
    assert.equal(await page.locator('[data-action="cancel-job"][data-id="202"]').isDisabled(), false);
    pollFailure = true; await poll();
    assert.match(await page.locator('#queue-refresh-status').innerText(), /poll unavailable/);
    assert.equal(await page.locator('[data-action="cancel-job"][data-id="202"]').count(), 1);
    pollFailure = false; await poll();
    assert.equal(await page.locator('#queue-refresh-status').innerText(), '');

    // A submission racing an older poll must remain tracked even if that
    // response was captured before the new job existed.
    await page.evaluate(() => { clearInterval(queuePollTimer); queuePollTimer = null; });
    let releaseJobs;
    slowJobs = new Promise(resolve => { releaseJobs = resolve; });
    const requested = new Promise(resolve => { jobsRequested = resolve; });
    await page.evaluate(() => { window.racePoll = pollJobs(); });
    await requested;
    nextJobId = 205;
    await page.locator('#url-input').fill(rows[0].source_url);
    await page.locator('#submit-btn').click();
    await page.waitForFunction(() => document.getElementById('url-status').textContent === 'queued ✓');
    releaseJobs(); slowJobs = null;
    await page.evaluate(() => window.racePoll);
    assert.equal(await page.evaluate(() => knownJobStatuses.get(205)), 'queued');
    assert.equal(await page.evaluate(() => queuePollTimer !== null), true);
    jobs = [job(205, 'done', { transcription_id: 102 })]; await poll();
    assert.equal(await notice.locator('button').count(), 2);

    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'mobile page must not overflow');
    await title(101).click();
    await page.waitForFunction(() => !document.getElementById('reader-copy').disabled);
    assert.equal(await reader.evaluate(el => el.scrollWidth <= el.clientWidth), true);
    await page.evaluate(() => { copyToClipboard = async () => true; });
    await page.locator('#reader-copy').click();
    assert.equal(await page.locator('#reader-status').innerText(), '已复制全文');
    await page.locator('#reader-close').click();
    const cachedGets = transcriptGets;
    history[0].created_at = '2026-10-13T01:00:00Z';
    await page.locator('#history-refresh').click();
    await page.waitForFunction(() => !document.getElementById('history-refresh').disabled);
    await title(101).click();
    await page.waitForFunction(() => !document.getElementById('reader-copy').disabled);
    assert.equal(transcriptGets, cachedGets + 1, 'changed history must invalidate cached text');
    await page.locator('#reader-close').click();
    await page.locator('[data-action="delete"][data-id="101"]').click();
    await page.waitForFunction(() => document.getElementById('history-count').textContent === '1 / 1 条');
    assert.equal(await title(101).count(), 0);
    assert.equal(await page.evaluate(() => transcriptCache.has(101)), false);

    history = []; jobs = []; historyFailure = true;
    await page.reload();
    await page.waitForFunction(() => document.getElementById('history-status').classList.contains('error'));
    assert.match(await page.locator('#history-body').innerText(), /历史加载失败/);
    historyFailure = false;
    await page.locator('#history-refresh').click();
    await page.waitForFunction(() => document.getElementById('history-count').textContent === '0 / 0 条');
    assert.match(await page.locator('#history-body').innerText(), /No transcriptions/);
    assert.deepEqual(errors, []);
    console.log('PASS: reader, text safety, exports, search/filter, cache, stale loads, history errors, completion, retry/cleanup, cancel errors, polling and mobile layout');
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
