import { Component, Prop, State, Watch, h } from '@stencil/core';
import { Router } from '../../';
import {
  getAnswerForDevice,
  getTodayQuestionDoc,
  setAnswer,
  type QuestionDocument,
} from '../../services/firebase';
import { fallbackQuestion } from '../../services/mock-data';
import type { LanguageCode } from '../../types/language';
type ErrorKey = 'missing-question' | 'load-failed' | 'submit-failed';

interface ViewState {
  loading: boolean;
  question?: QuestionDocument;
  alreadyAnswered: boolean;
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

const copy: Record<
  LanguageCode,
  {
    context: string;
    answerLabel: string;
    selectPlaceholder: string;
    submit: string;
    saving: string;
    shareButton: string;
    shareSuccess: string;
    shareError: string;
    resultsInfo: string;
    historyLink: string;
    retry: string;
    noQuestion: string;
    loadError: string;
    submitError: string;
    alreadyAnswered: string;
    shareTextSuffix: string;
  }
> = {
  lb: {
    context: "Däin Feedback hëlleft eis ze verstoen, wéi Lëtzebuerg denkt.",
    answerLabel: 'Är Äntwert',
    selectPlaceholder: '-- Wielt eng Optioun --',
    submit: 'Ofschécken',
    saving: 'Gëtt gespäichert…',
    shareButton: "Deel d'App",
    shareSuccess: 'Dee Link ass gedeelt. Merci!',
    shareError: 'Konnt net automatesch gedeelt ginn. Kopéiert de Link manuell.',
    resultsInfo: 'Déi detailléiert Resultater fannt Dir muer am Archiv.',
    historyLink: 'Kuckt fréier Froen',
    retry: 'Nees probéieren',
    noQuestion:
      "D'Fro vum Dag ass nach net verfügbar. Probéiert et spéider nach eng Kéier.",
    loadError:
      'Et ass e Feeler opgetrueden. Kontrolléiert w.e.g. är Verbindung a probéiert nach eng Kéier.',
    submitError:
      'Mir konnten är Äntwert net späicheren. Probéiert et nach eng Kéier.',
    alreadyAnswered:
      "Dir hutt dës Fro schonn haut beäntwert. Kuckt muer zeréck fir d'Resultater!",
    shareTextSuffix: "Beäntwert d'Fro am Mir Sinn App.",
  },
  fr: {
    context:
      'Ton avis nous aide à comprendre ce que pense le Luxembourg.',
    answerLabel: 'Votre réponse',
    selectPlaceholder: '-- Choisissez une option --',
    submit: 'Envoyer',
    saving: 'Envoi…',
    shareButton: "Partager l'app",
    shareSuccess: 'Lien copié ou partagé. Merci !',
    shareError:
      'Impossible de partager automatiquement. Copiez le lien manuellement.',
    resultsInfo:
      'Les résultats détaillés seront visibles demain dans la rubrique Historique.',
    historyLink: 'Voir les questions précédentes',
    retry: 'Réessayer',
    noQuestion:
      "La question du jour n'est pas encore disponible. Réessayez plus tard.",
    loadError:
      "Une erreur s'est produite. Vérifiez votre connexion et réessayez.",
    submitError:
      "Nous n'avons pas pu enregistrer votre réponse. Réessayez.",
    alreadyAnswered:
      "Vous avez déjà répondu à la question d'aujourd'hui. Revenez demain pour voir les résultats !",
    shareTextSuffix:
      "Réponds à la question dans l'application Mir Sinn.",
  },
  de: {
    context: 'Deine Stimme zeigt, was Luxemburg denkt.',
    answerLabel: 'Deine Antwort',
    selectPlaceholder: '-- Option wählen --',
    submit: 'Absenden',
    saving: 'Wird gesendet…',
    shareButton: 'App teilen',
    shareSuccess: 'Geteilt! Merci.',
    shareError:
      'Konnte nicht automatisch geteilt werden. Kopiere den Link manuell.',
    resultsInfo:
      'Die detaillierten Resultate seht ihr morgen im Archiv.',
    historyLink: 'Frühere Fragen ansehen',
    retry: 'Erneut versuchen',
    noQuestion:
      'Die Tagesfrage ist noch nicht verfügbar. Bitte versuche es später erneut.',
    loadError:
      'Es ist ein Fehler aufgetreten. Bitte Verbindung prüfen und erneut versuchen.',
    submitError:
      'Deine Antwort konnte nicht gespeichert werden. Bitte erneut versuchen.',
    alreadyAnswered:
      'Sie haben die heutige Frage bereits beantwortet. Schauen Sie morgen wieder vorbei, um die Ergebnisse zu sehen!',
    shareTextSuffix:
      'Beantworte die Frage in der Mir Sinn App.',
  },
  en: {
    context: 'Your voice helps us understand how Luxembourg thinks.',
    answerLabel: 'Your answer',
    selectPlaceholder: '-- Choose an option --',
    submit: 'Submit',
    saving: 'Saving…',
    shareButton: 'Share the app',
    shareSuccess: 'Shared! Thank you.',
    shareError:
      'Could not share automatically. Please copy the link manually.',
    resultsInfo:
      'Detailed results are available tomorrow in the History section.',
    historyLink: 'View previous questions',
    retry: 'Try again',
    noQuestion:
      'The question of the day is not available yet. Please try again later.',
    loadError:
      'Something went wrong. Check your connection and try again.',
    submitError:
      'We could not save your answer. Please try again.',
    alreadyAnswered:
      "You already answered today's question. Come back tomorrow to see the results!",
    shareTextSuffix:
      'Answer the question in the Mir Sinn app.',
  },
};

const ANSWER_KEY_PREFIX = 'mir-sinn-answered-';

@Component({
  tag: 'app-home',
  styleUrl: 'app-home.css',
  shadow: true,
})
export class AppHome {
  @Prop() language: LanguageCode = 'lb';

