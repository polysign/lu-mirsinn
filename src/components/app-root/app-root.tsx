import { Component, State, h } from '@stencil/core';
import { Router } from '../../';
import { Route } from 'stencil-router-v2';
import type { LanguageCode } from '../../types/language';

const languages: Array<{ code: LanguageCode; label: string }> = [
  { code: 'lb', label: 'Lëtzebuergesch' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'en', label: 'English' },
];

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
  };

  private navigate = (path: string) => {
    Router.push(path);
    this.currentPath = path;
  };

  render() {
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
              🌍
            </span>
            <select onInput={this.handleLanguageChange} aria-label="Select language">
              {languages.map(lang => (
                <option value={lang.code} selected={this.language === lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>
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
            <span class="nav-icon">❓</span>
            <span>Question</span>
          </button>
          <button
            class={{
              'nav-button': true,
              active: this.currentPath.startsWith('/history'),
            }}
            onClick={() => this.navigate('/history')}
            aria-label="Previous questions"
          >
            <span class="nav-icon">🗂️</span>
            <span>History</span>
          </button>
        </nav>
      </div>
    );
  }
}
