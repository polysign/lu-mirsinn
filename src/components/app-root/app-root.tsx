import { Component, State, h } from '@stencil/core';
import { Router } from '../../';
import { Route } from 'stencil-router-v2';
import type { LanguageCode } from '../../types/language';
import globeIcon from '../../assets/icons/regular/globe-simple.svg';
import sealQuestionIcon from '../../assets/icons/regular/seal-question.svg';
import archiveIcon from '../../assets/icons/regular/archive.svg';
import { updateDeviceLanguage } from '../../services/firebase';
import { logAnalyticsEvent } from '../../services/analytics';
import { SERVICE_WORKER_UPDATE_EVENT, type ServiceWorkerUpdatePayload } from '../../global/app';

const languages: Array<{ code: LanguageCode; label: string }> = [
  { code: 'lb', label: 'Lëtzebuergesch' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'en', label: 'English' },
];

const LANGUAGE_STORAGE_KEY = 'mir-sinn-lang';

const installCopy: Record<LanguageCode, string> = {
  lb: 'Installéiert Mir Sinn op ärem Homescreen fir de schnellsten Zougang.',
  fr: "Ajoute Mir Sinn à ton écran d'accueil pour un accès rapide.",
  de: 'Füge Mir Sinn deinem Homescreen hinzu für den schnellsten Zugriff.',
  en: 'Add Mir Sinn to your homescreen for the quickest access.',
};

@Component({
  tag: 'app-root',
  styleUrls: ['app-root.css'],
  shadow: true,
})
export class AppRoot {
  @State() language: LanguageCode = 'lb';
  @State() currentPath: string = '/';
  @State() showInstallToast = false;

  private unsubscribeRouterChange?: () => void;

  private handlePopState = () => {
    if (typeof window === 'undefined') return;
    this.currentPath = window.location.pathname || '/';
  };

  private handleServiceWorkerUpdate = (event: Event) => {
    const custom = event as CustomEvent<ServiceWorkerUpdatePayload>;
    const detail = custom.detail;
    if (!detail) {
      return;
    }
    let applied = false;
    try {
      applied = detail.applyUpdate();
    } catch (error) {
      console.warn('[sw] Failed to apply update automatically', error);
    }
    logAnalyticsEvent('sw_update_auto_applied', { standalone: detail.isStandalone, applied });
  };

  connectedCallback() {
    if (typeof window !== 'undefined') {
      const stored = this.readStoredLanguage();
      if (stored) {
        this.language = stored;
        this.persistLanguage(stored);
        this.persistLanguageToServer(stored);
      } else {
        const detected = this.detectBrowserLanguage();
        if (detected) {
          this.language = detected;
          this.persistLanguage(detected);
          this.persistLanguageToServer(detected);
        }
      }
      this.currentPath = window.location.pathname || '/';
      window.addEventListener('popstate', this.handlePopState);
      this.evaluateInstallPrompt();
      window.addEventListener(SERVICE_WORKER_UPDATE_EVENT, this.handleServiceWorkerUpdate as EventListener);
      this.unsubscribeRouterChange = Router.onChange('url', url => {
        if (url && typeof url.pathname === 'string') {
          this.currentPath = url.pathname;
        }
      });
    }
  }

