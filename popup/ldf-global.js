/* ========================================================================
   LDF GLOBAL - Script de Atribuição e DataLayer Base
   
   Roda em TODAS as páginas.
   - Lê parâmetros da URL (partner_id, UTMs)
   - Persiste no localStorage (sobrevive entre sessões)
   - Cria session_id no sessionStorage
   - Exporta helpers para tracking
   ======================================================================== */

(function () {
  'use strict';

  // Garante dataLayer
  window.dataLayer = window.dataLayer || [];

  // ============================================================
  // HELPERS
  // ============================================================

  /**
   * Lê um parâmetro da URL atual
   */
  function getParam(name) {
    try {
      const url = new URL(window.location.href);
      return url.searchParams.get(name);
    } catch (e) {
      // Fallback para file:// protocol
      const params = new URLSearchParams(window.location.search);
      return params.get(name);
    }
  }

  /**
   * Prioridade: URL > localStorage > fallback
   */
  function getStoredOrParam(name, fallback) {
    fallback = fallback || '';
    return getParam(name) || localStorage.getItem('ldf_' + name) || fallback;
  }

  /**
   * Gera ou recupera session_id (por sessão do browser)
   */
  function getSessionId() {
    const key = 'ldf_session_id';
    let sid = sessionStorage.getItem(key);
    if (!sid) {
      sid = 'sid_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
      sessionStorage.setItem(key, sid);
    }
    return sid;
  }

  // ============================================================
  // PERSISTÊNCIA DE ATRIBUIÇÃO
  // ============================================================

  /**
   * Salva parâmetros no localStorage quando presentes na URL.
   * Isso garante que o partner_id e UTMs sobrevivam navegação e refreshes.
   */
  function persistAttribution() {
    const keys = [
      'partner_id',
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_content',
      'utm_term'
    ];

    keys.forEach(function (key) {
      const value = getParam(key);
      if (value) {
        localStorage.setItem('ldf_' + key, value);
      }
    });

    // partner_id também pode vir como 'pid'
    const pid = getParam('pid');
    if (pid && !getParam('partner_id')) {
      localStorage.setItem('ldf_partner_id', pid);
    }
  }

  // ============================================================
  // DADOS DE TRACKING GLOBAIS
  // ============================================================

  /**
   * Retorna objeto completo de tracking para qualquer evento.
   * Usado como base para popup, cookie banner, e qualquer outro push.
   */
  function getTrackingData() {
    return {
      partner_id: getStoredOrParam('partner_id', 'direct'),
      utm_source: getStoredOrParam('utm_source'),
      utm_medium: getStoredOrParam('utm_medium'),
      utm_campaign: getStoredOrParam('utm_campaign'),
      utm_content: getStoredOrParam('utm_content'),
      utm_term: getStoredOrParam('utm_term'),
      page_url: window.location.href,
      page_path: window.location.pathname,
      page_title: document.title,
      referrer: document.referrer || '',
      session_id: getSessionId(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Push genérico de evento no dataLayer
   */
  function pushEvent(eventName, extra) {
    extra = extra || {};
    var payload = Object.assign({}, { event: eventName }, getTrackingData(), extra);
    window.dataLayer.push(payload);
    console.log('%c[LDF dataLayer]', 'color: #3b82f6; font-weight: bold;', eventName, payload);
  }

  // ============================================================
  // PUSH DE EVENTO PARA POPUP (atalho)
  // ============================================================

  function pushPopupEvent(eventName, extra) {
    extra = extra || {};
    pushEvent(eventName, Object.assign({
      popup_name: 'ldf_exit_popup',
      form_name: 'ldf_lead_capture'
    }, extra));
  }

  // ============================================================
  // INIT
  // ============================================================

  persistAttribution();

  // ============================================================
  // EXPORTA API GLOBAL
  // ============================================================

  window.LDFGlobal = {
    getParam: getParam,
    getStoredOrParam: getStoredOrParam,
    getSessionId: getSessionId,
    getTrackingData: getTrackingData,
    pushEvent: pushEvent,
    pushPopupEvent: pushPopupEvent,
    persistAttribution: persistAttribution
  };

  console.log('[LDF Global] Atribuição carregada.', {
    partner_id: getStoredOrParam('partner_id', 'direct'),
    utm_source: getStoredOrParam('utm_source'),
    session_id: getSessionId()
  });

})();
