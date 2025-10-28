import { Component, Prop, State, Watch, h } from '@stencil/core';
import {
  getAnswerForDevice,
  getTodayQuestions,
  setAnswer,
  type QuestionDocument,
} from '../../services/firebase';
import { fallbackQuestions } from '../../services/mock-data';
import type { LanguageCode } from '../../types/language';
import { registerMessagingForDevice } from '../../services/messaging';
import { logAnalyticsEvent } from '../../services/analytics';

type ErrorKey = 'missing-question' | 'load-failed' | 'submit-failed';

interface QuestionAnswerState {
  selectedOption: string | null;
  alreadyAnswered: boolean;
  submitting: boolean;
  error?: ErrorKey;
}

interface ViewState {
  loading: boolean;
  questions: QuestionDocument[];
  errorKey?: ErrorKey;
}

const LUXEMBOURG_TZ = 'Europe/Luxembourg';

const getTodayKey = () => {
  const now = new Date();
  const [year, month, day] = now
    .toLocaleDateString('en-CA', { timeZone: LUXEMBOURG_TZ })
    .split('-');
  return `${month}-${day}-${year}`;
};

const getTodayLabel = (language: LanguageCode) => {
  const formatter = new Intl.DateTimeFormat(
    language === 'lb' ? 'de-LU' : language,
    {
      timeZone: LUXEMBOURG_TZ,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    },
  );
  return formatter.format(new Date());
};

const ANSWER_KEY_PREFIX = 'mir-sinn-answered-';
const TAG_VARIANT_COUNT = 6;

type CachedAnswer = {
  selectedOption: string | null;
  alreadyAnswered: boolean;
};

type QuestionCacheEntry = {
  dateKey: string | null;
  questions: QuestionDocument[];
  answers: Record<string, CachedAnswer>;
};

const questionCache: QuestionCacheEntry = {
  dateKey: null,
  questions: [],
  answers: {},
};

const copy: Record<
  LanguageCode,
  {
    questionsHeading: string;
    questionLabel: string;
    answerLabel: string;
    selectPlaceholder: string;
    submit: string;
    saving: string;
    retry: string;
    noQuestion: string;
    loadError: string;
    submitError: string;
    questionAnswered: string;
    allAnswered: string;
  }
> = {
  lb: {
    questionsHeading: 'Froen vum Dag',
    questionLabel: 'Fro',
    answerLabel: 'Är Äntwert',
    selectPlaceholder: '-- Wielt eng Optioun --',
    submit: 'Ofschécken',
    saving: 'Gëtt gespäichert…',
    retry: 'Nees probéieren',
    noQuestion:
      "D'Fro vum Dag ass nach net verfügbar. Probéiert et spéider nach eng Kéier.",
    loadError:
      'Et ass e Feeler opgetrueden. Kontrolléiert w.e.g. är Verbindung a probéiert nach eng Kéier.',
    submitError:
      'Mir konnten är Äntwert net späicheren. Probéiert et nach eng Kéier.',
    questionAnswered: "D'Fro gouf beäntwert.",
    allAnswered:
      'Merci. All Froen vum Dag goufen haut beäntwert. Kuckt muer zeréck fir d Resultater an déi nächst Froen.',
  },
  fr: {
    questionsHeading: 'Questions du jour',
    questionLabel: 'Question',
    answerLabel: 'Votre réponse',
    selectPlaceholder: '-- Choisissez une option --',
    submit: 'Envoyer',
    saving: 'Envoi…',
    retry: 'Réessayer',
    noQuestion:
      "La question du jour n'est pas encore disponible. Réessayez plus tard.",
    loadError:
      "Une erreur s'est produite. Vérifiez votre connexion et réessayez.",
    submitError:
      "Nous n'avons pas pu enregistrer votre réponse. Réessayez.",
    questionAnswered: 'La question a été répondue.',
    allAnswered:
      'Merci. Toutes les questions du jour ont été répondues. Revenez demain pour les résultats et les prochaines questions.',
  },
  de: {
    questionsHeading: 'Fragen des Tages',
    questionLabel: 'Frage',
    answerLabel: 'Deine Antwort',
    selectPlaceholder: '-- Option wählen --',
    submit: 'Absenden',
    saving: 'Wird gesendet…',
    retry: 'Erneut versuchen',
    noQuestion:
      'Die Tagesfrage ist noch nicht verfügbar. Bitte versuche es später erneut.',
    loadError:
      'Es ist ein Fehler aufgetreten. Bitte Verbindung prüfen und erneut versuchen.',
    submitError:
      'Deine Antwort konnte nicht gespeichert werden. Bitte erneut versuchen.',
    questionAnswered: 'Die Frage wurde beantwortet.',
    allAnswered:
      'Vielen Dank. Alle Fragen des Tages wurden beantwortet. Schau morgen wieder vorbei für die Ergebnisse und neue Fragen.',
  },
  en: {
    questionsHeading: 'Questions of the day',
    questionLabel: 'Question',
    answerLabel: 'Your answer',
    selectPlaceholder: '-- Choose an option --',
    submit: 'Submit',
    saving: 'Saving…',
    retry: 'Try again',
    noQuestion:
      'The question of the day is not available yet. Please try again later.',
    loadError:
      'Something went wrong. Check your connection and try again.',
    submitError:
      'We could not save your answer. Please try again.',
    questionAnswered: 'Question has been answered.',
    allAnswered:
      'Thank you. All questions of the day have been answered. Check back tomorrow for the results and the next questions.',
  },
};