  @State() state: ViewState = { loading: true, alreadyAnswered: false };
  @State() selectedOption: string | null = null;
  @State() submitting = false;
  @State() shareStatus: 'idle' | 'success' | 'error' = 'idle';

  private todayKey = getTodayKey();
  private hasFirebase = false;

  async componentWillLoad() {
    this.hasFirebase = Boolean((window as any).__MIR_SINN_HAS_FIREBASE__);
    await this.loadQuestion();
  }

  @Watch('language')
  languageChanged() {
    this.shareStatus = 'idle';
  }

  private get deviceId(): string | null {
    return (window as any).__DEVICE_ID__ || null;
  }

  private get translations() {
    return copy[this.language];
  }

  private async loadQuestion() {
    this.state = { loading: true, alreadyAnswered: false };
    console.log(this.todayKey);
    try {
      const question = this.hasFirebase
        ? await getTodayQuestionDoc(this.todayKey)
        : fallbackQuestion;

      if (!question) {
        this.state = {
          loading: false,
          alreadyAnswered: false,
          errorKey: 'missing-question',
        };
        return;
      }

      let alreadyAnswered = false;
      let selectedOption: string | null = null;

      if (this.hasFirebase && this.deviceId) {
        const storedAnswer = await getAnswerForDevice(
          this.todayKey,
          this.deviceId,
        );
        if (storedAnswer) {
          alreadyAnswered = true;
          selectedOption = storedAnswer.optionId;
        }
      } else {
        try {
          const stored = localStorage.getItem(
            `${ANSWER_KEY_PREFIX}${this.todayKey}`,
          );
          if (stored) {
            alreadyAnswered = true;
            selectedOption = stored;
          }
        } catch {
          alreadyAnswered = false;
        }
      }

      this.selectedOption = selectedOption;

      this.state = {
        loading: false,
        question,
        alreadyAnswered,
      };
    } catch (error) {
      console.error(error);
      this.state = {
        loading: false,
        alreadyAnswered: false,
        errorKey: 'load-failed',
      };
    }
  }

  private handleSelectChange = (event: Event) => {
    const select = event.target as HTMLSelectElement;
    this.selectedOption = select.value;
  };

  private getLocalizedQuestion(question: QuestionDocument | undefined) {
    if (!question) return '';
    return question.question[this.language] || question.question.lb;
  }

