import { Component, State, h } from '@stencil/core';
import { Router } from '../../';
import { Route } from 'stencil-router-v2';
import type { LanguageCode } from '../../types/language';
import globeIcon from '../../assets/icons/regular/globe-simple.svg';
import sealQuestionIcon from '../../assets/icons/regular/seal-question.svg';
import archiveIcon from '../../assets/icons/regular/archive.svg';
import userIcon from '../../assets/icons/regular/user.svg';
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

const updateCopy: Record<
  LanguageCode,
  {
    refreshMessage: string;
    refreshAction: string;
    dismissAction: string;
    standaloneMessage: string;
    standaloneAction: string;
  }
> = {
  lb: {
    refreshMessage: 'Eng nei Versioun ass disponibel. Aktualiséier d\'Säit fir se ze lueden.',
    refreshAction: 'Aktualiséieren',
    dismissAction: 'Spéider',
    standaloneMessage: 'Eng nei Versioun ass disponibel. Start d\'App nach eng Kéier fir d\'Aktualiséierung.',
    standaloneAction: 'Verstanen',
  },
  fr: {
    refreshMessage: 'Une nouvelle version est disponible. Actualise la page pour la charger.',
    refreshAction: 'Actualiser',
    dismissAction: 'Plus tard',
    standaloneMessage: "Une nouvelle version est disponible. Redémarre l'application pour terminer la mise à jour.",
    standaloneAction: 'Compris',
  },
  de: {
    refreshMessage: 'Eine neue Version ist verfügbar. Aktualisiere die Seite, um sie zu laden.',
    refreshAction: 'Aktualisieren',
    dismissAction: 'Später',
    standaloneMessage: 'Eine neue Version ist verfügbar. Starte die App neu, um das Update abzuschließen.',
    standaloneAction: 'Verstanden',
  },
  en: {
    refreshMessage: 'A new version is available. Refresh the page to load it.',
    refreshAction: 'Refresh now',
    dismissAction: 'Later',
    standaloneMessage: 'A new version is available. Restart the app to finish updating.',
    standaloneAction: 'Got it',
  },
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
  @State() showUpdateToast = false;
  @State() updateIsStandalone = false;

  private unsubscribeRouterChange?: () => void;
  private applyPendingSwUpdate?: () => boolean;

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
    this.applyPendingSwUpdate = detail.applyUpdate;
    this.updateIsStandalone = detail.isStandalone;
    this.showUpdateToast = true;
    logAnalyticsEvent('sw_update_toast_shown', { standalone: detail.isStandalone });
  };

  connectedCallback() {
    if (typeof window !== 'undefined') {
      const stored = this.readStoredLanguage();
      if (stored) {
        this.language = stored;
        this.persistLanguage(stored);
        this.persistLanguageToServer(stored);
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

  private confirmServiceWorkerUpdate = () => {
    const applied = this.applyPendingSwUpdate ? this.applyPendingSwUpdate() : false;

    if (this.updateIsStandalone) {
      logAnalyticsEvent('sw_update_acknowledged', { standalone: true, applied });
      this.showUpdateToast = false;
      this.applyPendingSwUpdate = undefined;
      return;
    }
    logAnalyticsEvent('sw_update_refresh_clicked', { standalone: false, applied });
    this.applyPendingSwUpdate = undefined;
    this.showUpdateToast = false;
    try {
      window.location.reload();
    } catch {
      /* ignore */
    }
  };

  private dismissUpdateToast = () => {
    logAnalyticsEvent('sw_update_dismissed', { standalone: this.updateIsStandalone });
    this.showUpdateToast = false;
    this.applyPendingSwUpdate = undefined;
  };

  render() {
    const navLabels: Record<
      LanguageCode,
      { question: string; profile: string; history: string }
    > = {
      lb: { question: 'Fro', profile: 'Profil', history: 'Archiv' },
      fr: { question: 'Question', profile: 'Profil', history: 'Historique' },
      de: { question: 'Frage', profile: 'Profil', history: 'Verlauf' },
      en: { question: 'Question', profile: 'Profile', history: 'History' },
    };
    const labels = navLabels[this.language] || navLabels.lb;
    const updateLabels = updateCopy[this.language] || updateCopy.lb;

    return (
      <div class="app-shell">
        {this.showUpdateToast && (
          <div class="app-update-toast show" role="status" aria-live="polite">
            <span>
              {this.updateIsStandalone
                ? updateLabels.standaloneMessage
                : updateLabels.refreshMessage}
            </span>
            <div class="app-update-toast__actions">
              {!this.updateIsStandalone && (
                <button
                  class="app-update-toast__button"
                  type="button"
                  onClick={this.dismissUpdateToast}
                >
                  {updateLabels.dismissAction}
                </button>
              )}
              <button
                class="app-update-toast__button app-update-toast__button--primary"
                type="button"
                onClick={this.confirmServiceWorkerUpdate}
              >
                {this.updateIsStandalone
                  ? updateLabels.standaloneAction
                  : updateLabels.refreshAction}
              </button>
            </div>
          </div>
        )}
        {!this.showUpdateToast && this.showInstallToast && (
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
            <Route path="/profile">
              <app-profile language={this.language} />
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
            aria-label="Question of the day"
          >
            <span class="nav-icon">
              <img src={sealQuestionIcon} alt="" />
            </span>
            <span>{labels.question}</span>
          </button>
          <button
            class={{
              'nav-button': true,
              active: this.currentPath.startsWith('/profile'),
            }}
            onClick={() => this.navigate('/profile')}
            aria-label="Profile"
          >
            <span class="nav-icon">
              <img src={userIcon} alt="" />
            </span>
            <span>{labels.profile}</span>
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
