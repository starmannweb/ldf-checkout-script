/* ========================================================================
   LDF EXIT POPUP - Componente Principal (v4)
   
   Regras de exibição:
   - LP/páginas comuns: abre no exit intent, a cada pageload
   - Checkout: abre UMA VEZ por sessão
   - Após enviar lead: NUNCA mais abre (30 dias)
   - Páginas bloqueadas: obrigado, sucesso, confirmação
   
   Desktop: mouse sai pela borda superior (clientY <= 0)
   Mobile: 12s na página + 40% scroll + visibilitychange
   
   Validação: erro APENAS após blur ou submit
   
   dataLayer Events:
   - popup_view       (ao abrir)
   - popup_close      (ao fechar: button, overlay, esc, timeout)
   - popup_submit     (ao enviar form)
   - lead_saved       (webhook confirmou)
   - popup_error      (validation, network, webhook_timeout)
   
   Depende de: ldf-global.js, tracking.js, popup.css
   ======================================================================== */

(function () {
  'use strict';

  // ============================================================
  // CONFIGURAÇÃO
  // ============================================================
  var DEFAULT_POPUP_CONFIG = {
    popupName: 'ldf_exit_popup',
    formName: 'ldf_lead_capture',
    desktopMinTime: 0,
    desktopMinScroll: 0,
    mobileMinTime: 8000,
    mobileMinScroll: 20,
    hideAfterSubmitDays: 30,
    webhookUrl: '',
    blockedPaths: ['/obrigado', '/sucesso', '/confirmacao'],
    checkoutPaths: ['/checkout'],
    ga4Id: '',
    metaPixelId: ''
  };

  var POPUP_CONFIG = Object.assign({}, DEFAULT_POPUP_CONFIG, window.LDF_POPUP_CONFIG || {});
  window.LDF_POPUP_CONFIG = POPUP_CONFIG;

  // ============================================================
  // STORAGE
  // ============================================================
  var STORAGE = {
    submitted: 'ldf_popup_submitted',
    sessionShown: 'ldf_popup_session_shown'  // sessionStorage
  };

  // ============================================================
  // ESTADO
  // ============================================================
  var state = {
    isOpen: false,
    isSubmitting: false,
    triggered: false,
    pageLoadTime: Date.now(),
    maxScroll: 0,
    isMobile: false,
    touched: {},
    mobileIdleTimer: null,
    lastInteraction: Date.now()
  };

  // ============================================================
  // UTILITÁRIOS
  // ============================================================

  function isMobileDevice() {
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;
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

  function getTimeOnPage() {
    return Date.now() - state.pageLoadTime;
  }

  function isBlockedPath() {
    var path = window.location.pathname.toLowerCase();
    // Para file:// local, check no href inteiro
    var href = window.location.href.toLowerCase();
    return POPUP_CONFIG.blockedPaths.some(function (bp) {
      return path.includes(bp) || href.includes(bp);
    });
  }

  function isCheckoutPage() {
    var path = window.location.pathname.toLowerCase();
    var href = window.location.href.toLowerCase();
    return POPUP_CONFIG.checkoutPaths.some(function (cp) {
      return path.includes(cp) || href.includes(cp);
    });
  }

  function hasAlreadySubmitted() {
    var submitted = localStorage.getItem(STORAGE.submitted);
    if (!submitted) return false;
    var daysSince = (Date.now() - parseInt(submitted, 10)) / (1000 * 60 * 60 * 24);
    return daysSince < POPUP_CONFIG.hideAfterSubmitDays;
  }

  function wasShownThisSession() {
    return sessionStorage.getItem(STORAGE.sessionShown) === 'true';
  }

  /**
   * Pode abrir?
   */
  function canShow() {
    if (state.isOpen) return false;
    if (hasAlreadySubmitted()) return false;
    if (isBlockedPath()) return false;

    // 1x por sessão (global para landing page e checkout)
    if (wasShownThisSession()) return false;

    // Tempo e scroll mínimos
    var minTime = state.isMobile ? POPUP_CONFIG.mobileMinTime : POPUP_CONFIG.desktopMinTime;
    var minScroll = state.isMobile ? POPUP_CONFIG.mobileMinScroll : POPUP_CONFIG.desktopMinScroll;

    if (getTimeOnPage() < minTime) return false;
    if (state.maxScroll < minScroll) return false;

    return true;
  }

  // ============================================================
  // VALIDAÇÕES
  // ============================================================

  function isValidEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
  }

  function isValidPhone(v) {
    var clean = v.replace(/\D/g, '');
    return clean.length >= 10 && clean.length <= 11;
  }

  function isValidName(v) {
    return v.trim().length >= 3;
  }

  function maskPhone(v) {
    var d = v.replace(/\D/g, '');
    if (d.length > 11) d = d.slice(0, 11);
    if (d.length > 6) return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
    if (d.length > 2) return d.replace(/(\d{2})(\d{0,5})/, '($1) $2');
    return d;
  }

  // ============================================================
  // HTML DO POPUP
  // ============================================================

  function injectHTML() {
    if (document.getElementById('ldf-exit-popup')) return;

    var html = ''
    + '<div class="ldf-popup-overlay" id="ldf-exit-popup" role="dialog" aria-modal="true" aria-labelledby="ldf-popup-title">'
    + '  <div class="ldf-popup-container">'
    + '    <div class="ldf-popup-header">'
    + '      <button class="ldf-popup-close" id="ldf-popup-close-btn" aria-label="Fechar" title="Fechar">'
    + '        <i class="fas fa-times"></i>'
    + '      </button>'
    + '      <div class="ldf-popup-badge">'
    + '        <i class="fas fa-shield-halved"></i>'
    + '        OFERTA ESPECIAL'
    + '      </div>'
    + '      <h2 class="ldf-popup-headline" id="ldf-popup-title">'
    + '        Que tal concorrer a <span>10 mil reais</span> todo mês?'
    + '      </h2>'
    + '      <p class="ldf-popup-subtitle">'
    + '        Deixe seus dados para saber como e receba uma proposta exclusiva.'
    + '      </p>'
    + '    </div>'
    + '    <div class="ldf-popup-body" id="ldf-popup-form-area">'
    + '      <form class="ldf-popup-form" id="ldf-popup-form" novalidate>'
    + '        <div class="ldf-popup-field">'
    + '          <div class="ldf-popup-input-row" id="ldf-row-nome">'
    + '            <span class="ldf-popup-icon"><i class="fas fa-user"></i></span>'
    + '            <input type="text" class="ldf-popup-input" id="ldf-popup-nome" name="nome"'
    + '              placeholder="Seu nome" autocomplete="given-name" aria-label="Nome" required>'
    + '          </div>'
    + '          <span class="ldf-popup-error-msg" id="ldf-err-nome">Informe seu nome (mínimo 3 caracteres).</span>'
    + '        </div>'
    + '        <div class="ldf-popup-field">'
    + '          <div class="ldf-popup-input-row" id="ldf-row-email">'
    + '            <span class="ldf-popup-icon"><i class="fas fa-envelope"></i></span>'
    + '            <input type="email" class="ldf-popup-input" id="ldf-popup-email" name="email"'
    + '              placeholder="Seu melhor e-mail" autocomplete="email" aria-label="E-mail" required>'
    + '          </div>'
    + '          <span class="ldf-popup-error-msg" id="ldf-err-email">Informe um e-mail válido.</span>'
    + '        </div>'
    + '        <div class="ldf-popup-field">'
    + '          <div class="ldf-popup-input-row" id="ldf-row-whatsapp">'
    + '            <span class="ldf-popup-icon"><i class="fab fa-whatsapp"></i></span>'
    + '            <input type="tel" class="ldf-popup-input" id="ldf-popup-whatsapp" name="whatsapp"'
    + '              placeholder="WhatsApp com DDD" autocomplete="tel" aria-label="WhatsApp" required>'
    + '          </div>'
    + '          <span class="ldf-popup-error-msg" id="ldf-err-whatsapp">Informe um WhatsApp válido com DDD.</span>'
    + '        </div>'
    + '        <input type="hidden" id="ldf-h-page_url" name="page_url">'
    + '        <input type="hidden" id="ldf-h-page_path" name="page_path">'
    + '        <input type="hidden" id="ldf-h-page_title" name="page_title">'
    + '        <input type="hidden" id="ldf-h-referrer" name="referrer">'
    + '        <input type="hidden" id="ldf-h-utm_source" name="utm_source">'
    + '        <input type="hidden" id="ldf-h-utm_medium" name="utm_medium">'
    + '        <input type="hidden" id="ldf-h-utm_campaign" name="utm_campaign">'
    + '        <input type="hidden" id="ldf-h-utm_content" name="utm_content">'
    + '        <input type="hidden" id="ldf-h-utm_term" name="utm_term">'
    + '        <input type="hidden" id="ldf-h-partner_id" name="partner_id">'
    + '        <input type="hidden" id="ldf-h-session_id" name="session_id">'
    + '        <input type="hidden" id="ldf-h-timestamp" name="timestamp">'
    + '        <button type="submit" class="ldf-popup-cta" id="ldf-popup-submit">'
    + '          <i class="fas fa-shield-halved ldf-cta-icon"></i>'
    + '          <span class="ldf-cta-text">Quero receber minha proposta</span>'
    + '          <span class="ldf-spinner"></span>'
    + '        </button>'
    + '      </form>'
    + '      <div class="ldf-popup-trust">'
    + '        <i class="fas fa-lock"></i>'
    + '        <span>Seus dados estão seguros. Entraremos em contato com sua proposta.</span>'
    + '      </div>'
    + '    </div>'
    + '    <div class="ldf-popup-success" id="ldf-popup-success">'
    + '      <div class="ldf-popup-success-icon">'
    + '        <i class="fas fa-check"></i>'
    + '      </div>'
    + '      <h3 class="ldf-popup-success-title">Recebemos seus dados!</h3>'
    + '      <p class="ldf-popup-success-text">'
    + '        Em breve, um consultor entrará em contato com uma proposta exclusiva para você.'
    + '      </p>'
    + '    </div>'
    + '  </div>'
    + '</div>';

    var wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper.firstElementChild);
  }

  // ============================================================
  // ABRIR / FECHAR
  // ============================================================

  function openPopup() {
    if (!canShow()) return;

    var overlay = document.getElementById('ldf-exit-popup');
    if (!overlay) return;

    fillHiddenFields();
    resetFormUI();

    overlay.classList.add('active');
    state.isOpen = true;
    state.triggered = true;
    document.body.style.overflow = 'hidden';

    // Marca na sessão globalmente
    sessionStorage.setItem(STORAGE.sessionShown, 'true');

    // Focus
    setTimeout(function () {
      var first = document.getElementById('ldf-popup-nome');
      if (first) first.focus();
    }, 500);

    // TRACK
    if (window.LDFTracking) window.LDFTracking.trackPopupView();
  }

  function closePopup(closeType) {
    var overlay = document.getElementById('ldf-exit-popup');
    if (!overlay) return;

    overlay.classList.remove('active');
    state.isOpen = false;
    document.body.style.overflow = '';

    if (window.LDFTracking) window.LDFTracking.trackPopupClose(closeType || 'manual');
  }

  function fillHiddenFields() {
    var data = window.LDFGlobal ? window.LDFGlobal.getTrackingData() : {};

    var fields = [
      'page_url', 'page_path', 'page_title', 'referrer',
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_content',
      'utm_term', 'partner_id', 'session_id', 'timestamp'
    ];

    fields.forEach(function (f) {
      var el = document.getElementById('ldf-h-' + f);
      if (el) el.value = data[f] || '';
    });
  }

  // ============================================================
  // VALIDAÇÃO POR CAMPO (BLUR + SUBMIT)
  // ============================================================

  function validateField(fieldName, isSubmit) {
    if (!isSubmit && !state.touched[fieldName]) return true;

    var input = document.getElementById('ldf-popup-' + fieldName);
    var row = document.getElementById('ldf-row-' + fieldName);
    var err = document.getElementById('ldf-err-' + fieldName);
    if (!input || !row || !err) return true;

    var value = input.value;
    var valid = true;

    if (fieldName === 'nome') valid = isValidName(value);
    if (fieldName === 'email') valid = isValidEmail(value);
    if (fieldName === 'whatsapp') valid = isValidPhone(value);

    if (valid) {
      row.classList.remove('has-error');
      err.classList.remove('visible');
    } else {
      row.classList.add('has-error');
      err.classList.add('visible');
    }

    return valid;
  }

  function clearFieldError(fieldName) {
    var row = document.getElementById('ldf-row-' + fieldName);
    var err = document.getElementById('ldf-err-' + fieldName);
    if (row) row.classList.remove('has-error');
    if (err) err.classList.remove('visible');
  }

  function resetFormUI() {
    state.touched = {};
    ['nome', 'email', 'whatsapp'].forEach(function (f) {
      clearFieldError(f);
      var input = document.getElementById('ldf-popup-' + f);
      if (input) input.value = '';
    });
    var formArea = document.getElementById('ldf-popup-form-area');
    var successArea = document.getElementById('ldf-popup-success');
    if (formArea) formArea.style.display = '';
    if (successArea) {
      successArea.classList.remove('visible');
      successArea.style.display = '';
    }
  }

  // ============================================================
  // ENVIO
  // ============================================================

  function handleSubmit(e) {
    e.preventDefault();
    if (state.isSubmitting) return;

    state.touched.nome = true;
    state.touched.email = true;
    state.touched.whatsapp = true;

    var vNome = validateField('nome', true);
    var vEmail = validateField('email', true);
    var vWhatsapp = validateField('whatsapp', true);

    if (!vNome || !vEmail || !vWhatsapp) {
      // Monta mensagem detalhada dos campos inválidos
      var invalidFields = [];
      if (!vNome) invalidFields.push('nome');
      if (!vEmail) invalidFields.push('email');
      if (!vWhatsapp) invalidFields.push('whatsapp');
      if (window.LDFTracking) window.LDFTracking.trackPopupError('validation', 'Campos inválidos: ' + invalidFields.join(', '));
      return;
    }

    var nome = document.getElementById('ldf-popup-nome').value.trim();
    var email = document.getElementById('ldf-popup-email').value.trim();
    var whatsapp = document.getElementById('ldf-popup-whatsapp').value.trim();

    var formData = {
      nome: nome,
      email: email,
      whatsapp: whatsapp.replace(/\D/g, ''),
      whatsapp_formatted: whatsapp,
      partner_id: document.getElementById('ldf-h-partner_id').value,
      page_url: document.getElementById('ldf-h-page_url').value,
      page_path: document.getElementById('ldf-h-page_path').value,
      page_title: document.getElementById('ldf-h-page_title').value,
      referrer: document.getElementById('ldf-h-referrer').value,
      utm_source: document.getElementById('ldf-h-utm_source').value,
      utm_medium: document.getElementById('ldf-h-utm_medium').value,
      utm_campaign: document.getElementById('ldf-h-utm_campaign').value,
      utm_content: document.getElementById('ldf-h-utm_content').value,
      utm_term: document.getElementById('ldf-h-utm_term').value,
      session_id: document.getElementById('ldf-h-session_id').value,
      timestamp: new Date().toISOString(),
      popup_name: POPUP_CONFIG.popupName,
      form_name: POPUP_CONFIG.formName,
      first_touch_timestamp: localStorage.getItem('ldf_first_touch_timestamp') || '',
      user_agent: navigator.userAgent
    };

    if (window.LDFTracking) window.LDFTracking.trackPopupSubmit(formData);

    setLoading(true);

    sendToWebhook(formData).then(function (result) {
      if (result.success) {
        showSuccess();
        localStorage.setItem(STORAGE.submitted, Date.now().toString());
        if (window.LDFTracking) window.LDFTracking.trackLeadSaved(formData);
        setTimeout(function () { closePopup('timeout'); }, 4000);
      } else {
        throw new Error(result.error || 'Falha no envio');
      }
    }).catch(function (err) {
      setLoading(false);

      // Determina tipo de erro para o dataLayer
      var errorType = 'network';
      if (err.message && err.message.indexOf('HTTP') === 0) errorType = 'webhook_timeout';
      if (err.message && err.message.indexOf('timeout') !== -1) errorType = 'webhook_timeout';

      if (window.LDFTracking) window.LDFTracking.trackPopupError(errorType, err.message);

      var btn = document.getElementById('ldf-popup-submit');
      if (btn) {
        btn.innerHTML = '<i class="fas fa-exclamation-triangle ldf-cta-icon"></i><span class="ldf-cta-text">Erro. Tente novamente.</span>';
        btn.style.background = 'linear-gradient(135deg, #dc2626, #991b1b)';
        setTimeout(function () {
          btn.innerHTML = '<i class="fas fa-shield-halved ldf-cta-icon"></i><span class="ldf-cta-text">Quero receber minha proposta</span><span class="ldf-spinner"></span>';
          btn.style.background = '';
        }, 3000);
      }
    });
  }

  function sendToWebhook(data) {
    var url = POPUP_CONFIG.webhookUrl;

    if (!url) {
      return Promise.reject(new Error('Webhook não configurado'));
    }

    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    .then(async function (res) {
      var json = {};
      try {
        json = await res.json();
      } catch (e) {}

      if (!res.ok) {
        throw new Error(json.message || ('HTTP ' + res.status));
      }

      return {
        success: true,
        data: json
      };
    });
  }

  // ============================================================
  // UI HELPERS
  // ============================================================

  function setLoading(on) {
    state.isSubmitting = on;
    var btn = document.getElementById('ldf-popup-submit');
    if (!btn) return;
    if (on) { btn.classList.add('loading'); btn.disabled = true; }
    else { btn.classList.remove('loading'); btn.disabled = false; }
  }

  function showSuccess() {
    var formArea = document.getElementById('ldf-popup-form-area');
    var successArea = document.getElementById('ldf-popup-success');
    if (formArea) formArea.style.display = 'none';
    if (successArea) { successArea.style.display = 'block'; successArea.classList.add('visible'); }
  }

  // ============================================================
  // EXIT INTENT - DESKTOP
  // ============================================================

  function setupDesktopExitIntent() {
    document.addEventListener('mouseout', function (e) {
      if (e.clientY <= 0 && e.relatedTarget == null) {
        if (canShow()) openPopup();
      }
    });
  }

  // ============================================================
  // EXIT INTENT - MOBILE (15s + scroll up velocity)
  // ============================================================

  function setupMobileExitIntent() {
    // 1. Idle timer (resets on interaction)
    var interactionEvents = ['touchstart', 'touchmove', 'scroll', 'click'];
    interactionEvents.forEach(function (evt) {
      document.addEventListener(evt, function () {
        state.lastInteraction = Date.now();
        resetMobileIdle();
      }, { passive: true });
    });
    resetMobileIdle();

    // 2. Volta para a aba / Troca de aba
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' || document.visibilityState === 'hidden') {
        setTimeout(function () {
          if (canShow()) openPopup();
        }, 500);
      }
    });

    // 3. Fast Scroll Up (Simula Exit Intent real no mobile)
    var lastY = window.scrollY || document.documentElement.scrollTop;
    var lastTime = Date.now();
    
    window.addEventListener('scroll', function() {
      var currentY = window.scrollY || document.documentElement.scrollTop;
      var currentTime = Date.now();
      var timeDiff = currentTime - lastTime;
      
      if (timeDiff > 0) {
        var velocity = (currentY - lastY) / timeDiff; // px por ms
        // Se rolou pra cima muito rápido (ex: menos de -1.5) e já passou do topo
        if (velocity < -1.5 && currentY > 200) {
          if (canShow()) openPopup();
        }
      }
      
      lastY = currentY;
      lastTime = currentTime;
    }, { passive: true });
  }

  function resetMobileIdle() {
    if (state.mobileIdleTimer) clearTimeout(state.mobileIdleTimer);
    state.mobileIdleTimer = setTimeout(function () {
      if (canShow()) openPopup();
    }, 15000); // 15 segundos sem interagir
  }

  // ============================================================
  // SCROLL TRACKING
  // ============================================================

  function setupScrollTracking() {
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (!ticking) {
        window.requestAnimationFrame(function () {
          var pct = getScrollPercent();
          if (pct > state.maxScroll) state.maxScroll = pct;
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  // ============================================================
  // EVENT LISTENERS
  // ============================================================

  function setupListeners() {
    var closeBtn = document.getElementById('ldf-popup-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', function () { closePopup('button'); });

    var overlay = document.getElementById('ldf-exit-popup');
    if (overlay) overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closePopup('overlay');
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state.isOpen) closePopup('esc');
    });

    var form = document.getElementById('ldf-popup-form');
    if (form) form.addEventListener('submit', handleSubmit);

    var whatsappInput = document.getElementById('ldf-popup-whatsapp');
    if (whatsappInput) {
      whatsappInput.addEventListener('input', function (e) {
        e.target.value = maskPhone(e.target.value);
      });
    }

    // Blur = marca touched + valida / Input = revalida se já tocou
    ['nome', 'email', 'whatsapp'].forEach(function (field) {
      var input = document.getElementById('ldf-popup-' + field);
      if (!input) return;

      input.addEventListener('blur', function () {
        state.touched[field] = true;
        validateField(field, false);
      });

      input.addEventListener('input', function () {
        if (state.touched[field]) validateField(field, false);
      });
    });
  }

  // ============================================================
  // INIT
  // ============================================================

  function init() {
    if (hasAlreadySubmitted()) return;
    if (isBlockedPath()) return;

    state.isMobile = isMobileDevice();

    injectHTML();
    setupListeners();
    setupScrollTracking();

    if (state.isMobile) {
      setupMobileExitIntent();
    } else {
      setupDesktopExitIntent();
    }

    console.log('[LDF Popup] v4 inicializado.', {
      device: state.isMobile ? 'mobile' : 'desktop',
      isCheckout: isCheckoutPage(),
      page: window.location.pathname
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ============================================================
  // API PÚBLICA
  // ============================================================
  window.LDFPopup = {
    open: openPopup,
    close: closePopup,
    config: POPUP_CONFIG,
    getState: function () { return Object.assign({}, state); },
    forceOpen: function () {
      state.triggered = false;
      var overlay = document.getElementById('ldf-exit-popup');
      if (!overlay) { injectHTML(); setupListeners(); overlay = document.getElementById('ldf-exit-popup'); }
      fillHiddenFields();
      resetFormUI();
      if (overlay) {
        overlay.classList.add('active');
        state.isOpen = true;
        state.triggered = true;
        document.body.style.overflow = 'hidden';
        if (window.LDFTracking) window.LDFTracking.trackPopupView();
      }
    }
  };

})();