  private getLocalizedSummary(question: QuestionDocument | undefined) {
    const summary = question?.article?.summary;
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

  private async handleSubmit(event: Event) {
    event.preventDefault();
    if (
      !this.state.question ||
      !this.selectedOption ||
      this.state.alreadyAnswered
    ) {
      return;
    }

    this.submitting = true;

    try {
      if (this.hasFirebase && this.deviceId) {
        await setAnswer(this.todayKey, this.deviceId, {
          deviceId: this.deviceId,
          optionId: this.selectedOption,
          language: this.language,
          answeredAt: new Date().toISOString(),
        });
      } else {
        try {
          localStorage.setItem(
            `${ANSWER_KEY_PREFIX}${this.todayKey}`,
            this.selectedOption,
          );
        } catch {
          // ignore local demo storage issues
        }
      }

      this.state = {
        ...this.state,
        alreadyAnswered: true,
        errorKey: undefined,
      };
      this.shareStatus = 'idle';
    } catch (error) {
      console.error(error);
      this.state = {
        ...this.state,
        errorKey: 'submit-failed',
      };
    } finally {
      this.submitting = false;
    }
  }

  private async handleShare() {
    if (!this.state.question) return;
    const translations = this.translations;
    const shareData = {
      title: 'Mir Sinn - Fro vum Dag',
      text: `${this.getLocalizedQuestion(
        this.state.question,
      )}\n\n${translations.shareTextSuffix}`,
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        this.shareStatus = 'success';
      } catch (err) {
        console.warn('Share cancelled or failed', err);
        this.shareStatus = 'error';
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(
        `${shareData.text} ${shareData.url}`,
      );
      this.shareStatus = 'success';
    } catch (err) {
      console.warn('Fallback share failed', err);
      this.shareStatus = 'error';
    }
  }

  private renderLoader() {
    return (
      <div class="card card-loading">
        <div class="loader-dot" />
        <div class="loader-dot" />
        <div class="loader-dot" />
      </div>
    );
  }

  private renderError(errorKey: ErrorKey) {
    const translations = this.translations;
    const message =
      errorKey === 'missing-question'
        ? translations.noQuestion
        : errorKey === 'load-failed'
        ? translations.loadError
        : translations.submitError;

    return (
      <div class="card error-card">
        <p>{message}</p>
        <button class="primary" type="button" onClick={() => this.loadQuestion()}>
          {translations.retry}
        </button>
      </div>
    );
  }

  private renderAnswerForm(question: QuestionDocument) {
    const translations = this.translations;
    const options = this.getLocalizedOptions(question);

    return (
      <form class="answer-form" onSubmit={event => this.handleSubmit(event)}>
        <label htmlFor="answer-select">{translations.answerLabel}</label>
        <select
          id="answer-select"
          required
          onInput={this.handleSelectChange}
        >
          <option value="" disabled selected={!this.selectedOption}>
            {translations.selectPlaceholder}
          </option>
          {options.map(option => (
            <option
              value={option.id}
              selected={this.selectedOption === option.id}
            >
              {option.label}
            </option>
          ))}
        </select>
        <button
          class="primary"
          type="submit"
          disabled={this.submitting || !this.selectedOption}
        >
          {this.submitting ? translations.saving : translations.submit}
        </button>
      </form>
    );
  }

  private renderAlreadyAnswered() {
    return (
      <div class="already-answered">
        <p>{this.translations.alreadyAnswered}</p>
      </div>
    );
  }

  render() {
    if (this.state.loading) {
      return this.renderLoader();
    }

    if (this.state.errorKey) {
      return this.renderError(this.state.errorKey);
    }

    const question = this.state.question;
    if (!question) {
      return null;
    }

    const translations = this.translations;
    const questionText = this.getLocalizedQuestion(question);
    const summaryText = this.getLocalizedSummary(question);

    return (
      <div class="question-view">
        <section class="card question-card">
          <header>
            <span class="meta">{getTodayLabel(this.language)}</span>
            {summaryText && <p class="article-summary">{summaryText}</p>}
            <h2>{questionText}</h2>
          </header>
          <p class="context">
            <span>{translations.context}</span>
          </p>
          {this.state.alreadyAnswered
            ? this.renderAlreadyAnswered()
            : this.renderAnswerForm(question)}
        </section>

        <section class="card action-card">
          <button class="secondary" type="button" onClick={() => this.handleShare()}>
            <span>{translations.shareButton}</span>
            <span aria-hidden="true">📣</span>
          </button>
          {this.shareStatus === 'success' && (
            <p class="share-feedback">{translations.shareSuccess}</p>
          )}
          {this.shareStatus === 'error' && (
            <p class="share-feedback error">{translations.shareError}</p>
          )}
        </section>

        <section class="card info-card">
          <p>{translations.resultsInfo}</p>
          <button class="link-button" type="button" onClick={() => Router.push('/history')}>
            {translations.historyLink}
          </button>
        </section>
      </div>
    );
  }
}