@Component({
  tag: 'app-home',
  styleUrl: 'app-home.css',
  shadow: true,
})
export class AppHome {
  @Prop() language: LanguageCode = 'lb';

  @State() state: ViewState = { loading: true, questions: [] };
  @State() answers: Record<string, QuestionAnswerState> = {};
  @State() todayLabel: string = getTodayLabel('lb');

  private todayKey = getTodayKey();
  private hasFirebase = false;

  componentWillLoad() {
    this.hasFirebase = Boolean(
      (window as any).__MIR_SINN_HAS_FIREBASE__,
    );
    this.todayLabel = getTodayLabel(this.language);
    this.loadQuestions();
  }

  disconnectedCallback() {
    this.state = { loading: true, questions: [] };
    this.answers = {};
  }

  @Watch('language')
  languageChanged() {
    this.todayLabel = getTodayLabel(this.language);
    this.answers = { ...this.answers };
  }

  private get translations() {
    return copy[this.language] || copy.lb;
  }

  private get deviceId(): string | null {
    return (window as any).__DEVICE_ID__ || null;
  }

  private restoreCachedAnswers(questions: QuestionDocument[]) {
    const restored: Record<string, QuestionAnswerState> = {};
    questions.forEach(question => {
      const cached = questionCache.answers[question.id];
      restored[question.id] = {
        selectedOption: cached?.selectedOption ?? null,
        alreadyAnswered: cached?.alreadyAnswered ?? false,
        submitting: false,
      };
    });
    return restored;
  }

  private async fetchQuestions(): Promise<QuestionDocument[]> {
    if (!this.hasFirebase) {
      return fallbackQuestions.slice(0, 5);
    }
    const list = await getTodayQuestions(this.todayKey);
    return list.slice(0, 5);
  }

  private async resolveExistingAnswers(
    questions: QuestionDocument[],
  ): Promise<Record<string, QuestionAnswerState>> {
    const result: Record<string, QuestionAnswerState> = {};
    await Promise.all(
      questions.map(async question => {
        let alreadyAnswered = false;
        let selectedOption: string | null = null;

        if (this.hasFirebase && this.deviceId) {
          try {
            const stored = await getAnswerForDevice(
              this.todayKey,
              this.deviceId,
              question.id,
            );
            if (stored) {
              alreadyAnswered = true;
              selectedOption = stored.optionId;
            }
          } catch {
            alreadyAnswered = false;
          }
        } else {
          const local = this.readLocalAnswer(question.id);
          if (local) {
            alreadyAnswered = true;
            selectedOption = local;
          }
        }

        result[question.id] = {
          selectedOption,
          alreadyAnswered,
          submitting: false,
        };
      }),
    );
    return result;
  }

  private async loadQuestions() {
    if (
      questionCache.dateKey === this.todayKey &&
      questionCache.questions.length
    ) {
      this.state = {
        loading: false,
        questions: questionCache.questions,
      };
      this.answers = this.restoreCachedAnswers(questionCache.questions);
      return;
    }

    this.state = { loading: true, questions: [] };
    this.answers = {};

    try {
      const questions = await this.fetchQuestions();

      if (!questions.length) {
        this.state = {
          loading: false,
          questions: [],
          errorKey: 'missing-question',
        };
        questionCache.dateKey = this.todayKey;
        questionCache.questions = [];
        questionCache.answers = {};
        logAnalyticsEvent('question_loaded', {
          dateKey: this.todayKey,
          hasQuestion: false,
          questionCount: 0,
        });
        return;
      }

      const answers = await this.resolveExistingAnswers(questions);
      this.state = {
        loading: false,
        questions,
        errorKey: undefined,
      };
      this.answers = answers;

      questionCache.dateKey = this.todayKey;
      questionCache.questions = questions;
      questionCache.answers = questions.reduce<Record<string, CachedAnswer>>(
        (acc, question) => {
          const answer = answers[question.id];
          acc[question.id] = {
            selectedOption: answer?.selectedOption ?? null,
            alreadyAnswered: answer?.alreadyAnswered ?? false,
          };
          return acc;
        },
        {},
      );

      logAnalyticsEvent('question_loaded', {
        dateKey: this.todayKey,
        hasQuestion: true,
        questionCount: questions.length,
      });
    } catch (error) {
      console.error(error);
      this.state = {
        loading: false,
        questions: [],
        errorKey: 'load-failed',
      };
      questionCache.dateKey = null;
      questionCache.questions = [];
      questionCache.answers = {};
      logAnalyticsEvent('question_load_failed', {
        dateKey: this.todayKey,
      });
    }
  }

