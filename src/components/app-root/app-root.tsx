import { Component, State, h } from '@stencil/core';
import { Router } from '../../';
import { Route } from 'stencil-router-v2';
import type { LanguageCode } from '../../types/language';
import globeIcon from '../../assets/icons/regular/globe-simple.svg';
import sealQuestionIcon from '../../assets/icons/regular/seal-question.svg';
import archiveIcon from '../../assets/icons/regular/archive.svg';
import { updateDeviceLanguage } from '../../services/firebase';

const languages: Array<{ code: LanguageCode; label: string }> = [
  { code: 'lb', label: 'Lëtzebuergesch' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'en', label: 'English' },
];

const LANGUAGE_STORAGE_KEY = 'mir-sinn-lang';

@Component({
  tag: 'app-root',
  styleUrl: 'app-root.css',
  shadow: true,
})
export class AppRoot {
  @State() language: LanguageCode = 'lb';
  @State() currentPath: string = '/';

  private handlePopState = () => {
    if (typeof window === 'undefined') return;
    this.currentPath = window.location.pathname || '/';
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
    }
  }

  disconnectedCallback() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('popstate', this.handlePopState);
    }
  }

  private handleLanguageChange = (event: Event) => {
    const select = event.target as HTMLSelectElement;
    const next = select.value as LanguageCode;
    this.language = next;
    this.persistLanguage(next);
    this.persistLanguageToServer(next);
  };

  private navigate = (path: string) => {
    Router.push(path);
    this.currentPath = path;
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

  render() {
    const navLabels: Record<LanguageCode, { question: string; history: string }> = {
      lb: { question: 'Fro', history: 'Archiv' },
      fr: { question: 'Question', history: 'Historique' },
      de: { question: 'Frage', history: 'Verlauf' },
      en: { question: 'Question', history: 'History' },
    };
    const labels = navLabels[this.language] || navLabels.lb;

    return (
      <div class="app-shell">
        <header class="app-header">
          <button class="home-link" onClick={() => this.navigate('/')}>
            <span class="flag" aria-hidden="true">
              <span class="stripe stripe-red" />
              <span class="stripe stripe-white" />
              <span class="stripe stripe-blue" />
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
