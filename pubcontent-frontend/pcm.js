/* ================================================================
   PCM.js — 공공콘텐츠마켓 공통 상태 관리 모듈 v3
   모든 HTML에서 <script src="pcm.js"></script>로 로드
   ================================================================ */

const PCM = (() => {
  /* ── 기본 스토리지 ── */
  const KEY = k => 'pcm_' + k;
  const set  = (k, v)  => { try { sessionStorage.setItem(KEY(k), JSON.stringify(v)); } catch(e) {} };
  const get  = (k, d=null) => { try { const v = sessionStorage.getItem(KEY(k)); return v != null ? JSON.parse(v) : d; } catch(e) { return d; } };
  const del  = k => sessionStorage.removeItem(KEY(k));

  /* ── 금액 계산 ── */
  const breakdown = vatIncl => {
    const supply = Math.round(vatIncl / 1.1);
    return { vatIncl, supply, vat: vatIncl - supply, comm: Math.round(supply * 0.05), biz: Math.round(supply * 0.95) };
  };
  const fw  = v => Math.round(v).toLocaleString() + '원';
  const fmw = v => (Math.round(v) / 10000).toLocaleString() + '만원';

  /* ── 과업 / 견적 공유 ── */
  const saveTask   = t => set('currentTask', t);
  const getTask    = ()  => get('currentTask', null);
  const saveQuote  = q => set('latestQuote', q);
  const getQuote   = ()  => get('latestQuote', null);
  const getConfirmedAmount = () => get('confirmedAmount', null);

  /* ── 프로젝트 목록 ── */
  const getProjects = () => get('projects', []);
  const saveProject = p => {
    const list = getProjects();
    const idx = list.findIndex(x => x.id === p.id);
    if (idx >= 0) list[idx] = p; else list.unshift(p);
    set('projects', list.slice(0, 50));
  };

  /* ── 알림 시스템 ── */
  const pushNotif = n => {
    const list = get('notifs', []);
    list.unshift({ id: 'n-' + Date.now(), unread: true, time: '방금', ...n });
    set('notifs', list.slice(0, 50));
    _updateBadge();
  };
  const getNotifs  = () => get('notifs', []);
  const markRead   = () => { set('notifs', getNotifs().map(n => ({ ...n, unread: false }))); _updateBadge(); };
  const unreadCount = () => getNotifs().filter(n => n.unread).length;
  const _updateBadge = () => {
    const cnt = unreadCount();
    document.querySelectorAll('[data-notif-badge]').forEach(el => {
      el.textContent = cnt || '';
      el.style.display = cnt ? '' : 'none';
    });
  };

  /* ── 로딩 버튼 ── */
  const showLoading = (btn, text = '처리 중...') => {
    if (!btn) return;
    btn._origHTML = btn.innerHTML;
    btn.disabled = true;
    if (!document.getElementById('pcmSpinStyle')) {
      const s = document.createElement('style');
      s.id = 'pcmSpinStyle';
      s.textContent = '@keyframes pcmSpin{to{transform:rotate(360deg)}}';
      document.head.appendChild(s);
    }
    btn.innerHTML = `<span style="display:inline-block;width:14px;height:14px;border:2px solid currentColor;border-top-color:transparent;border-radius:50%;animation:pcmSpin .7s linear infinite;vertical-align:middle;margin-right:6px;"></span>${text}`;
  };
  const hideLoading = btn => {
    if (btn && btn._origHTML != null) { btn.disabled = false; btn.innerHTML = btn._origHTML; }
  };

  /* ── 토스트 ── */
  const toast = (msg, type = 'info') => {
    const colors = { info: '#1a1f2e', success: '#1a6b4a', error: '#dc3545', warn: '#b45309' };
    const icons  = { info: 'ℹ️', success: '✅', error: '❌', warn: '⚠️' };
    let t = document.getElementById('pcmToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'pcmToast';
      t.style.cssText = 'position:fixed;bottom:24px;right:24px;border-radius:10px;padding:12px 18px;font-size:13px;font-family:sans-serif;z-index:9999;transition:all .3s;opacity:0;transform:translateY(60px);display:flex;align-items:center;gap:8px;max-width:340px;box-shadow:0 4px 24px rgba(0,0,0,.22);color:#fff;pointer-events:none;';
      document.body.appendChild(t);
    }
    t.style.background = colors[type] || colors.info;
    t.innerHTML = `<span style="flex-shrink:0;">${icons[type] || ''}</span><span>${msg}</span>`;
    t.style.opacity = '1';
    t.style.transform = 'translateY(0)';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(60px)'; }, 3400);
  };

  /* ── 폼 유효성 검사 ── */
  const validate = rules => {
    let ok = true;
    rules.forEach(({ id, label, required, minLen, type: ftype }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const v = (el.value || '').trim();
      let msg = '';
      if (required && !v) msg = `${label}을(를) 입력해주세요.`;
      else if (minLen && v.length < minLen) msg = `${label}은(는) ${minLen}자 이상이어야 합니다.`;
      else if (ftype === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) msg = '올바른 이메일 형식이 아닙니다.';
      let errEl = document.getElementById(id + '-err');
      if (!errEl) {
        errEl = document.createElement('div');
        errEl.id = id + '-err';
        errEl.style.cssText = 'font-size:11px;color:#dc3545;margin-top:3px;';
        if (el.parentNode) el.parentNode.appendChild(errEl);
      }
      if (msg) { ok = false; errEl.textContent = msg; el.style.setProperty('border-color', '#dc3545', 'important'); }
      else { errEl.textContent = ''; el.style.removeProperty('border-color'); }
    });
    return ok;
  };

  /* ── 폼 자동 임시저장 ── */
  const autoSave = (formId, storageKey) => {
    const form = document.getElementById(formId);
    if (!form) return;
    const save = () => {
      const data = {};
      form.querySelectorAll('input, select, textarea').forEach(el => { if (el.id) data[el.id] = el.value; });
      set(storageKey, data);
    };
    form.addEventListener('input', save);
    form.addEventListener('change', save);
    // 새로고침 경고
    window.addEventListener('beforeunload', e => {
      const saved = get(storageKey, {});
      if (Object.values(saved).some(v => v)) {
        e.preventDefault();
        e.returnValue = '작성 중인 내용이 있습니다. 페이지를 떠나시겠습니까?';
      }
    });
    // 기존 임시저장 복원
    const saved = get(storageKey, {});
    if (saved) {
      Object.entries(saved).forEach(([k, v]) => {
        const el = document.getElementById(k);
        if (el && !el.value) el.value = v;
      });
    }
  };

  /* ── 로그아웃 (세션 완전 정리) ── */
  const logout = () => {
    // PCM 키 전부 삭제
    const keys = Object.keys(sessionStorage).filter(k => k.startsWith('pcm_'));
    keys.forEach(k => sessionStorage.removeItem(k));
    // 기타 앱 키
    ['userType', 'userEmail', 'onboarded', 'onboarding_from'].forEach(k => sessionStorage.removeItem(k));
    window.location.href = '로그인.html';
  };

  /* ── 알림 렌더 헬퍼 (마이페이지 등에서 사용) ── */
  const renderNotifList = (containerId) => {
    const el = document.getElementById(containerId);
    if (!el) return;
    const notifs = getNotifs();
    markRead();
    if (!notifs.length) {
      el.innerHTML = '<div style="text-align:center;padding:32px;color:#8492a6;font-size:13px;">알림이 없습니다</div>';
      return;
    }
    el.innerHTML = notifs.slice(0, 20).map(n => `
      <div style="display:flex;gap:12px;padding:14px 0;border-bottom:1px solid rgba(0,0,0,0.08);cursor:pointer;">
        <div style="font-size:20px;flex-shrink:0;">${n.icon || '🔔'}</div>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:500;margin-bottom:2px;">${n.title || ''}</div>
          <div style="font-size:12px;color:#8492a6;">${n.sub || ''}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
          <div style="font-size:11px;color:#8492a6;white-space:nowrap;">${n.time || ''}</div>
          ${n.unread ? '<div style="width:8px;height:8px;border-radius:50%;background:#1a6b4a;flex-shrink:0;"></div>' : ''}
        </div>
      </div>`).join('');
  };

  /* ── 공개 API ── */
  return {
    set, get, del,
    breakdown, fw, fmw,
    saveTask, getTask, saveQuote, getQuote, getConfirmedAmount,
    saveProject, getProjects,
    pushNotif, getNotifs, markRead, unreadCount, renderNotifList,
    showLoading, hideLoading,
    toast, validate, autoSave, logout,
    _updateBadge,
  };
})();

/* 페이지 로드 시 뱃지 갱신 */
document.addEventListener('DOMContentLoaded', () => PCM._updateBadge());
