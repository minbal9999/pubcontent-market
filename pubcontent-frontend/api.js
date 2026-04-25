/* ================================================================
   api.js — 공공콘텐츠마켓 API 클라이언트
   모든 HTML 파일에서 <script src="api.js"></script>로 로드
   ================================================================ */

const API = (() => {

  // ── 설정 ──
  const BASE_URL = window.API_BASE_URL || 'http://localhost:4000/api';

  // ── 토큰 관리 ──
  function getToken()         { try { return sessionStorage.getItem('pcm_token'); } catch(e) { return null; } }
  function setToken(token)    { try { sessionStorage.setItem('pcm_token', token); } catch(e) {} }
  function removeToken()      { try { sessionStorage.removeItem('pcm_token'); } catch(e) {} }
  function getUser()          { try { return JSON.parse(sessionStorage.getItem('pcm_user') || 'null'); } catch(e) { return null; } }
  function setUser(user)      { try { sessionStorage.setItem('pcm_user', JSON.stringify(user)); } catch(e) {} }
  function isLoggedIn()       { return !!getToken(); }

  // ── 공통 fetch 래퍼 ──
  async function request(method, path, body = null, opts = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const config = { method, headers };
    if (body && method !== 'GET') config.body = JSON.stringify(body);

    try {
      const res  = await fetch(BASE_URL + path, config);
      const data = await res.json();

      // 토큰 만료 → 자동 로그아웃
      if (res.status === 401 && !opts.skipAuth) {
        removeToken();
        if (typeof PCM !== 'undefined') PCM.toast('세션이 만료되었습니다. 다시 로그인해주세요.', 'error');
        setTimeout(() => { window.location.href = '로그인.html'; }, 1500);
        return null;
      }

      if (!res.ok) {
        const msg = data.message || `오류가 발생했습니다. (${res.status})`;
        if (typeof PCM !== 'undefined') PCM.toast(msg, 'error');
        return { success: false, message: msg, data: null };
      }

      return data;
    } catch (err) {
      // 서버 연결 실패 → 더미 모드로 fallback
      console.warn('[API] 서버 연결 실패, 더미 모드로 동작:', path);
      return null; // null이면 호출부에서 더미 데이터 사용
    }
  }

  const get    = (path)        => request('GET',    path);
  const post   = (path, body)  => request('POST',   path, body);
  const put    = (path, body)  => request('PUT',    path, body);
  const del    = (path)        => request('DELETE', path);

  // ================================================================
  // 인증
  // ================================================================
  const auth = {

    async register(data) {
      const res = await post('/auth/register', data);
      if (res?.success) {
        setToken(res.data.token);
        setUser(res.data);
      }
      return res;
    },

    async login(email, password) {
      const res = await post('/auth/login', { email, password });
      if (res?.success) {
        setToken(res.data.token);
        setUser(res.data.user);
        // PCM sessionStorage와 동기화
        try {
          sessionStorage.setItem('userType',
            res.data.user.role === 'BUYER' ? 'public' :
            res.data.user.role === 'MAKER' ? 'maker' : 'expert');
          sessionStorage.setItem('userName', res.data.user.name);
          if (res.data.user.makerProfile) {
            sessionStorage.setItem('pcm_membership', res.data.user.makerProfile.membership?.toLowerCase() || 'none');
          }
        } catch(e) {}
      }
      return res;
    },

    logout() {
      removeToken();
      if (typeof PCM !== 'undefined') PCM.logout();
      else { sessionStorage.clear(); window.location.href = '로그인.html'; }
    },

    async me() {
      return get('/auth/me');
    },

    isLoggedIn,
    getUser,
    getToken,
  };

  // ================================================================
  // 프로젝트 (과업지시서)
  // ================================================================
  const projects = {

    async list(params = {}) {
      const qs = new URLSearchParams(params).toString();
      return get(`/projects${qs ? '?' + qs : ''}`);
    },

    async get(id) {
      return get(`/projects/${id}`);
    },

    async create(data) {
      const res = await post('/projects', data);
      if (res?.success) {
        // PCM 로컬 캐시에도 저장
        try {
          if (typeof PCM !== 'undefined') PCM.saveTask(res.data);
        } catch(e) {}
        if (typeof PCM !== 'undefined') PCM.toast('과업지시서가 등록되었습니다.', 'success');
      }
      return res;
    },

    async update(id, data) {
      return put(`/projects/${id}`, data);
    },

    async cancel(id) {
      return del(`/projects/${id}`);
    },
  };

  // ================================================================
  // 견적
  // ================================================================
  const quotes = {

    async received(projectId) {
      return get(`/quotes/received${projectId ? '?projectId=' + projectId : ''}`);
    },

    async sent() {
      return get('/quotes/sent');
    },

    async submit(data) {
      const res = await post('/quotes', data);
      if (res?.success) {
        if (typeof PCM !== 'undefined') {
          PCM.toast('견적이 제출되었습니다.', 'success');
          PCM.pushNotif({ icon: '📨', title: '견적 제출 완료', sub: '발주처 수락 시 알림을 드립니다.', time: '방금' });
        }
      }
      return res;
    },

    async accept(id) {
      const res = await post(`/quotes/${id}/accept`);
      if (res?.success) {
        if (typeof PCM !== 'undefined') PCM.toast('견적을 수락했습니다. 계약서를 확인해주세요.', 'success');
      }
      return res;
    },

    async reject(id) {
      return post(`/quotes/${id}/reject`);
    },
  };

  // ================================================================
  // 무통장 입금 결제
  // ================================================================
  const payments = {

    async initiate(projectId, depositorName) {
      const res = await post('/payments/initiate', { projectId, depositorName });
      if (res?.success) {
        try { sessionStorage.setItem('pcm_paymentInfo', JSON.stringify(res.data)); } catch(e) {}
        if (typeof PCM !== 'undefined') PCM.toast('입금 안내가 생성되었습니다.', 'success');
      }
      return res;
    },

    async status(projectId) {
      return get(`/payments/${projectId}`);
    },

    // 관리자용
    async confirm(paymentId, paidAt) {
      return post(`/payments/${paymentId}/confirm`, { paidAt });
    },

    async settle(paymentId, note) {
      return post(`/payments/${paymentId}/settle`, { settlementNote: note });
    },
  };

  // ================================================================
  // 납품/검수
  // ================================================================
  const deliveries = {

    async submit(projectId, description, fileUrls = []) {
      const res = await post('/deliveries', { projectId, description, fileUrls });
      if (res?.success) {
        if (typeof PCM !== 'undefined') {
          PCM.toast('납품물이 제출되었습니다. 검수가 시작됩니다.', 'success');
          PCM.pushNotif({ icon: '📦', title: '납품 완료', sub: '검수 진행 중입니다.', time: '방금' });
        }
      }
      return res;
    },

    async approve(projectId, comment) {
      const res = await post(`/deliveries/${projectId}/approve`, { comment });
      if (res?.success) {
        if (typeof PCM !== 'undefined') PCM.toast('최종 승인이 완료되었습니다. 정산이 진행됩니다.', 'success');
      }
      return res;
    },

    async requestRevision(projectId, description) {
      const res = await post(`/deliveries/${projectId}/revision`, { description });
      if (res?.success) {
        if (typeof PCM !== 'undefined') PCM.toast('수정 요청이 전달되었습니다.', 'info');
      }
      return res;
    },
  };

  // ================================================================
  // 정산
  // ================================================================
  const settlements = {
    async list() { return get('/settlements'); },
  };

  // ================================================================
  // 메시지
  // ================================================================
  const messages = {
    async list(projectId)       { return get(`/messages/${projectId}`); },
    async send(projectId, content) { return post('/messages', { projectId, content }); },
  };

  // ================================================================
  // 알림
  // ================================================================
  const notifications = {
    async list()    { return get('/notifications'); },
    async readAll() { return post('/notifications/read-all'); },

    // 폴링으로 새 알림 확인 (WebSocket 전까지)
    startPolling(intervalMs = 30000) {
      return setInterval(async () => {
        if (!isLoggedIn()) return;
        const res = await notifications.list();
        if (res?.success && res.unreadCount > 0) {
          // PCM 뱃지 갱신
          try {
            if (typeof PCM !== 'undefined') PCM._updateBadge();
          } catch(e) {}
        }
      }, intervalMs);
    },
  };

  // ================================================================
  // 멤버십
  // ================================================================
  const memberships = {

    async subscribe(tier, billingCycle = 'monthly') {
      const res = await post('/memberships/subscribe', { tier, billingCycle });
      if (res?.success) {
        try { sessionStorage.setItem('pcm_membership', tier.toLowerCase()); } catch(e) {}
        if (typeof PCM !== 'undefined') PCM.toast(`${tier} 멤버십 신청 완료! 입금 후 활성화됩니다.`, 'success');
      }
      return res;
    },
  };

  // ================================================================
  // 헬퍼 — 서버 연결 확인
  // ================================================================
  async function healthCheck() {
    try {
      const res = await fetch(BASE_URL.replace('/api', '') + '/health');
      const data = await res.json();
      return data.status === 'ok';
    } catch(e) {
      return false;
    }
  }

  // ================================================================
  // 더미 모드 감지 배너 (개발용)
  // ================================================================
  async function showConnectionStatus() {
    const isOnline = await healthCheck();
    if (!isOnline) {
      const banner = document.createElement('div');
      banner.style.cssText = [
        'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);',
        'background:#b45309;color:#fff;border-radius:8px;padding:8px 18px;',
        'font-size:12px;font-weight:600;z-index:9999;',
        'box-shadow:0 4px 12px rgba(0,0,0,.2);',
      ].join('');
      banner.textContent = '⚠ 오프라인 모드 — 백엔드 서버에 연결되지 않았습니다';
      document.body.appendChild(banner);
      setTimeout(() => banner.remove(), 5000);
    }
    return isOnline;
  }

  // 페이지 로드 시 연결 상태 확인
  if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
      showConnectionStatus();
    });
  }

  // ================================================================
  // Public API
  // ================================================================
  return {
    auth, projects, quotes, payments, deliveries,
    settlements, messages, notifications, memberships,
    healthCheck, showConnectionStatus,
    getToken, getUser, isLoggedIn,
  };

})();

// 전역 노출 (기존 PCM과 함께 사용)
window.API = API;
