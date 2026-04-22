/* ========================================================================
   LDF COOKIE BANNER - Consentimento de Cookies (v2)
   
   Regras:
   - Aceitar: libera analytics + marketing (GTM, GA4, Meta Pixel)
   - Recusar: só necessários
   - Sem resposta: bloqueia marketing
   - Salva escolha no localStorage por 180 dias
   
   dataLayer Events:
   - cookie_banner_view
   - cookie_accept          (push simples: { event: 'cookie_accept' })
   - cookie_reject          (push simples: { event: 'cookie_reject' })
   - cookie_preferences_save
   - consent_update         (com detalhes de cada tipo)
   
   Depende de: ldf-global.js (LDFGlobal.pushEvent)
   ======================================================================== */

(function () {
  'use strict';

  // ============================================================
  // CONFIG
  // ============================================================
  var COOKIE_CONFIG = {
    storageKey: 'ldf_cookie_consent',
    expirationDays: 180
  };

  // ============================================================
  // ESTADO
  // ============================================================

  function setCookie(name, value, days) {
    var expires = "";
    if (days) {
      var date = new Date();
      date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
      expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + encodeURIComponent(value) + expires + "; path=/";
  }

  function getCookie(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(';');
    for(var i=0;i < ca.length;i++) {
      var c = ca[i];
      while (c.charAt(0)==' ') c = c.substring(1,c.length);
      if (c.indexOf(nameEQ) == 0) return decodeURIComponent(c.substring(nameEQ.length,c.length));
    }
    return null;
  }

  /**
   * Lê o consentimento salvo
   * @returns {Object|null} { analytics: bool, marketing: bool, savedAt: timestamp }
   */
  function getSavedConsent() {
    var saved = getCookie(COOKIE_CONFIG.storageKey);
    if (!saved) return null;
    try {
      return JSON.parse(saved);
    } catch (e) {
      return null;
    }
  }

  /**
   * Salva consentimento
   */
  function saveConsent(analytics, marketing) {
    var data = {
      necessary: true,
      analytics: !!analytics,
      marketing: !!marketing,
      savedAt: Date.now()
    };
    setCookie(COOKIE_CONFIG.storageKey, JSON.stringify(data), COOKIE_CONFIG.expirationDays);
    return data;
  }

  /**
   * Verifica se o marketing está consentido
   */
  function isMarketingAllowed() {
    var consent = getSavedConsent();
    return consent && consent.marketing === true;
  }

  /**
   * Verifica se analytics está consentido
   */
  function isAnalyticsAllowed() {
    var consent = getSavedConsent();
    return consent && consent.analytics === true;
  }

  // ============================================================
  // HTML DO BANNER
  // ============================================================

  function injectBanner() {
    if (document.getElementById('ldf-cookie-banner')) return;

    var html = ''
    + '<div class="ldf-cookie-banner" id="ldf-cookie-banner" role="dialog" aria-label="Consentimento de cookies">'
    + '  <div class="ldf-cookie-inner">'
    + '    <div class="ldf-cookie-text">'
    + '      <p>Usamos cookies para melhorar sua experiência, personalizar conteúdo e analisar nosso tráfego. '
    + '      Ao clicar em "Aceitar", você concorda com o uso de cookies analíticos e de marketing. '
    + '      <a href="/politica-de-privacidade.html" id="ldf-cookie-policy-link">Política de Privacidade</a></p>'
    + '    </div>'
    + '    <div class="ldf-cookie-actions">'
    + '      <button class="ldf-cookie-btn ldf-cookie-btn-accept" id="ldf-cookie-accept">Aceitar</button>'
    + '      <button class="ldf-cookie-btn ldf-cookie-btn-reject" id="ldf-cookie-reject">Recusar</button>'
    + '      <button class="ldf-cookie-btn ldf-cookie-btn-prefs" id="ldf-cookie-prefs-btn">Preferências</button>'
    + '    </div>'
    + '  </div>'
    + '  <div class="ldf-cookie-prefs" id="ldf-cookie-prefs-panel">'
    + '    <div class="ldf-cookie-category">'
    + '      <div class="ldf-cookie-cat-info">'
    + '        <div class="ldf-cookie-cat-name">Necessários</div>'
    + '        <div class="ldf-cookie-cat-desc">Essenciais para o funcionamento do site. Sempre ativos.</div>'
    + '      </div>'
    + '      <label class="ldf-cookie-toggle">'
    + '        <input type="checkbox" checked disabled>'
    + '        <span class="ldf-cookie-toggle-track"></span>'
    + '      </label>'
    + '    </div>'
    + '    <div class="ldf-cookie-category">'
    + '      <div class="ldf-cookie-cat-info">'
    + '        <div class="ldf-cookie-cat-name">Analytics</div>'
    + '        <div class="ldf-cookie-cat-desc">Nos ajudam a entender como você usa o site (GA4).</div>'
    + '      </div>'
    + '      <label class="ldf-cookie-toggle">'
    + '        <input type="checkbox" id="ldf-pref-analytics" checked>'
    + '        <span class="ldf-cookie-toggle-track"></span>'
    + '      </label>'
    + '    </div>'
    + '    <div class="ldf-cookie-category">'
    + '      <div class="ldf-cookie-cat-info">'
    + '        <div class="ldf-cookie-cat-name">Marketing</div>'
    + '        <div class="ldf-cookie-cat-desc">Permitem anúncios personalizados (Meta Pixel, remarketing).</div>'
    + '      </div>'
    + '      <label class="ldf-cookie-toggle">'
    + '        <input type="checkbox" id="ldf-pref-marketing" checked>'
    + '        <span class="ldf-cookie-toggle-track"></span>'
    + '      </label>'
    + '    </div>'
    + '    <div class="ldf-cookie-prefs-save">'
    + '      <button class="ldf-cookie-btn ldf-cookie-btn-accept" id="ldf-cookie-save-prefs">Salvar preferências</button>'
    + '    </div>'
    + '  </div>'
    + '</div>';

    var wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper.firstElementChild);
  }

  // ============================================================
  // CONTROLE DO BANNER
  // ============================================================

  function showBanner() {
    var banner = document.getElementById('ldf-cookie-banner');
    if (!banner) return;
    requestAnimationFrame(function () {
      banner.classList.add('visible');
    });

    // TRACK: cookie_banner_view
    if (window.LDFGlobal) {
      window.LDFGlobal.pushEvent('cookie_banner_view', {});
    }
  }

  function hideBanner() {
    var banner = document.getElementById('ldf-cookie-banner');
    if (banner) banner.classList.remove('visible');
  }

  /**
   * Aceitar tudo (analytics + marketing)
   */
  function acceptAll() {
    var consent = saveConsent(true, true);
    hideBanner();

    // Push simples conforme spec: { event: 'cookie_accept' }
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: 'cookie_accept' });
    console.log('%c[LDF dataLayer]', 'color: #3b82f6; font-weight: bold;', 'cookie_accept');
    if (window.LDFTracking) window.LDFTracking.trackCookieAccept();

    // Push detalhado para triggers avançados no GTM
    if (window.LDFGlobal) {
      window.LDFGlobal.pushEvent('consent_granted', {
        consent_necessary: true,
        consent_analytics: true,
        consent_marketing: true
      });
    }

    applyConsent(consent);
  }

  /**
   * Recusar (só necessários)
   */
  function rejectAll() {
    var consent = saveConsent(false, false);
    hideBanner();

    // Push simples conforme spec: { event: 'cookie_reject' }
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: 'cookie_reject' });
    console.log('%c[LDF dataLayer]', 'color: #3b82f6; font-weight: bold;', 'cookie_reject');
    if (window.LDFTracking) window.LDFTracking.trackCookieReject();

    // Push detalhado para triggers avançados no GTM
    if (window.LDFGlobal) {
      window.LDFGlobal.pushEvent('consent_denied', {
        consent_necessary: true,
        consent_analytics: false,
        consent_marketing: false
      });
    }

    applyConsent(consent);
  }

  /**
   * Salvar preferências
   */
  function savePreferences() {
    var analyticsChecked = document.getElementById('ldf-pref-analytics');
    var marketingChecked = document.getElementById('ldf-pref-marketing');

    var analytics = analyticsChecked ? analyticsChecked.checked : false;
    var marketing = marketingChecked ? marketingChecked.checked : false;

    var consent = saveConsent(analytics, marketing);
    hideBanner();

    if (window.LDFGlobal) {
      window.LDFGlobal.pushEvent('cookie_preferences_save', {
        consent_necessary: true,
        consent_analytics: analytics,
        consent_marketing: marketing
      });
    }

    applyConsent(consent);
  }

  /**
   * Aplica o consentimento:
   * - Se marketing: dispara evento de consent_granted para GTM configurar tags
   * - O GTM usa esse evento para liberar GA4/Meta Pixel
   */
  function applyConsent(consent) {
    // Empurra evento de consentimento para o GTM usar como trigger
    window.dataLayer.push({
      event: 'consent_update',
      consent_analytics: consent.analytics ? 'granted' : 'denied',
      consent_marketing: consent.marketing ? 'granted' : 'denied'
    });

    // Google Consent Mode v2 (se o container GTM suportar)
    if (typeof gtag === 'function') {
      gtag('consent', 'update', {
        analytics_storage: consent.analytics ? 'granted' : 'denied',
        ad_storage: consent.marketing ? 'granted' : 'denied',
        ad_user_data: consent.marketing ? 'granted' : 'denied',
        ad_personalization: consent.marketing ? 'granted' : 'denied'
      });
    }
  }

  // ============================================================
  // EVENT LISTENERS
  // ============================================================

  function setupListeners() {
    var acceptBtn = document.getElementById('ldf-cookie-accept');
    var rejectBtn = document.getElementById('ldf-cookie-reject');
    var prefsBtn = document.getElementById('ldf-cookie-prefs-btn');
    var saveBtn = document.getElementById('ldf-cookie-save-prefs');

    if (acceptBtn) acceptBtn.addEventListener('click', acceptAll);
    if (rejectBtn) rejectBtn.addEventListener('click', rejectAll);

    if (prefsBtn) {
      prefsBtn.addEventListener('click', function () {
        var panel = document.getElementById('ldf-cookie-prefs-panel');
        if (panel) panel.classList.toggle('visible');
      });
    }

    if (saveBtn) saveBtn.addEventListener('click', savePreferences);
  }

  // ============================================================
  // INIT
  // ============================================================

  function init() {
    var existing = getSavedConsent();

    if (existing) {
      // Já respondeu — aplica consentimento silenciosamente
      applyConsent(existing);
      return;
    }

    // Não respondeu — mostra banner
    injectBanner();
    setupListeners();

    // Pequeno delay para animação
    setTimeout(showBanner, 1000);
  }

  // DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ============================================================
  // API PÚBLICA
  // ============================================================
  window.LDFConsent = {
    isMarketingAllowed: isMarketingAllowed,
    isAnalyticsAllowed: isAnalyticsAllowed,
    getSavedConsent: getSavedConsent,
    resetConsent: function () {
      setCookie(COOKIE_CONFIG.storageKey, '', -1);
      location.reload();
    }
  };

})();
