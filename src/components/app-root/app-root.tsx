import { Component, Listen, State, h } from '@stencil/core';
import { Router } from '../../';
import { Route } from 'stencil-router-v2';
import type { LanguageCode } from '../../types/language';
import globeIcon from '../../assets/icons/regular/globe-simple.svg';
import sealQuestionIcon from '../../assets/icons/regular/seal-question.svg';
import archiveIcon from '../../assets/icons/regular/archive.svg';
import infoIcon from '../../assets/icons/regular/info.svg';
import { updateDeviceLanguage } from '../../services/firebase';
import { logAnalyticsEvent } from '../../services/analytics';
import { SERVICE_WORKER_UPDATE_EVENT, type ServiceWorkerUpdatePayload } from '../../global/app';
import { APP_VERSION } from '../../global/version';

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

const infoCopy: Record<
  LanguageCode,
  {
    buttonLabel: string;
    closeLabel: string;
    dialogTitle: string;
    deviceCode: string;
    unavailable: string;
    appVersion: string;
    noPersonalInfo: string;
    copyright: string;
  }
> = {
  lb: {
    buttonLabel: 'Informatiounen',
    closeLabel: 'Dialog zoumaachen',
    dialogTitle: 'Iwwer Mir Sinn',
    deviceCode: 'Kuerzcode',
    unavailable: 'Net verfügbar',
    appVersion: 'App-Versioun',
    noPersonalInfo:
      'MirSinn.lu späichert keng perséinlech Informatioune weder op dengem Apparat nach an hiren Datebanken.',
    copyright: 'Copyright (c) {year} MirSinn.lu',
  },
  fr: {
    buttonLabel: 'Informations',
    closeLabel: 'Fermer la boîte de dialogue',
    dialogTitle: 'À propos de Mir Sinn',
    deviceCode: "Code de l'appareil",
    unavailable: 'Non disponible',
    appVersion: "Version de l'application",
    noPersonalInfo:
      "MirSinn.lu n'enregistre aucune information personnelle sur ton appareil ni dans ses bases de données en ligne.",
    copyright: 'Copyright (c) {year} MirSinn.lu',
  },
  de: {
    buttonLabel: 'Infos',
    closeLabel: 'Dialog schließen',
    dialogTitle: 'Über Mir Sinn',
    deviceCode: 'Gerätecode',
    unavailable: 'Nicht verfügbar',
    appVersion: 'App-Version',
    noPersonalInfo:
      'MirSinn.lu speichert keine persönlichen Daten auf deinem Gerät oder in Online-Datenbanken.',
    copyright: 'Copyright (c) {year} MirSinn.lu',
  },
  en: {
    buttonLabel: 'Info',
    closeLabel: 'Close dialog',
    dialogTitle: 'About Mir Sinn',
    deviceCode: 'Device code',
    unavailable: 'Unavailable',
    appVersion: 'App version',
    noPersonalInfo:
      'MirSinn.lu does not store any personal information on your device or in online databases.',
    copyright: 'Copyright (c) {year} MirSinn.lu',
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
  @State() showInfoDialog = false;

  private unsubscribeRouterChange?: () => void;
  private infoDialogId = 'app-info-dialog';

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

  private openInfoDialog = () => {
    this.showInfoDialog = true;
    logAnalyticsEvent('info_dialog_opened');
  };

  private closeInfoDialog = () => {
    this.showInfoDialog = false;
  };

  private getDeviceShortCode() {
    if (typeof window === 'undefined') {
      return null as string | null;
    }
    const win = window as any;
    const shortCodeValue = typeof win.__DEVICE_SHORT_CODE__ === 'string' ? win.__DEVICE_SHORT_CODE__.trim() : '';
    return shortCodeValue || null;
  }

  @Listen('keydown', { target: 'window' })
  handleWindowKeyDown(event: KeyboardEvent) {
    if (!this.showInfoDialog) return;
    if (event.key === 'Escape') {
      this.closeInfoDialog();
    }
  }

  render() {
    const navLabels: Record<LanguageCode, { questions: string; history: string }> = {
      lb: { questions: 'Froen', history: 'Archiv' },
      fr: { questions: 'Questions', history: 'Historique' },
      de: { questions: 'Fragen', history: 'Verlauf' },
      en: { questions: 'Questions', history: 'History' },
    };
    const labels = navLabels[this.language] || navLabels.lb;
    const infoLabels = infoCopy[this.language] || infoCopy.lb;
    const shortCode = this.getDeviceShortCode();
    const year = new Date().getFullYear();
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
          <div class="header-actions">
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
            <button
              class="info-button"
              type="button"
              onClick={this.openInfoDialog}
              aria-haspopup="dialog"
              aria-expanded={this.showInfoDialog ? 'true' : 'false'}
              aria-controls={this.infoDialogId}
              aria-label={infoLabels.buttonLabel}
            >
              <span class="info-icon" aria-hidden="true">
                <img src={infoIcon} alt="" />
              </span>
              <span class="info-label">{infoLabels.buttonLabel}</span>
            </button>
          </div>
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
        {this.showInfoDialog && (
          <div class="info-dialog-overlay" role="presentation" onClick={this.closeInfoDialog}>
            <div
              class="info-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="info-dialog-title"
              aria-describedby="info-dialog-description"
              id={this.infoDialogId}
              onClick={event => event.stopPropagation()}
            >
              <button class="info-dialog__close" type="button" onClick={this.closeInfoDialog} aria-label={infoLabels.closeLabel}>
                x
              </button>
              <h2 id="info-dialog-title">{infoLabels.dialogTitle}</h2>
              <div class="info-dialog__content" id="info-dialog-description">
                <dl class="info-dialog__list">
                  <div class="info-dialog__item">
                    <dt>{infoLabels.deviceCode}</dt>
                    <dd>{shortCode || infoLabels.unavailable}</dd>
                  </div>
                  <div class="info-dialog__item">
                    <dt>{infoLabels.appVersion}</dt>
                    <dd class="info-dialog__version">{APP_VERSION}</dd>
                  </div>
                </dl>
                <p class="info-dialog__notice">{infoLabels.noPersonalInfo}</p>
                <p class="info-dialog__copyright">
                  {infoLabels.copyright.replace('{year}', String(year))}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
}