  private buildAnswerKey(questionId: string) {
    return `${ANSWER_KEY_PREFIX}${this.todayKey}-${questionId}`;
  }

  private readLocalAnswer(questionId: string): string | null {
    try {
      return localStorage.getItem(this.buildAnswerKey(questionId));
    } catch {
      return null;
    }
  }

  private writeLocalAnswer(questionId: string, optionId: string) {
    try {
      localStorage.setItem(this.buildAnswerKey(questionId), optionId);
    } catch {
      /* ignore */
    }
  }

  private handleOptionChange(questionId: string, event: Event) {
    const select = event.target as HTMLSelectElement;
    const selectedOption = select.value || null;
    const existing = this.answers[questionId] || {
      selectedOption: null,
      alreadyAnswered: false,
      submitting: false,
    };

    this.answers = {
      ...this.answers,
      [questionId]: {
        ...existing,
        selectedOption,
        error: undefined,
      },
    };

    const cached = questionCache.answers[questionId] || {
      selectedOption: null,
      alreadyAnswered: false,
    };
    questionCache.answers[questionId] = {
      ...cached,
      selectedOption,
    };
  }

  private getLocalizedQuestion(question: QuestionDocument | undefined) {
    if (!question) return '';
    return question.question[this.language] || question.question.lb;
  }

  private getLocalizedSummary(question: QuestionDocument | undefined) {
    const summary =
      question?.article?.summary || question?.results?.summary;
    if (!summary) return '';
    return summary[this.language] || summary.lb || summary.en || '';
  }

  private getLocalizedOptions(question: QuestionDocument | undefined) {
    if (!question) return [];
    return question.options.map(option => ({
      id: option.id,
      label: option.label[this.language] || option.label.lb,
    }));
  }

  private getLocalizedTags(question: QuestionDocument | undefined) {
    if (!question?.tags) return [];
    return question.tags
      .map(tag => {
        if (!tag) return null;
        const label =
          tag[this.language] ||
          tag.lb ||
          tag.en ||
          tag.fr ||
          tag.de ||
          '';
        return label?.trim() ? label.trim() : null;
      })
      .filter((label): label is string => Boolean(label));
  }

  private async handleSubmit(
    event: Event,
    question: QuestionDocument,
  ) {
    event.preventDefault();
    const current = this.answers[question.id];
    if (!current || !current.selectedOption || current.alreadyAnswered) {
      return;
    }

    this.answers = {
      ...this.answers,
      [question.id]: {
        ...current,
        submitting: true,
        error: undefined,
      },
    };

    try {
      if (this.hasFirebase && this.deviceId) {
        await setAnswer(this.todayKey, question.id, this.deviceId, {
          deviceId: this.deviceId,
          optionId: current.selectedOption,
          language: this.language,
          answeredAt: new Date().toISOString(),
          questionId: question.id,
        });
        registerMessagingForDevice(this.deviceId, true);
      } else {
        this.writeLocalAnswer(question.id, current.selectedOption);
      }

      this.answers = {
        ...this.answers,
        [question.id]: {
          ...current,
          submitting: false,
          alreadyAnswered: true,
          error: undefined,
        },
      };

      questionCache.answers[question.id] = {
        selectedOption: current.selectedOption,
        alreadyAnswered: true,
      };

      logAnalyticsEvent('answer_recorded', {
        dateKey: this.todayKey,
        questionId: question.id,
        option: current.selectedOption,
        language: this.language,
        viaFirebase: this.hasFirebase,
      });
    } catch (error) {
      console.error(error);
      this.answers = {
        ...this.answers,
        [question.id]: {
          ...current,
          submitting: false,
          error: 'submit-failed',
        },
      };
    }
  }

