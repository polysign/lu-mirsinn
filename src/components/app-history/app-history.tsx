import { Component, Prop, State, h } from '@stencil/core';
import {
  getRecentQuestions,
  type QuestionDocument,
  type QuestionDay,
} from '../../services/firebase';
import { fallbackHistory } from '../../services/mock-data';
import type { LanguageCode } from '../../types/language';
type HistoryErrorKey = 'load-failed';

interface HistoryState {
  loading: boolean;
  errorKey?: HistoryErrorKey;
  days: QuestionDay[];
  expanded: Set<string>;
}

const LUXEMBOURG_TZ = 'Europe/Luxembourg';
const MAX_ARCHIVE_DAYS = 10;

const parseDateKey = (key: string) => {
  const [month, day, year] = key.split('-').map(part => Number(part));
  if (!month || !day || !year) return new Date();
  return new Date(year, month - 1, day);
};

const formatDateLabel = (key: string, language: LanguageCode) => {
  const date = parseDateKey(key);
  const locale = language === 'lb' ? 'de-LU' : language;
  return date.toLocaleDateString(locale, {
    timeZone: LUXEMBOURG_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const TODAY_KEY = (() => {
  const now = new Date();
  const iso = now.toLocaleDateString('en-CA', { timeZone: LUXEMBOURG_TZ });
  const [year, month, day] = iso.split('-');
  return `${month}-${day}-${year}`;
})();

const emptyMessages: Record<LanguageCode, string> = {
  lb: 'Soubal Resultater do sinn, fannt Dir se hei.',
  fr: "Les résultats apparaîtront ici une fois qu'ils seront disponibles.",
  de: 'Sobald Ergebnisse verfügbar sind, findest du sie hier.',
  en: 'Results will appear here as soon as they are available.',
};

const retryLabels: Record<LanguageCode, string> = {
  lb: 'Nees probéieren',
  fr: 'Réessayer',
  de: 'Erneut versuchen',
  en: 'Try again',
};

const errorMessages: Record<LanguageCode, string> = {
  lb: 'Mir konnten déi al Froen net lueden. Probéiert et w.e.g. nach eng Kéier.',
  fr: 'Impossible de charger les questions précédentes. Réessayez plus tard.',
  de: 'Die vorherigen Fragen konnten nicht geladen werden. Bitte versuche es erneut.',
  en: 'We could not load the previous questions. Please try again.',
};

const archiveLimitNote: Record<LanguageCode, string> = {
  lb: 'Nëmmen déi lescht 10 Deeg vu Froen ginn an der App gehalen.',
  fr: "Seuls les 10 derniers jours de questions sont conservés dans l'application.",
  de: 'Es werden nur die letzten 10 Tage mit Fragen in der App gespeichert.',
  en: 'Only the last 10 days of questions are kept inside the app.',
};

const totalLabel = (language: LanguageCode, count: number) => {
  switch (language) {
    case 'fr':
      return `${count} réponses`;
    case 'de':
      return `${count} Stimmen`;
    case 'en':
      return `${count} votes`;
    default:
      return `${count} Stëmmen`;
  }
};

@Component({
  tag: 'app-history',
  styleUrl: 'app-history.css',
  shadow: true,
})
export class AppHistory {
  @Prop() language: LanguageCode = 'lb';
  @State() state: HistoryState = {
    loading: true,
    days: [],
    expanded: new Set<string>(),
  };

  private hasFirebase = false;

  async componentWillLoad() {
    this.hasFirebase = Boolean((window as any).__MIR_SINN_HAS_FIREBASE__);
    await this.loadHistory();
  }

  private async loadHistory() {
    this.state = {
      loading: true,
      days: [],
      expanded: new Set<string>(),
    };
    try {
      const days = this.hasFirebase
        ? await getRecentQuestions()
        : fallbackHistory;

      const filtered = days
        .filter(day => (day.dateKey || day.id) !== TODAY_KEY)
        .map(day => ({
          ...day,
          questions: (day.questions || []).map(question => ({
            ...question,
            dateKey: question.dateKey || day.dateKey || day.id,
          })),
        }))
        .filter(day => day.questions.length > 0);

      if (!filtered.length) {
        this.state = {
          loading: false,
          days: [],
          expanded: new Set<string>(),
        };
        return;
      }

      this.state = {
        loading: false,
        days: filtered.slice(0, MAX_ARCHIVE_DAYS),
        expanded: new Set<string>(),
      };
    } catch (error) {
      console.error(error);
      this.state = {
        loading: false,
        days: [],
        expanded: new Set<string>(),
        errorKey: 'load-failed',
      };
    }
  }

  private getLocalizedQuestion(question: QuestionDocument) {
    return question.question[this.language] || question.question.lb;
  }

  private getResults(question: QuestionDocument) {
    const total =
      question.results?.totalResponses ??
      Object.values(question.results?.perOption || {}).reduce(
        (acc, value) => acc + value,
        0,
      );
    return question.options.map(option => {
      const count = question.results?.perOption?.[option.id] ?? 0;
      const percentage = total ? (count / total) * 100 : 0;
      return {
        id: option.id,
        label: option.label[this.language] || option.label.lb,
        count,
        percentage: Math.round(percentage * 10) / 10,
      };
    });
  }

  private getSummary(question: QuestionDocument): string | null {
    const summary = question.results?.summary;
    if (!summary) {
      return null;
    }
    if (typeof summary === 'string') {
      return summary;
    }
    const localized = summary[this.language];
    return localized || summary.lb || summary.en || null;
  }

  render() {
    if (this.state.loading) {
      return (
        <div class="history-loading">
          <div class="loader-dot" />
          <div class="loader-dot" />
          <div class="loader-dot" />
        </div>
      );
    }

    if (this.state.errorKey) {
      const message = errorMessages[this.language];
      const retry = retryLabels[this.language];
      return (
        <div class="history-error">
          <p>{message}</p>
          <button class="primary" type="button" onClick={() => this.loadHistory()}>
            {retry}
          </button>
        </div>
      );
    }

    if (!this.state.days.length) {
      return (
        <div class="history-empty">
          <p>{emptyMessages[this.language]}</p>
        </div>
      );
    }

    return (
      <div class="history-list">
        {this.state.days.map(day => {
          const dateKey = day.dateKey || day.id;
          return (
            <section class="history-day" key={dateKey}>
              <div class="history-day-header">
                <span class="date">{formatDateLabel(dateKey, this.language)}</span>
              </div>
              <div class="history-day-list">
                {day.questions.map((question, index) => {
                  const toggleKey = `${dateKey}:${question.id}`;
                  const results = this.getResults(question);
                  const expanded = this.state.expanded.has(toggleKey);
                  const total =
                    question.results?.totalResponses ??
                    results.reduce((acc, item) => acc + item.count, 0);
                  const summaryText = this.getSummary(question);
                  const toggle = () => {
                    const expandedSet = new Set(this.state.expanded);
                    if (expandedSet.has(toggleKey)) {
                      expandedSet.delete(toggleKey);
                    } else {
                      expandedSet.add(toggleKey);
                    }
                    this.state = {
                      ...this.state,
                      expanded: expandedSet,
                    };
                  };
                  const orderDisplay = index + 1;
                  return (
                    <article class={{ 'history-card': true, expanded }} key={toggleKey}>
                      <button class="history-toggle" type="button" onClick={toggle}>
                        <header>
                          <div class="question-meta">
                            <span class="question-index">
                              {orderDisplay < 10 ? `0${orderDisplay}` : orderDisplay}
                            </span>
                            <h3>{this.getLocalizedQuestion(question)}</h3>
                          </div>
                        </header>
                        {!expanded && (
                          <span class="total-pill">
                            {totalLabel(this.language, total)}
                          </span>
                        )}
                      </button>
                      <div class={{ 'history-body': true, open: expanded }}>
                        <dl>
                          {results.map(result => (
                            <div class="result-row">
                              <dt>{result.label}</dt>
                              <dd>
                                <span class="bar">
                                  <span
                                    class="fill"
                                    style={{ width: `${result.percentage}%` }}
                                    aria-hidden="true"
                                  />
                                </span>
                                <span class="figures">
                                  <strong>{result.percentage.toFixed(1)}%</strong>
                                  <span class="count">({result.count})</span>
                                </span>
                              </dd>
                            </div>
                          ))}
                        </dl>
                        {expanded && summaryText && (
                          <p class="summary">{summaryText}</p>
                        )}

                        <footer class="history-footer">
                          <span class="total">
                            {totalLabel(this.language, total)}
                          </span>
                        </footer>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
        <p class="history-limit-note">{archiveLimitNote[this.language]}</p>
      </div>
    );
  }

}
