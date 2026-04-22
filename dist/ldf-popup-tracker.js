/* ========================================================================
   LDF POPUP TRACKER — Script Autônomo v2.0
   ========================================================================
   
   Pacote 100% standalone. Instale em qualquer domínio com:
   
   <script>
   window.LDF_POPUP_CONFIG = {
     ga4_id: 'G-B8GQREK0F3',
     meta_pixel_id: '2079410829306095',
     webhook_url: 'https://seu-n8n/webhook/ldf-leads'
   };
   </script>
   <link rel="stylesheet" href="ldf-popup-tracker.css">
   <script src="ldf-popup-tracker.js" defer></script>
   
   ======================================================================== */

(function () {
  'use strict';

  // ================================================================
  // 1. CONFIGURAÇÃO
  // ================================================================

  var DEFAULTS = {
    // Identificadores fixos
    popup_name: 'ldf_exit_popup',
    form_name: 'ldf_lead_capture',

    // IDs de tracking (vazio = desabilitado)
    ga4_id: 'G-B8GQREK0F3',
    meta_pixel_id: '2079410829306095',

    // Webhook (fonte de verdade)
    webhook_url: '',

    // Parâmetros de parceiro
    partner_param: 'partner_id',
    alternate_partner_param: 'affiliate_id',

    // Timings — Desktop
    min_time_on_page_desktop: 8000,

    // Timings — Mobile
    min_time_on_page_mobile: 12000,
    min_scroll_percent_mobile: 40,
    mobile_idle_timeout: 8000,

    // Controle de exibição
    hide_after_close_hours: 24,
    hide_after_submit_days: 30,

    // Paths
    allowed_paths: ['*'],
    blocked_paths: ['/obrigado', '/sucesso', '/confirmacao'],

    // Storage keys
    cookie_storage_key: 'ldf_cookie_consent',
    attribution_storage_key: 'ldf_attribution',
    popup_closed_storage_key: 'ldf_popup_closed_at',
    popup_submitted_storage_key: 'ldf_popup_submitted_at',
    session_storage_key: 'ldf_session_id',

    // Visual
    primary_color: '#2346b5',
    accent_color: '#f7b500',
    z_index: 999999,

    // Textos
    badge_text: 'OFERTA ESPECIAL',
    headline: 'Que tal concorrer a <span>10 mil reais</span> todo mês? Saiba como!',
    subtitle: 'Deixe seu contato e receba uma proposta exclusiva com condições especiais.',
    cta_text: 'Quero receber minha proposta',
    success_title: 'Recebemos seus dados!',
    success_text: 'Em breve, um consultor entrará em contato com uma proposta exclusiva para você.',
    trust_text: 'Seus dados estão seguros. Entraremos em contato com sua proposta.',
    cookie_text: 'Usamos cookies para melhorar sua experiência, personalizar conteúdo e analisar nosso tráfego. Ao clicar em "Aceitar", você concorda com o uso de cookies analíticos e de marketing.',
    cookie_policy_url: '#'
  };

  // Merge user config com defaults
  var CFG = {};
  var userCfg = window.LDF_POPUP_CONFIG || {};
  for (var k in DEFAULTS) {
    if (DEFAULTS.hasOwnProperty(k)) {
      CFG[k] = userCfg.hasOwnProperty(k) ? userCfg[k] : DEFAULTS[k];
    }
  }
  window.LDF_POPUP_CONFIG = CFG;

  // ================================================================
  // 2. UTILITÁRIOS
  // ================================================================

  function isMobile() {
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;
  }

  function generateSessionId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'sid_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
  }

  function getScrollPercent() {
    var h = document.documentElement;
    var b = document.body;
    var st = h.scrollTop || b.scrollTop;
    var sh = h.scrollHeight || b.scrollHeight;
    var ch = h.clientHeight;
    if (sh - ch <= 0) return 100;
    return Math.round((st / (sh - ch)) * 100);
  }

  function darkenHex(hex, pct) {
    hex = hex.replace('#', '');
    var r = Math.max(0, Math.round(parseInt(hex.substring(0, 2), 16) * (1 - pct / 100)));
    var g = Math.max(0, Math.round(parseInt(hex.substring(2, 4), 16) * (1 - pct / 100)));
    var b = Math.max(0, Math.round(parseInt(hex.substring(4, 6), 16) * (1 - pct / 100)));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function applyCSSVars() {
    var r = document.documentElement;
    if (CFG.primary_color) {
      r.style.setProperty('--ldf-primary', CFG.primary_color);
      r.style.setProperty('--ldf-primary-dark', darkenHex(CFG.primary_color, 15));
    }
    if (CFG.accent_color) r.style.setProperty('--ldf-accent', CFG.accent_color);
    if (CFG.z_index) {
      r.style.setProperty('--ldf-z-popup', String(CFG.z_index));
      r.style.setProperty('--ldf-z-cookie', String(CFG.z_index - 1));
    }
  }

  // ================================================================
  // 3. FUNÇÃO 1: getQueryParam(name)
  //    Leitura de query string
  // ================================================================

  function getQueryParam(name) {
    try {
      return new URL(window.location.href).searchParams.get(name) || '';
    } catch (e) {
      var match = window.location.search.match(new RegExp('[?&]' + name + '=([^&]*)'));
      return match ? decodeURIComponent(match[1]) : '';
    }
  }

  // ================================================================
  // 4. FUNÇÃO 2: persistAttribution()
  //    Persiste atribuição em localStorage
  // ================================================================

  function persistAttribution() {
    var saved = {};
    try {
      var raw = localStorage.getItem(CFG.attribution_storage_key);
      if (raw) saved = JSON.parse(raw);
    } catch (e) { saved = {}; }

    // Partner ID: URL partner_id > URL affiliate_id > storage > 'direct'
    var urlPartner = getQueryParam(CFG.partner_param) || getQueryParam(CFG.alternate_partner_param);
    if (urlPartner) saved.partner_id = urlPartner;

    // UTMs da URL (só sobrescreve se presentes)
    var utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
    utmKeys.forEach(function (key) {
      var val = getQueryParam(key);
      if (val) saved[key] = val;
    });

    // First touch
    if (!saved.first_touch_timestamp) {
      saved.first_touch_timestamp = new Date().toISOString();
    }

    localStorage.setItem(CFG.attribution_storage_key, JSON.stringify(saved));

    // Session ID em sessionStorage
    if (!sessionStorage.getItem(CFG.session_storage_key)) {
      sessionStorage.setItem(CFG.session_storage_key, generateSessionId());
    }
  }

  // ================================================================
  // 5. FUNÇÃO 3: getAttributionData()
  //    Recupera dados persistidos com fallbacks
  // ================================================================

  function getAttributionData() {
    var saved = {};
    try {
      var raw = localStorage.getItem(CFG.attribution_storage_key);
      if (raw) saved = JSON.parse(raw);
    } catch (e) { /* silencioso */ }

    return {
      partner_id: saved.partner_id || 'direct',
      utm_source: saved.utm_source || '(not set)',
      utm_medium: saved.utm_medium || '(not set)',
      utm_campaign: saved.utm_campaign || '(not set)',
      utm_content: saved.utm_content || '(not set)',
      utm_term: saved.utm_term || '(not set)',
      first_touch_timestamp: saved.first_touch_timestamp || ''
    };
  }

  // ================================================================
  // 6. FUNÇÃO 4: getBaseEventData()
  //    Monta payload base para todos os eventos
  // ================================================================

  function getBaseEventData() {
    var attr = getAttributionData();
    return {
      popup_name: CFG.popup_name,
      form_name: CFG.form_name,
      partner_id: attr.partner_id,
      utm_source: attr.utm_source,
      utm_medium: attr.utm_medium,
      utm_campaign: attr.utm_campaign,
      utm_content: attr.utm_content,
      utm_term: attr.utm_term,
      page_url: window.location.href,
      page_path: window.location.pathname,
      page_title: document.title,
      referrer: document.referrer || '',
      session_id: sessionStorage.getItem(CFG.session_storage_key) || '',
      first_touch_timestamp: attr.first_touch_timestamp
    };
  }

  // ================================================================
  // 7. FUNÇÃO 5: pushEvent(eventName, extraData)
  //    Push universal no dataLayer
  // ================================================================

  function pushEvent(eventName, extraData) {
    window.dataLayer = window.dataLayer || [];
    var base = getBaseEventData();
    var payload = { event: eventName };

    // Merge base
    for (var bk in base) {
      if (base.hasOwnProperty(bk)) payload[bk] = base[bk];
    }

    // Merge extras (sobrescreve base se necessário)
    if (extraData) {
      for (var ek in extraData) {
        if (extraData.hasOwnProperty(ek)) payload[ek] = extraData[ek];
      }
    }

    window.dataLayer.push(payload);
    console.log('%c[LDF dataLayer]', 'color: #3b82f6; font-weight: bold;', eventName, payload);
  }

  // ================================================================
  // 8. FUNÇÃO 6: trackGA4(eventName, params)
  //    Tracking direto no GA4 via gtag
  // ================================================================

  var _ga4Ready = false;

  function initGA4() {
    if (!CFG.ga4_id || _ga4Ready) return;
    if (!isConsentAccepted()) return;

    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + CFG.ga4_id;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', CFG.ga4_id, { send_page_view: true });

    _ga4Ready = true;
    console.log('[LDF] GA4 inicializado:', CFG.ga4_id);
  }

  function trackGA4(eventName, params) {
    if (!_ga4Ready || typeof window.gtag !== 'function') return;
    // GA4 só após aceite de analytics
    if (!isConsentAccepted()) return;

    var base = getBaseEventData();
    var merged = {
      popup_name: base.popup_name,
      form_name: base.form_name,
      partner_id: base.partner_id,
      utm_source: base.utm_source,
      utm_medium: base.utm_medium,
      utm_campaign: base.utm_campaign,
      utm_content: base.utm_content,
      utm_term: base.utm_term,
      page_path: base.page_path,
      page_url: base.page_url,
      session_id: base.session_id
    };

    if (params) {
      for (var pk in params) {
        if (params.hasOwnProperty(pk)) merged[pk] = params[pk];
      }
    }

    try {
      window.gtag('event', eventName, merged);
    } catch (err) {
      console.warn('[LDF] GA4 track error:', err);
      pushEvent('popup_error', {
        error_type: 'ga4_track_error',
        error_message: err.message || 'GA4 event failed'
      });
    }
  }

  // ================================================================
  // 9. FUNÇÃO 7: trackMeta(eventName, params)
  //    Tracking direto no Meta Pixel via fbq
  // ================================================================

  var _metaReady = false;

  function initMeta() {
    if (!CFG.meta_pixel_id || _metaReady) return;
    // Meta só com consentimento de marketing
    if (!isConsentAccepted()) return;

    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0';
      n.queue = []; t = b.createElement(e); t.async = !0;
      t.src = v; s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

    window.fbq('init', CFG.meta_pixel_id);
    window.fbq('track', 'PageView');

    _metaReady = true;
    console.log('[LDF] Meta Pixel inicializado:', CFG.meta_pixel_id);
  }

  function trackMeta(eventName, params) {
    if (!_metaReady || typeof window.fbq !== 'function') return;
    // Meta só com marketing aceito
    if (!isConsentAccepted()) return;

    var base = getBaseEventData();
    var merged = {
      content_name: base.popup_name,
      form_name: base.form_name,
      partner_id: base.partner_id,
      utm_source: base.utm_source,
      utm_medium: base.utm_medium,
      utm_campaign: base.utm_campaign
    };

    if (params) {
      for (var pk in params) {
        if (params.hasOwnProperty(pk)) merged[pk] = params[pk];
      }
    }

    try {
      window.fbq('track', eventName, merged);
    } catch (err) {
      console.warn('[LDF] Meta track error:', err);
      pushEvent('popup_error', {
        error_type: 'meta_track_error',
        error_message: err.message || 'Meta event failed'
      });
    }
  }

  // ================================================================
  // 10. FUNÇÃO 8: submitLead(payload)
  //     Envio do lead para webhook
  // ================================================================

  function submitLead(payload) {
    var url = CFG.webhook_url;

    if (!url) {
      console.warn('[LDF] Webhook URL não configurada. Simulando envio...');
      return new Promise(function (resolve) {
        setTimeout(function () { resolve({ ok: true, status: 200 }); }, 1200);
      });
    }

    var controller = null;
    var timeoutId = null;

    // Timeout de 15s
    if (typeof AbortController !== 'undefined') {
      controller = new AbortController();
      timeoutId = setTimeout(function () { controller.abort(); }, 15000);
    }

    var fetchOpts = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    };
    if (controller) fetchOpts.signal = controller.signal;

    return fetch(url, fetchOpts)
      .then(function (res) {
        if (timeoutId) clearTimeout(timeoutId);
        if (!res.ok) {
          return { ok: false, status: res.status, error: 'webhook_invalid_response' };
        }
        return { ok: true, status: res.status };
      })
      .catch(function (err) {
        if (timeoutId) clearTimeout(timeoutId);
        var errorType = 'submit_failed';
        if (err.name === 'AbortError') errorType = 'webhook_timeout';
        return { ok: false, status: 0, error: errorType, message: err.message };
      });
  }

  // ================================================================
  // 11. CONSENTIMENTO — Cookie Banner
  // ================================================================

  function getConsentData() {
    try {
      var raw = localStorage.getItem(CFG.cookie_storage_key);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      // Expiração de 180 dias
      if (parsed.savedAt) {
        var days = (Date.now() - parsed.savedAt) / (1000 * 60 * 60 * 24);
        if (days > 180) { localStorage.removeItem(CFG.cookie_storage_key); return null; }
      }
      return parsed;
    } catch (e) { return null; }
  }

  function isConsentAccepted() {
    var c = getConsentData();
    return c !== null && c.status === 'accepted';
  }

  function isConsentRejected() {
    var c = getConsentData();
    return c !== null && c.status === 'rejected';
  }

  function hasConsentResponded() {
    return getConsentData() !== null;
  }

  function saveConsent(accepted) {
    var data = {
      status: accepted ? 'accepted' : 'rejected',
      analytics: !!accepted,
      marketing: !!accepted,
      savedAt: Date.now()
    };
    localStorage.setItem(CFG.cookie_storage_key, JSON.stringify(data));
    return data;
  }

  function injectCookieBanner() {
    if (document.getElementById('ldf-cookie-banner')) return;

    var html = ''
      + '<div class="ldf-cookie-banner" id="ldf-cookie-banner" role="dialog" aria-label="Consentimento de cookies">'
      + '  <div class="ldf-cookie-inner">'
      + '    <div class="ldf-cookie-text">'
      + '      <p>' + CFG.cookie_text + ' '
      + '      <a href="' + CFG.cookie_policy_url + '">Política de Privacidade</a></p>'
      + '    </div>'
      + '    <div class="ldf-cookie-actions">'
      + '      <button class="ldf-cookie-btn ldf-cookie-btn-accept" id="ldf-cookie-accept">Aceitar</button>'
      + '      <button class="ldf-cookie-btn ldf-cookie-btn-reject" id="ldf-cookie-reject">Recusar</button>'
      + '    </div>'
      + '  </div>'
      + '</div>';

    var wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper.firstElementChild);
  }

  function showCookieBanner() {
    var banner = document.getElementById('ldf-cookie-banner');
    if (!banner) return;

    requestAnimationFrame(function () {
      banner.classList.add('ldf-visible');
    });

    // Evento: cookie_banner_view
    pushEvent('cookie_banner_view', {});
  }

  function hideCookieBanner() {
    var banner = document.getElementById('ldf-cookie-banner');
    if (banner) banner.classList.remove('ldf-visible');
  }

  function handleCookieAccept() {
    var consent = saveConsent(true);
    hideCookieBanner();

    // Evento: cookie_accept
    pushEvent('cookie_accept', {
      consent_analytics: true,
      consent_marketing: true
    });

    // GA4: cookie_accept
    trackGA4('cookie_accept', {
      consent_analytics: true,
      consent_marketing: true
    });

    // Google Consent Mode v2
    if (typeof window.gtag === 'function') {
      window.gtag('consent', 'update', {
        analytics_storage: 'granted',
        ad_storage: 'granted',
        ad_user_data: 'granted',
        ad_personalization: 'granted'
      });
    }

    // Agora que temos consentimento, inicializar GA4 e Meta
    initGA4();
    initMeta();
  }

  function handleCookieReject() {
    saveConsent(false);
    hideCookieBanner();

    // Evento: cookie_reject
    pushEvent('cookie_reject', {
      consent_analytics: false,
      consent_marketing: false
    });

    // Consent Mode v2 — negar tudo
    if (typeof window.gtag === 'function') {
      window.gtag('consent', 'update', {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied'
      });
    }
  }

  function initCookieBanner() {
    if (hasConsentResponded()) {
      // Já respondeu — aplica consent silenciosamente
      if (isConsentAccepted()) {
        if (typeof window.gtag === 'function') {
          window.gtag('consent', 'update', {
            analytics_storage: 'granted',
            ad_storage: 'granted',
            ad_user_data: 'granted',
            ad_personalization: 'granted'
          });
        }
      }
      return;
    }

    // Não respondeu — mostrar banner
    injectCookieBanner();

    var acceptBtn = document.getElementById('ldf-cookie-accept');
    var rejectBtn = document.getElementById('ldf-cookie-reject');
    if (acceptBtn) acceptBtn.addEventListener('click', handleCookieAccept);
    if (rejectBtn) rejectBtn.addEventListener('click', handleCookieReject);

    setTimeout(showCookieBanner, 800);
  }

  // ================================================================
  // 12. POPUP — HTML, validação, envio, exit intent
  // ================================================================

  var _popup = {
    isOpen: false,
    isSubmitting: false,
    triggered: false,
    pageLoadTime: Date.now(),
    maxScroll: 0,
    touched: {},
    mobileIdleTimer: null,
    lastInteraction: Date.now()
  };

  // --- Path checks ---

  function isBlockedPath() {
    var path = window.location.pathname.toLowerCase();
    return CFG.blocked_paths.some(function (bp) {
      return path.indexOf(bp.toLowerCase()) !== -1;
    });
  }

  function isAllowedPath() {
    if (CFG.allowed_paths.indexOf('*') !== -1) return true;
    var path = window.location.pathname.toLowerCase();
    return CFG.allowed_paths.some(function (ap) {
      return path.indexOf(ap.toLowerCase()) !== -1;
    });
  }

  function hasSubmittedRecently() {
    var ts = localStorage.getItem(CFG.popup_submitted_storage_key);
    if (!ts) return false;
    var days = (Date.now() - parseInt(ts, 10)) / (1000 * 60 * 60 * 24);
    return days < CFG.hide_after_submit_days;
  }

  function wasClosedRecently() {
    var ts = localStorage.getItem(CFG.popup_closed_storage_key);
    if (!ts) return false;
    var hours = (Date.now() - parseInt(ts, 10)) / (1000 * 60 * 60);
    return hours < CFG.hide_after_close_hours;
  }

  function canShowPopup() {
    if (_popup.isOpen || _popup.triggered) return false;
    if (hasSubmittedRecently()) return false;
    if (wasClosedRecently()) return false;
    if (isBlockedPath()) return false;
    if (!isAllowedPath()) return false;

    var minTime = isMobile() ? CFG.min_time_on_page_mobile : CFG.min_time_on_page_desktop;
    if ((Date.now() - _popup.pageLoadTime) < minTime) return false;

    if (isMobile() && _popup.maxScroll < CFG.min_scroll_percent_mobile) return false;

    return true;
  }

  // --- Validação ---

  function isValidName(v) { return v.trim().length >= 3; }
  function isValidEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()); }
  function isValidWhatsApp(v) {
    var d = v.replace(/\D/g, '');
    return d.length >= 10 && d.length <= 11;
  }

  function maskWhatsApp(v) {
    var d = v.replace(/\D/g, '');
    if (d.length > 11) d = d.slice(0, 11);
    if (d.length > 6) return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
    if (d.length > 2) return d.replace(/(\d{2})(\d{0,5})/, '($1) $2');
    return d;
  }

  function validateField(field, isSubmit) {
    if (!isSubmit && !_popup.touched[field]) return true;

    var input = document.getElementById('ldf-popup-' + field);
    var row = document.getElementById('ldf-row-' + field);
    var err = document.getElementById('ldf-err-' + field);
    if (!input || !row || !err) return true;

    var val = input.value;
    var valid = true;

    if (field === 'nome') valid = isValidName(val);
    if (field === 'email') valid = isValidEmail(val);
    if (field === 'whatsapp') valid = isValidWhatsApp(val);

    if (valid) {
      row.classList.remove('ldf-has-error');
      err.classList.remove('ldf-visible');
    } else {
      row.classList.add('ldf-has-error');
      err.classList.add('ldf-visible');
    }
    return valid;
  }

  function resetFormUI() {
    _popup.touched = {};
    ['nome', 'email', 'whatsapp'].forEach(function (f) {
      var input = document.getElementById('ldf-popup-' + f);
      var row = document.getElementById('ldf-row-' + f);
      var err = document.getElementById('ldf-err-' + f);
      if (input) input.value = '';
      if (row) row.classList.remove('ldf-has-error');
      if (err) err.classList.remove('ldf-visible');
    });

    var formArea = document.getElementById('ldf-popup-form-area');
    var successArea = document.getElementById('ldf-popup-success');
    if (formArea) formArea.style.display = '';
    if (successArea) { successArea.classList.remove('ldf-visible'); successArea.style.display = ''; }

    var btn = document.getElementById('ldf-popup-submit');
    if (btn) {
      btn.classList.remove('ldf-loading');
      btn.disabled = false;
      btn.innerHTML = '<span class="ldf-cta-text">' + CFG.cta_text + '</span><span class="ldf-spinner"></span>';
      btn.style.background = '';
    }
  }

  // --- Inject HTML ---

  function injectPopupHTML() {
    if (document.getElementById('ldf-exit-popup')) return;

    var h = ''
      + '<div class="ldf-popup-overlay" id="ldf-exit-popup" role="dialog" aria-modal="true" aria-labelledby="ldf-popup-title">'
      + '<div class="ldf-popup-container">'

      // Header
      + '<div class="ldf-popup-header">'
      + '  <button class="ldf-popup-close" id="ldf-popup-close-btn" aria-label="Fechar" title="Fechar">&times;</button>'
      + '  <div class="ldf-popup-badge">&#9733; ' + CFG.badge_text + '</div>'
      + '  <h2 class="ldf-popup-headline" id="ldf-popup-title">' + CFG.headline + '</h2>'
      + '  <p class="ldf-popup-subtitle">' + CFG.subtitle + '</p>'
      + '</div>'

      // Body (form)
      + '<div class="ldf-popup-body" id="ldf-popup-form-area">'
      + '  <form class="ldf-popup-form" id="ldf-popup-form" novalidate>'

      // Nome
      + '    <div class="ldf-popup-field">'
      + '      <div class="ldf-popup-input-row" id="ldf-row-nome">'
      + '        <span class="ldf-popup-icon">&#128100;</span>'
      + '        <input type="text" class="ldf-popup-input" id="ldf-popup-nome" name="nome"'
      + '          placeholder="Seu nome" autocomplete="given-name" aria-label="Nome" required>'
      + '      </div>'
      + '      <span class="ldf-popup-error-msg" id="ldf-err-nome">Informe seu nome (mínimo 3 caracteres).</span>'
      + '    </div>'

      // Email
      + '    <div class="ldf-popup-field">'
      + '      <div class="ldf-popup-input-row" id="ldf-row-email">'
      + '        <span class="ldf-popup-icon">&#9993;</span>'
      + '        <input type="email" class="ldf-popup-input" id="ldf-popup-email" name="email"'
      + '          placeholder="Seu melhor e-mail" autocomplete="email" aria-label="E-mail" required>'
      + '      </div>'
      + '      <span class="ldf-popup-error-msg" id="ldf-err-email">Informe um e-mail válido.</span>'
      + '    </div>'

      // WhatsApp
      + '    <div class="ldf-popup-field">'
      + '      <div class="ldf-popup-input-row" id="ldf-row-whatsapp">'
      + '        <span class="ldf-popup-icon">&#128241;</span>'
      + '        <input type="tel" class="ldf-popup-input" id="ldf-popup-whatsapp" name="whatsapp"'
      + '          placeholder="WhatsApp com DDD" autocomplete="tel" aria-label="WhatsApp" required>'
      + '      </div>'
      + '      <span class="ldf-popup-error-msg" id="ldf-err-whatsapp">Informe um WhatsApp válido com DDD.</span>'
      + '    </div>'

      // CTA
      + '    <button type="submit" class="ldf-popup-cta" id="ldf-popup-submit">'
      + '      <span class="ldf-cta-text">' + CFG.cta_text + '</span>'
      + '      <span class="ldf-spinner"></span>'
      + '    </button>'

      + '  </form>'
      + '  <div class="ldf-popup-trust">&#128274; <span>' + CFG.trust_text + '</span></div>'
      + '</div>'

      // Success
      + '<div class="ldf-popup-success" id="ldf-popup-success">'
      + '  <div class="ldf-popup-success-icon">&#10004;</div>'
      + '  <h3 class="ldf-popup-success-title">' + CFG.success_title + '</h3>'
      + '  <p class="ldf-popup-success-text">' + CFG.success_text + '</p>'
      + '</div>'

      + '</div></div>';

    var wrap = document.createElement('div');
    wrap.innerHTML = h;
    document.body.appendChild(wrap.firstElementChild);
  }

  // --- Abrir popup ---

  function openPopup() {
    if (!canShowPopup()) return;

    var overlay = document.getElementById('ldf-exit-popup');
    if (!overlay) return;

    resetFormUI();
    overlay.classList.add('ldf-active');
    _popup.isOpen = true;
    _popup.triggered = true;
    document.body.style.overflow = 'hidden';

    // Focus no primeiro campo
    setTimeout(function () {
      var first = document.getElementById('ldf-popup-nome');
      if (first) first.focus();
    }, 500);

    // Evento: popup_view
    pushEvent('popup_view', {});

    // GA4: popup_view
    trackGA4('popup_view', {});

    // Meta: ViewContent
    trackMeta('ViewContent', {
      content_name: CFG.popup_name,
      partner_id: getAttributionData().partner_id,
      page_path: window.location.pathname
    });
  }

  // --- Fechar popup ---
  // close_type: 'manual' | 'overlay_click' | 'esc' | 'auto_hide'

  function closePopup(closeType) {
    var overlay = document.getElementById('ldf-exit-popup');
    if (!overlay) return;

    overlay.classList.remove('ldf-active');
    _popup.isOpen = false;
    document.body.style.overflow = '';

    // Salva timestamp de fechamento (exceto auto_hide pós-submit)
    if (closeType !== 'auto_hide') {
      localStorage.setItem(CFG.popup_closed_storage_key, Date.now().toString());
    }

    // Evento: popup_close
    pushEvent('popup_close', {
      close_type: closeType || 'manual'
    });

    // GA4: popup_close
    trackGA4('popup_close', {
      close_type: closeType || 'manual'
    });
  }

  // --- Submit do formulário ---

  function handleFormSubmit(e) {
    e.preventDefault();
    if (_popup.isSubmitting) return;

    // Marcar todos como touched e validar
    _popup.touched.nome = true;
    _popup.touched.email = true;
    _popup.touched.whatsapp = true;

    var vNome = validateField('nome', true);
    var vEmail = validateField('email', true);
    var vWhatsapp = validateField('whatsapp', true);

    if (!vNome || !vEmail || !vWhatsapp) {
      var invalidFields = [];
      if (!vNome) invalidFields.push('nome');
      if (!vEmail) invalidFields.push('email');
      if (!vWhatsapp) invalidFields.push('whatsapp');

      // Evento: popup_error (validação)
      pushEvent('popup_error', {
        error_type: 'validation_failed',
        error_message: 'Campos inválidos: ' + invalidFields.join(', ')
      });

      trackGA4('popup_error', {
        error_type: 'validation_failed',
        error_message: 'Campos inválidos: ' + invalidFields.join(', ')
      });

      return;
    }

    // Dados do formulário
    var nome = document.getElementById('ldf-popup-nome').value.trim();
    var email = document.getElementById('ldf-popup-email').value.trim();
    var whatsapp = document.getElementById('ldf-popup-whatsapp').value.trim();

    // Evento: popup_submit
    pushEvent('popup_submit', {});

    // GA4: popup_submit
    trackGA4('popup_submit', {});

    // Meta: Lead
    trackMeta('Lead', {
      content_name: CFG.popup_name,
      form_name: CFG.form_name,
      partner_id: getAttributionData().partner_id,
      utm_source: getAttributionData().utm_source,
      utm_medium: getAttributionData().utm_medium,
      utm_campaign: getAttributionData().utm_campaign
    });

    // Loading state
    setSubmitLoading(true);

    // Montar payload do webhook (spec §9)
    var base = getBaseEventData();
    var webhookPayload = {
      name: nome,
      email: email,
      whatsapp: whatsapp.replace(/\D/g, ''),
      popup_name: base.popup_name,
      form_name: base.form_name,
      partner_id: base.partner_id,
      utm_source: base.utm_source,
      utm_medium: base.utm_medium,
      utm_campaign: base.utm_campaign,
      utm_content: base.utm_content,
      utm_term: base.utm_term,
      page_url: base.page_url,
      page_path: base.page_path,
      page_title: base.page_title,
      referrer: base.referrer,
      session_id: base.session_id,
      timestamp: new Date().toISOString(),
      first_touch_timestamp: base.first_touch_timestamp,
      user_agent: navigator.userAgent
    };

    // Envio do lead (fonte de verdade)
    submitLead(webhookPayload).then(function (result) {
      if (result.ok && (result.status === 200 || result.status === 201)) {
        // SUCESSO — webhook respondeu 200/201

        // Marca como submetido
        localStorage.setItem(CFG.popup_submitted_storage_key, Date.now().toString());

        // Evento: lead_saved
        pushEvent('lead_saved', {
          destination: 'webhook'
        });

        // GA4: lead_saved
        trackGA4('lead_saved', {
          destination: 'webhook'
        });

        // GA4: generate_lead (evento padrão GA4)
        trackGA4('generate_lead', {
          currency: 'BRL',
          value: 0
        });

        // Meta: CompleteRegistration
        trackMeta('CompleteRegistration', {
          content_name: CFG.popup_name,
          partner_id: getAttributionData().partner_id
        });

        // Mostra sucesso
        showSuccessState();

        // Auto-hide após 4s
        setTimeout(function () { closePopup('auto_hide'); }, 4000);

      } else {
        // ERRO — webhook falhou
        var errType = result.error || 'submit_failed';
        var errMsg = result.message || 'Webhook retornou status ' + result.status;

        pushEvent('popup_error', {
          error_type: errType,
          error_message: errMsg
        });

        trackGA4('popup_error', {
          error_type: errType,
          error_message: errMsg
        });

        showSubmitError();
      }
    });
  }

  // --- UI helpers ---

  function setSubmitLoading(on) {
    _popup.isSubmitting = on;
    var btn = document.getElementById('ldf-popup-submit');
    if (!btn) return;
    if (on) { btn.classList.add('ldf-loading'); btn.disabled = true; }
    else { btn.classList.remove('ldf-loading'); btn.disabled = false; }
  }

  function showSuccessState() {
    setSubmitLoading(false);
    var formArea = document.getElementById('ldf-popup-form-area');
    var successArea = document.getElementById('ldf-popup-success');
    if (formArea) formArea.style.display = 'none';
    if (successArea) { successArea.style.display = 'block'; successArea.classList.add('ldf-visible'); }
  }

  function showSubmitError() {
    setSubmitLoading(false);
    var btn = document.getElementById('ldf-popup-submit');
    if (btn) {
      btn.innerHTML = '<span class="ldf-cta-text">Erro ao enviar. Tente novamente.</span>';
      btn.style.background = 'linear-gradient(135deg, #dc2626, #991b1b)';
      setTimeout(function () {
        btn.innerHTML = '<span class="ldf-cta-text">' + CFG.cta_text + '</span><span class="ldf-spinner"></span>';
        btn.style.background = '';
      }, 3000);
    }
  }

  // --- Exit Intent: Desktop ---

  function setupDesktopExitIntent() {
    document.addEventListener('mouseout', function (e) {
      if (e.clientY <= 0 && e.relatedTarget == null) {
        if (canShowPopup()) openPopup();
      }
    });
  }

  // --- Exit Intent: Mobile ---

  function setupMobileExitIntent() {
    // Idle timer
    var interactionEvents = ['touchstart', 'touchmove', 'scroll', 'click'];
    interactionEvents.forEach(function (evt) {
      document.addEventListener(evt, function () {
        _popup.lastInteraction = Date.now();
        resetMobileIdle();
      }, { passive: true });
    });

    resetMobileIdle();

    // Return-to-tab detection
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        setTimeout(function () { if (canShowPopup()) openPopup(); }, 500);
      }
    });
  }

  function resetMobileIdle() {
    if (_popup.mobileIdleTimer) clearTimeout(_popup.mobileIdleTimer);
    _popup.mobileIdleTimer = setTimeout(function () {
      if (canShowPopup()) openPopup();
    }, CFG.mobile_idle_timeout);
  }

  // --- Scroll tracking ---

  function setupScrollTracking() {
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (!ticking) {
        window.requestAnimationFrame(function () {
          var pct = getScrollPercent();
          if (pct > _popup.maxScroll) _popup.maxScroll = pct;
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  // --- Event listeners ---

  function setupPopupListeners() {
    // Fechar via botão
    var closeBtn = document.getElementById('ldf-popup-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', function () { closePopup('manual'); });

    // Fechar via overlay
    var overlay = document.getElementById('ldf-exit-popup');
    if (overlay) overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closePopup('overlay_click');
    });

    // Fechar via ESC
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && _popup.isOpen) closePopup('esc');
    });

    // Submit
    var form = document.getElementById('ldf-popup-form');
    if (form) form.addEventListener('submit', handleFormSubmit);

    // Máscara de WhatsApp
    var whatsInput = document.getElementById('ldf-popup-whatsapp');
    if (whatsInput) {
      whatsInput.addEventListener('input', function (e) {
        e.target.value = maskWhatsApp(e.target.value);
      });
    }

    // Blur + input validation
    ['nome', 'email', 'whatsapp'].forEach(function (field) {
      var input = document.getElementById('ldf-popup-' + field);
      if (!input) return;

      input.addEventListener('blur', function () {
        _popup.touched[field] = true;
        validateField(field, false);
      });

      input.addEventListener('input', function () {
        if (_popup.touched[field]) validateField(field, false);
      });
    });
  }

  // --- Init popup ---

  function initPopup() {
    if (hasSubmittedRecently()) return;
    if (isBlockedPath()) return;
    if (!isAllowedPath()) return;

    injectPopupHTML();
    setupPopupListeners();
    setupScrollTracking();

    if (isMobile()) {
      setupMobileExitIntent();
    } else {
      setupDesktopExitIntent();
    }
  }

  // --- Force open (debug/teste) ---

  function forceOpenPopup() {
    _popup.triggered = false;
    if (!document.getElementById('ldf-exit-popup')) {
      injectPopupHTML();
      setupPopupListeners();
    }
    resetFormUI();

    var overlay = document.getElementById('ldf-exit-popup');
    if (overlay) {
      overlay.classList.add('ldf-active');
      _popup.isOpen = true;
      _popup.triggered = true;
      document.body.style.overflow = 'hidden';
    }

    pushEvent('popup_view', {});
    trackGA4('popup_view', {});
    trackMeta('ViewContent', {
      content_name: CFG.popup_name,
      partner_id: getAttributionData().partner_id,
      page_path: window.location.pathname
    });
  }

  // ================================================================
  // 13. BOOT — Inicialização global
  // ================================================================

  function boot() {
    // CSS vars
    applyCSSVars();

    // dataLayer
    window.dataLayer = window.dataLayer || [];

    // Atribuição
    persistAttribution();

    // Cookie banner
    initCookieBanner();

    // Tracking (GA4 + Meta — só se já com consentimento)
    if (isConsentAccepted()) {
      initGA4();
      initMeta();
    }

    // Popup
    initPopup();

    // Log de boot
    var attr = getAttributionData();
    console.log(
      '%c[LDF Tracker v2.0]', 'color: #f7b500; font-weight: bold; font-size: 12px;',
      '\n  partner_id:', attr.partner_id,
      '\n  utm_source:', attr.utm_source,
      '\n  ga4:', CFG.ga4_id || '(off)',
      '\n  meta:', CFG.meta_pixel_id || '(off)',
      '\n  webhook:', CFG.webhook_url || '(simulação)',
      '\n  consent:', hasConsentResponded() ? (isConsentAccepted() ? 'accepted' : 'rejected') : 'pending'
    );
  }

  // DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // ================================================================
  // 14. API PÚBLICA — window.LDFTracker
  // ================================================================

  window.LDFTracker = {
    // Funções do spec
    getQueryParam: getQueryParam,
    persistAttribution: persistAttribution,
    getAttributionData: getAttributionData,
    getBaseEventData: getBaseEventData,
    pushEvent: pushEvent,
    trackGA4: trackGA4,
    trackMeta: trackMeta,
    submitLead: submitLead,

    // Popup
    openPopup: openPopup,
    closePopup: closePopup,
    forceOpenPopup: forceOpenPopup,

    // Consent
    isConsentAccepted: isConsentAccepted,
    isConsentRejected: isConsentRejected,

    // Atalhos
    getAttribution: getAttributionData,
    getSessionId: function () {
      return sessionStorage.getItem(CFG.session_storage_key) || '';
    },

    // Config
    config: CFG
  };

})();