  private renderLoader() {
    return (
      <div class="page-loader">
        <span class="page-loader-dot dot-red" />
        <span class="page-loader-dot dot-white" />
        <span class="page-loader-dot dot-red" />
      </div>
    );
  }

  private renderError(errorKey: ErrorKey) {
    const translations = this.translations;
    const message =
      errorKey === 'missing-question'
        ? translations.noQuestion
        : translations.loadError;

    return (
      <div class="error-state">
        <p>{message}</p>
        {errorKey !== 'missing-question' && (
          <button
            class="primary"
            type="button"
            onClick={() => this.loadQuestions()}
          >
            {translations.retry}
          </button>
        )}
      </div>
    );
  }

  private renderAnsweredSummary(question: QuestionDocument) {
    const translations = this.translations;
    const summary = this.getLocalizedSummary(question);
    return (
      <div class="answered-block">
        <p class="answered-message">{translations.questionAnswered}</p>
        {summary && <p class="answered-summary">{summary}</p>}
      </div>
    );
  }

  private renderQuestionPanel(
    question: QuestionDocument,
    index: number,
  ) {
    const translations = this.translations;
    const answerState =
      this.answers[question.id] || {
        selectedOption: null,
        alreadyAnswered: false,
        submitting: false,
      };
    const options = this.getLocalizedOptions(question);
    const selectValue = answerState.selectedOption ?? '';
    const tags = this.getLocalizedTags(question);

    return (
      <section class="question-panel">
        <header class="question-panel__header">
          <span class="question-panel__number">
            {translations.questionLabel} {index + 1}
          </span>
          <h2>{this.getLocalizedQuestion(question)}</h2>
          {tags.length ? (
            <ul class="tag-list">
              {tags.map((tag, tagIndex) => {
                const variant =
                  (tagIndex % TAG_VARIANT_COUNT) + 1;
                return (
                  <li class={`tag-chip tag-chip--${variant}`}>
                    <span>{tag}</span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </header>
        {!answerState.alreadyAnswered ? (
          <form
            class="question-form"
            onSubmit={event => this.handleSubmit(event, question)}
          >
            <label class="question-form__label">
              <span>{translations.answerLabel}</span>
              <select
                onInput={event => this.handleOptionChange(question.id, event)}
                aria-label={translations.answerLabel}
              >
                <option value="" selected={!selectValue}>
                  {translations.selectPlaceholder}
                </option>
                {options.map(option => (
                  <option
                    value={option.id}
                    selected={selectValue === option.id}
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {answerState.error === 'submit-failed' && (
              <p class="form-error">{translations.submitError}</p>
            )}
            <button
              class="primary"
              type="submit"
              disabled={
                !answerState.selectedOption || answerState.submitting
              }
            >
              {answerState.submitting
                ? translations.saving
                : translations.submit}
            </button>
          </form>
        ) : (
          this.renderAnsweredSummary(question)
        )}
      </section>
    );
  }

  private renderPlaceholderPanel(index: number) {
    const translations = this.translations;
    return (
      <section class="question-panel question-panel--empty">
        <header class="question-panel__header">
          <span class="question-panel__number">
            {translations.questionLabel} {index + 1}
          </span>
          <h2>{translations.noQuestion}</h2>
        </header>
      </section>
    );
  }

  render() {
    if (this.state.loading) {
      return this.renderLoader();
    }

    if (this.state.errorKey === 'load-failed') {
      return this.renderError('load-failed');
    }

    const translations = this.translations;
    const questions = this.state.questions;
    const totalPanels = 5;
    const answeredCount = questions.filter(question => {
      const state = this.answers[question.id];
      return state?.alreadyAnswered;
    }).length;
    const allAnswered = questions.length > 0 && answeredCount >= questions.length;

    if (allAnswered) {
      return (
        <div class="home home--completed">
          <div class="completion-message">
            <h1>{translations.questionsHeading}</h1>
            <p>{translations.allAnswered}</p>
          </div>
        </div>
      );
    }

    const panels = Array.from({ length: totalPanels }, (_, index) => {
      const question = questions[index];
      return question
        ? this.renderQuestionPanel(question, index)
        : this.renderPlaceholderPanel(index);
    });

    return (
      <div class="home">
        <header class="page-header">
          <h1>{translations.questionsHeading}</h1>
          <span class="page-date">{this.todayLabel}</span>
        </header>
        {this.state.errorKey === 'missing-question'
          ? this.renderError('missing-question')
          : null}
        <div class="question-grid">{panels}</div>
      </div>
    );
  }
}
