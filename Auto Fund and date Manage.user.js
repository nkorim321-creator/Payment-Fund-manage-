// ==UserScript==
// @name         N*M*S*H*N MTurk Payment Cycle Manager (Secure Column A)
// @namespace    N*M*S*H*N
// @version      11.0
// @description  MTurk payment cycle manager with Worker ID Security (Column A only), Screen Lock, 1$-10$ Limits
// @match        https://worker.mturk.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // --- SECURITY CONFIG ---
  const SECURITY_CONFIG = {
    // আপনার নতুন Google Sheet লিংক (export?format=csv সহ)
    sheetCsvUrl: 'https://docs.google.com/spreadsheets/d/1p03KacnfGQhtXm7umEnbktki3wCpaVzC_16W51iKn6U/export?format=csv',
    lockMessage: 'Your Worker ID is not authorized to use this script.'
  };

  const CONFIG = {
    debug: true,
    autoOpenPaymentSchedule: true,
    autoClickUpdate: true,
    redirectDelayMs: 1200,
    submitDelayMs: 1400,
    submitRetryDelayMs: 2200,
    maxSubmitAttempts: 2,
    confirmDelayMs: 500,
    confirmRetryDelayMs: 2200,
    maxConfirmAttempts: 2,
    afterSubmitDelayMs: 6500,
    homeRedirectDelayMs: 500,

    stateKey: 'nmshn_restructured_state_v85',
    workflowKey: 'nmshn_restructured_workflow_v85',
    slabMemoryKey: 'nmshn_restructured_slab_memory_v85'
  };

  const SLABS = {
    S10_PLUS: 'S10_PLUS',
    S5_TO_9: 'S5_TO_9',
    S1_TO_4: 'S1_TO_4',
    S0_TO_1: 'S0_TO_1'
  };

  const RULES = {
    R1_DO_NOTHING_10: 'R1_DO_NOTHING_10',
    R2_FORCE_14_A: 'R2_FORCE_14_A',
    R3_FORCE_7_B: 'R3_FORCE_7_B',
    R4_FORCE_14_C_LOW: 'R4_FORCE_14_C_LOW',
    R5_FORCE_7_C_MID: 'R5_FORCE_7_C_MID',
    R5B_FORCE_3_C_MID: 'R5B_FORCE_3_C_MID',
    R6_FORCE_3_C_HIGH: 'R6_FORCE_3_C_HIGH',
    R7_DO_NOTHING_C_HIGH_LATE: 'R7_DO_NOTHING_C_HIGH_LATE'
  };

  // --- SECURITY FUNCTIONS ---

  async function getAuthorizedIds() {
    try {
      const response = await fetch(SECURITY_CONFIG.sheetCsvUrl);
      if (!response.ok) throw new Error('Sheet access failed');
      const csvData = await response.text();
      // শুধুমাত্র Column A থেকে ডাটা নেওয়ার লজিক
      return csvData.split(/\r?\n/)
        .map(row => row.split(',')[0].trim().toUpperCase())
        .filter(id => id.length > 5); // ছোট টেক্সট বা খালি ঘর বাদ দেওয়ার জন্য
    } catch (err) {
      console.error('[N*M*S*H*N] Security Fetch Error:', err);
      return [];
    }
  }

  function getMyWorkerId() {
    // MTurk পেজ থেকে ইউজারের Worker ID বের করা
    const selectors = ['.worker-id-value', '[data-worker-id]', '.p-r-xs'];
    for (let s of selectors) {
      const el = document.querySelector(s);
      if (el) {
        let val = el.textContent || el.getAttribute('data-worker-id');
        val = val.replace('ID:', '').trim().toUpperCase();
        if (val.length > 5) return val;
      }
    }
    return null;
  }

  function showLockScreen() {
    // স্ক্রিন লক করে দেওয়ার ডিজাইন
    document.documentElement.innerHTML = `
      <div style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:#0d1117;color:#ff4b4b;display:flex;flex-direction:column;justify-content:center;align-items:center;z-index:2147483647;font-family:sans-serif;text-align:center;">
        <div style="font-size:80px;margin-bottom:20px;">🔒</div>
        <h1 style="font-size:32px;margin-bottom:10px;">ACCESS DENIED</h1>
        <p style="font-size:18px;color:#8b949e;max-width:80%;">${SECURITY_CONFIG.lockMessage}</p>
        <div style="margin-top:30px;padding:15px;border:1px solid #30363d;border-radius:6px;background:#161b22;color:#c9d1d9;">
          Contact admin N*M*S*H*N to authorize your ID.
        </div>
      </div>
    `;
    window.stop();
  }

  // --- CORE FUNCTIONS ---

  function log(...args) {
    if (CONFIG.debug) console.log('[N*M*S*H*N]', ...args);
  }

  function qs(selector, root = document) {
    return root.querySelector(selector);
  }

  function showBanner(message, color = '#1565c0') {
    const id = 'nmshn-cycle-banner';
    let el = document.getElementById(id);

    if (!el) {
      el = document.createElement('div');
      el.id = id;
      Object.assign(el.style, {
        position: 'fixed',
        top: '16px',
        right: '16px',
        zIndex: '999999',
        maxWidth: '520px',
        padding: '12px 16px',
        borderRadius: '10px',
        boxShadow: '0 8px 24px rgba(0,0,0,.22)',
        color: '#fff',
        fontSize: '14px',
        fontWeight: '700',
        lineHeight: '1.45',
        wordBreak: 'break-word'
      });
      document.body.appendChild(el);
    }
    el.style.background = color;
    el.textContent = message;
    log(message);
  }

  function saveJSON(key, obj) { localStorage.setItem(key, JSON.stringify(obj)); }
  function loadJSON(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } }
  function removeKey(key) { localStorage.removeItem(key); }
  function saveState(obj) { saveJSON(CONFIG.stateKey, obj); }
  function loadState() { return loadJSON(CONFIG.stateKey); }
  function clearState() { removeKey(CONFIG.stateKey); }
  function saveWorkflow(obj) { saveJSON(CONFIG.workflowKey, obj); }
  function loadWorkflow() { return loadJSON(CONFIG.workflowKey); }
  function clearWorkflow() { removeKey(CONFIG.workflowKey); }
  function saveSlabMemory(obj) { saveJSON(CONFIG.slabMemoryKey, obj); }
  function loadSlabMemory() { return loadJSON(CONFIG.slabMemoryKey); }

  function getPDTDate() {
    const now = new Date();
    const pdtString = now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
    const pdt = new Date(pdtString);
    pdt.setHours(0, 0, 0, 0);
    return pdt;
  }

  function today() { return getPDTDate(); }
  function getTomorrowPDT() {
    const d = getPDTDate();
    d.setDate(d.getDate() + 1);
    return d;
  }

  function formatYMD(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return '';
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  }

  function parseMoney(text) {
    if (!text) return 0;
    const m = text.match(/\$([\d,]+(?:\.\d+)?)/);
    return m ? parseFloat(m[1].replace(/,/g, '')) : 0;
  }

  function parseDate(text) {
    if (!text) return null;
    const m = text.match(/\b([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})\b/);
    if (!m) return null;
    const d = new Date(m[1]);
    if (isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function getBoundary5thForCurrentCycle(baseDate) {
    const d = new Date(baseDate);
    const day = d.getDate();
    if (day >= 6) return new Date(d.getFullYear(), d.getMonth() + 1, 5);
    return new Date(d.getFullYear(), d.getMonth(), 5);
  }

  function daysToLastDate(baseDate) {
    const boundary = getBoundary5thForCurrentCycle(baseDate);
    return Math.floor((boundary.getTime() - baseDate.getTime()) / 86400000);
  }

  function getCyclePeriodId(baseDate) {
    const d = new Date(baseDate);
    const year = d.getFullYear();
    const month = d.getMonth();
    const day = d.getDate();
    const startYear = day >= 6 ? year : (month === 0 ? year - 1 : year);
    const startMonth = day >= 6 ? month : (month === 0 ? 11 : month - 1);
    return `${startYear}-${String(startMonth + 1).padStart(2, '0')}`;
  }

  function getWindow(baseDate) {
    const day = baseDate.getDate();
    if (day >= 6 && day <= 20) return 'A';
    if (day >= 21 && day <= 26) return 'B';
    return 'C';
  }

  function getEarningSlab(earnings) {
    if (earnings >= 10) return SLABS.S10_PLUS;
    if (earnings >= 5) return SLABS.S5_TO_9;
    if (earnings > 1) return SLABS.S1_TO_4;
    return SLABS.S0_TO_1;
  }

  function isOneDayBeforeTransfer(transferDate) {
    return formatYMD(transferDate) === formatYMD(getTomorrowPDT());
  }

  function isEarningsPage() { return location.pathname.startsWith('/earnings'); }
  function isPaymentSchedulePage() { return location.pathname === '/payment_schedule' || location.pathname.startsWith('/payment_schedule?'); }
  function isSubmitPage() { return location.pathname.startsWith('/payment_schedule/submit'); }
  function isHomePage() { return location.pathname === '/'; }

  function getEarnings() { return parseMoney(qs('.current-earnings h2')?.textContent || ''); }
  function getTransferDate() { return parseDate(qs('.current-earnings strong')?.textContent || ''); }

  function getSelectedCycle() {
    const el = qs('input[name="disbursement_schedule_form[frequency]"]:checked');
    return el ? parseInt(el.value, 10) : null;
  }

  function setSelectedCycle(days) {
    const el = qs(`input[name="disbursement_schedule_form[frequency]"][value="${days}"]`);
    if (!el) return false;
    el.checked = true;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.click();
    return true;
  }

  function selectBankAccount() {
    const bank = qs('input[name="disbursement_schedule_form[executor_type_name]"][value="GDS"]');
    if (!bank) return false;
    bank.checked = true;
    bank.dispatchEvent(new Event('input', { bubbles: true }));
    bank.dispatchEvent(new Event('change', { bubbles: true }));
    bank.click();
    return true;
  }

  function clickUpdate() {
    if (!selectBankAccount()) return false;
    const btn = qs('form input[type="submit"][value="Update"]') || qs('input[type="submit"][value="Update"]');
    if (!btn) return false;
    btn.click();
    return true;
  }

  function submitUpdateWithRetry(attempt = 1) {
    if (!clickUpdate()) { showBanner('Could not click Update.', '#c62828'); return; }
    if (attempt >= CONFIG.maxSubmitAttempts) return;
    setTimeout(() => {
      if (isPaymentSchedulePage()) {
        showBanner(`Update did not submit. Retrying...`, '#ef6c00');
        submitUpdateWithRetry(attempt + 1);
      }
    }, CONFIG.submitRetryDelayMs);
  }

  function clickConfirm() {
    const btn = qs('a[data-method="put"][href*="/payment_schedule/confirm"]') || qs('a.btn.btn-primary[href*="/payment_schedule/confirm"]');
    if (!btn) return false;
    btn.click();
    return true;
  }

  function confirmWithRetry(attempt = 1) {
    if (!clickConfirm()) return;
    if (attempt >= CONFIG.maxConfirmAttempts) return;
    setTimeout(() => {
      if (isSubmitPage()) {
        showBanner(`Confirm failed. Retrying...`, '#ef6c00');
        confirmWithRetry(attempt + 1);
      }
    }, CONFIG.confirmRetryDelayMs);
  }

  function buildContext(earnings, transferDate) {
    const baseDate = today();
    return {
      today: baseDate, todayYMD: formatYMD(baseDate), earnings, transferDate, transferDateYMD: formatYMD(transferDate),
      isOneDayBeforeTransfer: isOneDayBeforeTransfer(transferDate), periodId: getCyclePeriodId(baseDate),
      window: getWindow(baseDate), slab: getEarningSlab(earnings), lastDate: daysToLastDate(baseDate)
    };
  }

  function completeSlabTrigger(ctx, ruleId, reason) {
    saveSlabMemory({ periodId: ctx.periodId, slab: ctx.slab, ruleId, completedOn: ctx.todayYMD, reason });
    clearWorkflow();
  }

  function shouldStartNewTrigger(ctx) {
    const mem = loadSlabMemory();
    if (!mem) return true;
    if (mem.periodId !== ctx.periodId) return true;
    return mem.slab !== ctx.slab;
  }

  function startWorkflowForRule(ctx, ruleId, targetCycle) {
    saveWorkflow({ active: true, periodId: ctx.periodId, slab: ctx.slab, ruleId, targetCycle, step: 'START', createdOn: ctx.todayYMD });
  }

  function decideRule(ctx) {
    if (ctx.earnings >= 10 && ctx.isOneDayBeforeTransfer) return { type: 'DO_NOTHING', ruleId: RULES.R1_DO_NOTHING_10, reason: 'earnings >= 10' };
    if (ctx.window === 'A') {
      if (ctx.earnings < 10 && ctx.isOneDayBeforeTransfer) return { type: 'TARGET_CYCLE', ruleId: RULES.R2_FORCE_14_A, targetCycle: 14, reason: 'Window A < 10' };
      return null;
    }
    if (ctx.window === 'B') {
      if (ctx.earnings < 10 && ctx.isOneDayBeforeTransfer) return { type: 'TARGET_CYCLE', ruleId: RULES.R3_FORCE_7_B, targetCycle: 7, reason: 'Window B < 10' };
      return null;
    }
    if (ctx.window === 'C') {
      if (ctx.earnings <= 1) return { type: 'TARGET_CYCLE', ruleId: RULES.R4_FORCE_14_C_LOW, targetCycle: 14, reason: 'Window C <= 1' };
      if (ctx.earnings > 1 && ctx.earnings <= 4 && ctx.lastDate >= 7) return { type: 'TARGET_CYCLE', ruleId: RULES.R5_FORCE_7_C_MID, targetCycle: 7, reason: 'Window C Mid' };
      if (ctx.earnings > 1 && ctx.earnings <= 4 && ctx.lastDate > 3 && ctx.lastDate < 7) return { type: 'TARGET_CYCLE', ruleId: RULES.R5B_FORCE_3_C_MID, targetCycle: 3, reason: 'Window C Mid 3d' };
      if (ctx.earnings >= 5 && ctx.earnings < 10 && ctx.lastDate >= 3) return { type: 'TARGET_CYCLE', ruleId: RULES.R6_FORCE_3_C_HIGH, targetCycle: 3, reason: 'Window C High' };
      if (ctx.earnings >= 5 && ctx.earnings < 10 && ctx.lastDate < 3) return { type: 'DO_NOTHING', ruleId: RULES.R7_DO_NOTHING_C_HIGH_LATE, reason: 'Window C High Late' };
      return null;
    }
    return null;
  }

  function nextCycleTargetFromWorkflow(selectedCycle, wf) {
    const target = wf.targetCycle;
    if (target === 14) {
      if (wf.step === 'START') {
        if (selectedCycle === 14) return { nextCycle: 7, nextStep: 'AFTER_INTERMEDIATE', note: 'force bounce' };
        return { nextCycle: 14, nextStep: 'AFTER_FINAL', note: 'set 14' };
      }
      if (wf.step === 'AFTER_INTERMEDIATE') return { nextCycle: 14, nextStep: 'AFTER_FINAL', note: 'bounce return' };
    }
    if (target === 7) {
      if (wf.step === 'START') {
        if (selectedCycle === 7) return { nextCycle: 3, nextStep: 'AFTER_INTERMEDIATE', note: 'force bounce' };
        return { nextCycle: 7, nextStep: 'AFTER_FINAL', note: 'set 7' };
      }
      if (wf.step === 'AFTER_INTERMEDIATE') return { nextCycle: 7, nextStep: 'AFTER_FINAL', note: 'bounce return' };
    }
    if (target === 3) {
      if (wf.step === 'START') {
        if (selectedCycle === 3) return { nextCycle: 7, nextStep: 'AFTER_INTERMEDIATE', note: 'force bounce' };
        return { nextCycle: 3, nextStep: 'AFTER_FINAL', note: 'set 3' };
      }
      if (wf.step === 'AFTER_INTERMEDIATE') return { nextCycle: 3, nextStep: 'AFTER_FINAL', note: 'bounce return' };
    }
    return null;
  }

  function handleEarningsPage() {
    const state = loadState();
    const earnings = getEarnings();
    const transferDate = getTransferDate();
    if (!transferDate) return;

    if (state && state.phase === 'VERIFY_ON_EARNINGS') {
      clearState();
      showBanner('Returned to earnings page after submit.', '#2e7d32');
    }

    const ctx = buildContext(earnings, transferDate);
    const wf = loadWorkflow();

    if (wf && wf.active && wf.periodId === ctx.periodId) {
      if (wf.step === 'AFTER_FINAL') {
        completeSlabTrigger(ctx, wf.ruleId, 'workflow complete');
        return;
      }
      saveState({ phase: 'OPEN_PAYMENT_SCHEDULE', workflowContinuation: true, originalTransferDate: ctx.transferDateYMD, mustReturnToEarnings: true });
      if (CONFIG.autoOpenPaymentSchedule) { setTimeout(() => { location.href = '/payment_schedule'; }, CONFIG.redirectDelayMs); }
      return;
    }

    if (!shouldStartNewTrigger(ctx)) return;

    const decision = decideRule(ctx);
    if (!decision) return;

    if (decision.type === 'DO_NOTHING') {
      completeSlabTrigger(ctx, decision.ruleId, decision.reason);
      return;
    }

    if (decision.type === 'TARGET_CYCLE') {
      startWorkflowForRule(ctx, decision.ruleId, decision.targetCycle);
      saveState({ phase: 'OPEN_PAYMENT_SCHEDULE', workflowContinuation: false, originalTransferDate: ctx.transferDateYMD, mustReturnToEarnings: true });
      showBanner(`Opening payment schedule...`, '#ef6c00');
      if (CONFIG.autoOpenPaymentSchedule) { setTimeout(() => { location.href = '/payment_schedule'; }, CONFIG.redirectDelayMs); }
    }
  }

  function handlePaymentSchedulePage() {
    const state = loadState();
    const wf = loadWorkflow();
    if (!state || !wf || !wf.active) return;

    const selectedCycle = getSelectedCycle();
    if (!selectedCycle) return;

    const move = nextCycleTargetFromWorkflow(selectedCycle, wf);
    if (!move) return;

    if (move.nextCycle === selectedCycle) {
      wf.step = 'AFTER_FINAL';
      saveWorkflow(wf);
      saveState({ ...state, phase: 'VERIFY_ON_EARNINGS', mustReturnToEarnings: true });
      setTimeout(() => { location.href = '/earnings'; }, CONFIG.homeRedirectDelayMs);
      return;
    }

    if (!setSelectedCycle(move.nextCycle)) return;

    wf.step = move.nextStep;
    saveWorkflow(wf);
    saveState({ ...state, phase: 'SUBMITTED', previousCycle: selectedCycle, nextCycle: move.nextCycle, mustReturnToEarnings: true });
    
    showBanner(`Changing cycle and submitting...`, '#1565c0');
    if (CONFIG.autoClickUpdate) { setTimeout(() => { submitUpdateWithRetry(1); }, CONFIG.submitDelayMs); }
  }

  function handleSubmitPage() {
    const state = loadState();
    if (!state) return;
    saveState({ ...state, phase: 'VERIFY_ON_EARNINGS', mustReturnToEarnings: true });
    showBanner('Clicking Confirm...', '#1565c0');
    setTimeout(() => { confirmWithRetry(1); }, CONFIG.confirmDelayMs);
    setTimeout(() => { location.href = '/earnings'; }, CONFIG.afterSubmitDelayMs);
  }

  function handleHomePage() {
    const state = loadState();
    if (!state) return;
    if (state.phase === 'SUBMITTED' || state.phase === 'VERIFY_ON_EARNINGS' || state.mustReturnToEarnings) {
      setTimeout(() => { location.href = '/earnings'; }, CONFIG.homeRedirectDelayMs);
    }
  }

  async function init() {
    try {
      showBanner('Verifying security...', '#57606a');
      const [authorizedIds, myId] = await Promise.all([getAuthorizedIds(), getMyWorkerId()]);

      if (!myId || !authorizedIds.includes(myId)) {
        showLockScreen();
        return;
      }

      showBanner('Security Verified.', '#2e7d32');
      setTimeout(() => {
        const el = document.getElementById('nmshn-cycle-banner');
        if (el) el.style.display = 'none';
      }, 2000);

      if (isEarningsPage()) {
        handleEarningsPage();
      } else if (isPaymentSchedulePage()) {
        handlePaymentSchedulePage();
      } else if (isSubmitPage()) {
        handleSubmitPage();
      } else if (isHomePage()) {
        handleHomePage();
      }
    } catch (err) {
      console.error('[N*M*S*H*N] Init error:', err);
    }
  }

  init();
})();