  disconnectedCallback() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('popstate', this.handlePopState);
      window.removeEventListener(SERVICE_WORKER_UPDATE_EVENT, this.handleServiceWorkerUpdate as EventListener);
    }
    if (this.unsubscribeRouterChange) {
      try {
        this.unsubscribeRouterChange();
      } catch {
        /* noop */
      }
      this.unsubscribeRouterChange = undefined;
    }
  }

  private handleLanguageChange = (event: Event) => {
    const select = event.target as HTMLSelectElement;
    const next = select.value as LanguageCode;
    this.language = next;
    this.persistLanguage(next);
    this.persistLanguageToServer(next);
    logAnalyticsEvent('language_changed', { language: next });
  };

  private navigate = (path: string) => {
    Router.push(path);
    this.currentPath = path;
    try {
      const scrollTarget = document.querySelector('.question-wrapper') || window;
      if ('scrollTo' in scrollTarget) {
        (scrollTarget as any).scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  private readStoredLanguage(): LanguageCode | null {
    try {
      const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (languages.some(lang => lang.code === stored)) {
        return stored as LanguageCode;
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  private detectBrowserLanguage(): LanguageCode | null {
    if (typeof window === 'undefined') {
      return null;
    }
    try {
      const nav = window.navigator;
      if (!nav) return null;
      const supported = new Set(languages.map(lang => lang.code));
      const candidates: string[] = [];
      if (Array.isArray(nav.languages)) {
        candidates.push(...nav.languages);
      }
      if (typeof nav.language === 'string') {
        candidates.push(nav.language);
      }
      for (const code of candidates) {
        if (!code) continue;
        const base = code.toLowerCase().split(/[-_]/)[0];
        if (supported.has(base as LanguageCode)) {
          return base as LanguageCode;
        }
      }
    } catch {
      /* ignore detection issues */
    }
    return null;
  }

  private persistLanguage(lang: LanguageCode) {
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    } catch {
      /* ignore persistence issues */
    }
  }

  private persistLanguageToServer(lang: LanguageCode) {
    try {
      const deviceId = (window as any).__DEVICE_ID__;
      if (!deviceId) return;
      updateDeviceLanguage(deviceId, lang).catch(err =>
        console.warn('[language] Failed to store device language', err),
      );
    } catch (err) {
      console.warn('[language] Unable to access device id', err);
    }
  }

  private evaluateInstallPrompt() {
    try {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true;
      if (isStandalone) return;

      const dismissedKey = 'mir-sinn-install-dismissed';
      const dismissedDate = localStorage.getItem(dismissedKey);
      if (dismissedDate) {
        const diff = Date.now() - Number(dismissedDate);
        const oneDay = 24 * 60 * 60 * 1000;
        if (diff < oneDay) return;
      }

      this.showInstallToast = true;
      logAnalyticsEvent('install_toast_shown');
    } catch {
      this.showInstallToast = true;
      logAnalyticsEvent('install_toast_shown');
    }
  }

  private dismissToast = () => {
    this.showInstallToast = false;
    try {
      localStorage.setItem('mir-sinn-install-dismissed', String(Date.now()));
    } catch {
      /* ignore */
    }
    logAnalyticsEvent('install_toast_dismissed');
  };

  render() {
    const navLabels: Record<LanguageCode, { questions: string; history: string }> = {
      lb: { questions: 'Froen', history: 'Archiv' },
      fr: { questions: 'Questions', history: 'Historique' },
      de: { questions: 'Fragen', history: 'Verlauf' },
      en: { questions: 'Questions', history: 'History' },
    };
    const labels = navLabels[this.language] || navLabels.lb;
    return (
      <div class="app-shell">
        {this.showInstallToast && (
          <div class="add-to-home-toast show" role="status" aria-live="polite">
            <span>{installCopy[this.language] || installCopy.lb}</span>
            <button class="toast-dismiss" type="button" onClick={this.dismissToast} aria-label="Dismiss reminder">
              ×
            </button>
          </div>
        )}
        <header class="app-header">
          <button class="home-link" onClick={() => this.navigate('/')}>
            <span class="logo" aria-hidden="true">
              <img src="/assets/icon/mir-sinn-icon-192.png" alt="" />
            </span>
            <span class="branding">
              <span class="title">Mir Sinn</span>
              <span class="subtitle">Lëtzebuerg</span>
            </span>
          </button>
          <label class="language-picker">
            <span class="language-label" aria-hidden="true">
              <img src={globeIcon} alt="" />
            </span>
            <div class="language-select">
              <span class="language-select__current">{this.language.toUpperCase()}</span>
              <select onInput={this.handleLanguageChange} aria-label="Select language">
                {languages.map(lang => (
                  <option value={lang.code} selected={this.language === lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>
          </label>
        </header>

        <main class="app-content">
          <Router.Switch>
            <Route path="/">
              <app-home language={this.language} />
            </Route>
            <Route path="/history">
              <app-history language={this.language} />
            </Route>
          </Router.Switch>
        </main>

        <nav class="app-nav" aria-label="Primary navigation">
          <button
            class={{
              'nav-button': true,
              active: this.currentPath === '/',
            }}
            onClick={() => this.navigate('/')}
            aria-label="Questions of the day"
          >
            <span class="nav-icon">
              <img src={sealQuestionIcon} alt="" />
            </span>
            <span>{labels.questions}</span>
          </button>
          <button
            class={{
              'nav-button': true,
              active: this.currentPath.startsWith('/history'),
            }}
            onClick={() => this.navigate('/history')}
            aria-label="Previous questions"
          >
            <span class="nav-icon">
              <img src={archiveIcon} alt="" />
            </span>
            <span>{labels.history}</span>
          </button>
        </nav>
      </div>
    );
  }
}
