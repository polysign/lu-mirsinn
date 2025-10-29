import { Component, Element, Prop, State, Watch, h } from '@stencil/core';
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

type ShareStatus = 'idle' | 'shared' | 'copied' | 'error';

const questionProgressFormatters: Record<
  LanguageCode,
  (current: number, total: number) => string
> = {
  lb: (current, total) => `Fro ${current} vun ${total}`,
  fr: (current, total) => `Question ${current} sur ${total}`,
  de: (current, total) => `Frage ${current} von ${total}`,
  en: (current, total) => `Question ${current} of ${total}`,
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
    sharePanelLabel: string;
    sharePanelTitle: string;
    sharePanelDescription: string;
    shareButton: string;
    shareStatusShared: string;
    shareStatusCopied: string;
    shareStatusError: string;
    shareShareText: string;
    installPanelLabel: string;
    installPanelTitle: string;
    installPanelDescription: string;
    installPanelShowSteps: string;
    installPanelHideSteps: string;
    installPanelDismiss: string;
    installPanelHelpTitle: string;
    installPanelSteps: string[];
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
    sharePanelLabel: 'Weider soen',
    sharePanelTitle: 'Deel Mir Sinn mat Frënn',
    sharePanelDescription:
      'Deelt d App a loosst är Frënn haut matstëmmen.',
    shareButton: 'App deelen',
    shareStatusShared: 'Merci fir ze deelen!',
    shareStatusCopied: 'Link gouf an de Clipboard kopéiert.',
    shareStatusError:
      'Link konnt net gedeelt ginn. Probéiert et nach eng Kéier.',
    shareShareText: 'Kommt mat op Mir Sinn a stëmmt mat:',
    installPanelLabel: 'Homescreen',
    installPanelTitle: 'Setzt Mir Sinn op ären Homescreen',
    installPanelDescription:
      'Fir d\'App séier erëmzefannen, maacht de Browser-Menü op a wielt "Zum Startbildschierm derbäisetzen" oder eng änlech Optioun.',
    installPanelShowSteps: 'Schrëtt weisen',
    installPanelHideSteps: 'Schrëtt verstoppen',
    installPanelDismiss: 'Vläicht méi spéit',
    installPanelHelpTitle: 'Sou geet et',
    installPanelSteps: [
      'Maacht de Browser-Menü op (⋮ oder Deelen-Symbol).',
      'Wielt "Zum Startbildschierm derbäisetzen" oder "Op den Homescreen".',
      'Bestätegt fir Mir Sinn derbäi ze maachen.',
    ],
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
    sharePanelLabel: 'Partagez',
    sharePanelTitle: 'Invitez vos amis sur Mir Sinn',
    sharePanelDescription:
      "Partagez l'app et laissez vos amis donner leur avis sur la question du jour.",
    shareButton: "Partager l'app",
    shareStatusShared: 'Merci pour le partage !',
    shareStatusCopied: 'Lien copié dans le presse-papiers.',
    shareStatusError:
      'Impossible de partager. Copiez le lien manuellement.',
    shareShareText:
      'Rejoins-moi sur Mir Sinn et réponds à la question du jour :',
    installPanelLabel: "Écran d'accueil",
    installPanelTitle: "Ajoute Mir Sinn à ton écran d'accueil",
    installPanelDescription:
      'Ouvre le menu du navigateur puis choisis "Ajouter à l\'écran d\'accueil" ou une option équivalente.',
    installPanelShowSteps: 'Voir les étapes',
    installPanelHideSteps: 'Masquer les étapes',
    installPanelDismiss: 'Plus tard',
    installPanelHelpTitle: 'Comment faire',
    installPanelSteps: [
      'Ouvre le menu du navigateur (⋮ ou icône de partage).',
      'Choisis "Ajouter à l\'écran d\'accueil" ou une option similaire.',
      'Confirme pour ajouter Mir Sinn.',
    ],
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
    sharePanelLabel: 'Weitersagen',
    sharePanelTitle: 'Lade Freunde zu Mir Sinn ein',
    sharePanelDescription:
      'Teile die App, damit deine Freunde bei der Frage des Tages mitmachen können.',
    shareButton: 'App teilen',
    shareStatusShared: 'Danke fürs Teilen!',
    shareStatusCopied: 'Link wurde in die Zwischenablage kopiert.',
    shareStatusError:
      'Teilen nicht möglich. Bitte Link manuell kopieren.',
    shareShareText:
      'Komm zu Mir Sinn und beantworte die Frage des Tages:',
    installPanelLabel: 'Homescreen',
    installPanelTitle: 'Füge Mir Sinn deinem Homescreen hinzu',
    installPanelDescription:
      'Öffne das Browser-Menü und wähle "Zum Startbildschirm hinzufügen", um Mir Sinn schnell wiederzufinden.',
    installPanelShowSteps: 'Schritte anzeigen',
    installPanelHideSteps: 'Schritte ausblenden',
    installPanelDismiss: 'Später erinnern',
    installPanelHelpTitle: 'So funktioniert es',
    installPanelSteps: [
      'Öffne das Browser-Menü (⋮ oder Teilen-Symbol).',
      'Wähle "Zum Startbildschirm hinzufügen" oder eine ähnliche Option.',
      'Bestätige, um Mir Sinn hinzuzufügen.',
    ],
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
    sharePanelLabel: 'Spread the word',
    sharePanelTitle: 'Invite friends to Mir Sinn',
    sharePanelDescription:
      "Share the app and let your friends have their say in today's question.",
    shareButton: 'Share the app',
    shareStatusShared: 'Thanks for sharing Mir Sinn!',
    shareStatusCopied: 'Link copied to clipboard.',
    shareStatusError:
      'Unable to share. Please copy the link manually.',
    shareShareText:
      "Join me on Mir Sinn and answer today's questions:",
    installPanelLabel: 'Home screen',
    installPanelTitle: 'Add Mir Sinn to your home screen',
    installPanelDescription:
      'Open your browser menu and choose "Add to Home Screen" to install Mir Sinn for quick access.',
    installPanelShowSteps: 'Show steps',
    installPanelHideSteps: 'Hide steps',
    installPanelDismiss: 'Maybe later',
    installPanelHelpTitle: 'How it works',
    installPanelSteps: [
      'Open the browser menu (⋮ or share icon).',
      'Choose "Add to Home Screen" or a similar option.',
      'Confirm to add Mir Sinn.',
    ],
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
  @State() shareStatus: ShareStatus = 'idle';
  @State() questionDismissals: Record<string, 'idle' | 'exiting' | 'hidden'> =
    {};
  @State() showInstallPanel = false;
  @State() showInstallHelp = false;
  @State() visibleQuestionIds: string[] = [];
  @State() enteringQuestionId: string | null = null;

  @Element() hostElement!: HTMLElement;

  private todayKey = getTodayKey();
  private hasFirebase = false;
  private shareStatusResetHandle?: number;
  private confettiContainer?: HTMLDivElement;
  private queuedQuestionId: string | null = null;

  componentWillLoad() {
    this.hasFirebase = Boolean(
      (window as any).__MIR_SINN_HAS_FIREBASE__,
    );
    this.todayLabel = getTodayLabel(this.language);
    this.showInstallPanel = this.shouldShowInstallPanel();
    this.loadQuestions();
  }

  componentDidLoad() {
    this.ensureConfettiContainer();
    this.showInstallPanel = this.shouldShowInstallPanel();
  }

  disconnectedCallback() {
    this.state = { loading: true, questions: [] };
    this.answers = {};
    if (this.shareStatusResetHandle) {
      window.clearTimeout(this.shareStatusResetHandle);
      this.shareStatusResetHandle = undefined;
    }
    this.shareStatus = 'idle';
    this.questionDismissals = {};
    this.showInstallPanel = false;
    this.showInstallHelp = false;
    this.visibleQuestionIds = [];
    this.enteringQuestionId = null;
    this.queuedQuestionId = null;
    if (this.confettiContainer) {
      this.confettiContainer.remove();
      this.confettiContainer = undefined;
    }
  }

  @Watch('language')
  languageChanged() {
    this.todayLabel = getTodayLabel(this.language);
    this.answers = { ...this.answers };
    this.showInstallHelp = false;
  }

  private get translations() {
    return copy[this.language] || copy.lb;
  }

  private formatQuestionProgress(current: number, total: number) {
    const formatter =
      questionProgressFormatters[this.language] ||
      questionProgressFormatters.lb;
    return formatter(current, total);
  }

  private setShareStatus(status: ShareStatus) {
    if (this.shareStatusResetHandle) {
      window.clearTimeout(this.shareStatusResetHandle);
      this.shareStatusResetHandle = undefined;
    }

    this.shareStatus = status;

    if (status !== 'idle') {
      this.shareStatusResetHandle = window.setTimeout(() => {
        this.shareStatus = 'idle';
        this.shareStatusResetHandle = undefined;
      }, 4000);
    }
  }

  private ensureConfettiContainer() {
    if (this.confettiContainer || !this.hostElement?.shadowRoot) {
      return;
    }
    const container = document.createElement('div');
    container.className = 'confetti-container';
    this.hostElement.shadowRoot.appendChild(container);
    this.confettiContainer = container;
  }

  private computeInitialVisibleQuestions(
    questions: QuestionDocument[],
    answers: Record<string, QuestionAnswerState>,
  ) {
    const firstUnanswered = questions.find(
      question => !(answers[question.id]?.alreadyAnswered),
    );
    this.visibleQuestionIds = firstUnanswered ? [firstUnanswered.id] : [];
    this.enteringQuestionId = firstUnanswered ? firstUnanswered.id : null;
  }

  private shouldShowInstallPanel(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    try {
      if (
        window.matchMedia &&
        window.matchMedia('(display-mode: standalone)').matches
      ) {
        return false;
      }
    } catch {
      /* ignore media query errors */
    }

    try {
      if ((window.navigator as any).standalone === true) {
        return false;
      }
    } catch {
      /* ignore standalone detection errors */
    }

    try {
      const dismissed = localStorage.getItem('mir-sinn-install-dismissed');
      if (dismissed) {
        const dismissedTime = Number(dismissed);
        if (!Number.isNaN(dismissedTime)) {
          const day = 24 * 60 * 60 * 1000;
          if (Date.now() - dismissedTime < day) {
            return false;
          }
        }
      }
    } catch {
      /* ignore storage issues */
    }

    return true;
  }

  private findNextQuestionId(fromQuestionId: string): string | null {
    const questions = this.state.questions;
    if (!questions.length) return null;
    const currentIndex = questions.findIndex(
      question => question.id === fromQuestionId,
    );
    if (currentIndex === -1) return null;

    for (let index = currentIndex + 1; index < questions.length; index += 1) {
      const nextQuestion = questions[index];
      const answerState = this.answers[nextQuestion.id];
      if (answerState?.alreadyAnswered) {
        continue;
      }
      return nextQuestion.id;
    }
    return null;
  }

  private queueNextQuestion(fromQuestionId: string) {
    this.queuedQuestionId = this.findNextQuestionId(fromQuestionId);
  }

  private revealQueuedQuestion() {
    const nextId = this.queuedQuestionId;
    if (!nextId) {
      return;
    }
    this.queuedQuestionId = null;

    const nextQuestion = this.state.questions.find(
      question => question.id === nextId,
    );
    if (!nextQuestion) return;

    const answerState = this.answers[nextId];
    if (answerState?.alreadyAnswered) {
      return;
    }

    if (!this.visibleQuestionIds.includes(nextId)) {
      this.visibleQuestionIds = [...this.visibleQuestionIds, nextId];
    }

    this.questionDismissals = {
      ...this.questionDismissals,
      [nextId]: 'idle',
    };
    this.enteringQuestionId = nextId;
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
      this.questionDismissals = questionCache.questions.reduce<
        Record<string, 'idle' | 'exiting' | 'hidden'>
      >((acc, question) => {
        const cached = questionCache.answers[question.id];
        if (cached?.alreadyAnswered) {
          acc[question.id] = 'hidden';
        }
        return acc;
      }, {});
      this.computeInitialVisibleQuestions(
        questionCache.questions,
        this.answers,
      );
      this.queuedQuestionId = null;
      return;
    }

    this.state = { loading: true, questions: [] };
    this.answers = {};
    this.questionDismissals = {};
    this.visibleQuestionIds = [];
    this.enteringQuestionId = null;
    this.queuedQuestionId = null;

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
        this.visibleQuestionIds = [];
        this.enteringQuestionId = null;
        this.queuedQuestionId = null;
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
      this.questionDismissals = questions.reduce<
        Record<string, 'idle' | 'exiting' | 'hidden'>
      >((acc, question) => {
        const answer = answers[question.id];
        if (answer?.alreadyAnswered) {
          acc[question.id] = 'hidden';
        }
        return acc;
      }, {});
      this.computeInitialVisibleQuestions(questions, answers);

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
      this.visibleQuestionIds = [];
      this.enteringQuestionId = null;
      this.queuedQuestionId = null;
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

  private triggerQuestionDismiss(questionId: string) {
    const current = this.questionDismissals[questionId];
    if (current === 'hidden' || current === 'exiting') {
      return;
    }
    if (this.enteringQuestionId === questionId) {
      this.enteringQuestionId = null;
    }
    this.questionDismissals = {
      ...this.questionDismissals,
      [questionId]: 'exiting',
    };
  }

  private handlePanelAnimationEnd(
    questionId: string,
    event: AnimationEvent,
  ) {
    if (event.target !== event.currentTarget) {
      return;
    }

    if (event.animationName === 'question-enter') {
      if (this.enteringQuestionId === questionId) {
        this.enteringQuestionId = null;
      }
      return;
    }

    if (
      event.target !== event.currentTarget ||
      event.animationName !== 'question-dismiss' ||
      this.questionDismissals[questionId] === 'hidden'
    ) {
      return;
    }
    this.questionDismissals = {
      ...this.questionDismissals,
      [questionId]: 'hidden',
    };
    this.visibleQuestionIds = this.visibleQuestionIds.filter(
      id => id !== questionId,
    );
    this.revealQueuedQuestion();
  }

  private async handleShareClick() {
    const translations = this.translations;
    const shareUrl =
      (typeof window !== 'undefined' && window.location?.origin) ||
      'https://mir-sinn.lu';
    const shareText = translations.shareShareText;

    if (typeof navigator === 'undefined') {
      this.setShareStatus('error');
      return;
    }

    const nav = navigator as Navigator & {
      share?: (data: ShareData) => Promise<void>;
    };

    try {
      if (typeof nav?.share === 'function') {
        await nav.share({
          title: 'Mir Sinn',
          text: shareText,
          url: shareUrl,
        });
        this.setShareStatus('shared');
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        this.setShareStatus('idle');
        return;
      }
      console.warn('[share] navigator.share failed, falling back', error);
    }

    const combined = `${shareText} ${shareUrl}`.trim();

    try {
      if (
        typeof navigator.clipboard?.writeText === 'function'
      ) {
        await navigator.clipboard.writeText(combined);
        this.setShareStatus('copied');
        return;
      }
    } catch (error) {
      console.warn('[share] clipboard.writeText failed', error);
    }

    try {
      const textarea = document.createElement('textarea');
      textarea.value = combined;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (copied) {
        this.setShareStatus('copied');
        return;
      }
    } catch (error) {
      console.warn('[share] execCommand copy failed', error);
    }

    this.setShareStatus('error');
  }

  private handleInstallHelpToggle() {
    const next = !this.showInstallHelp;
    this.showInstallHelp = next;
    logAnalyticsEvent('install_panel_steps_toggle', {
      language: this.language,
      open: next,
    });
  }

  private handleInstallPanelDismiss() {
    this.showInstallPanel = false;
    this.showInstallHelp = false;
    try {
      localStorage.setItem('mir-sinn-install-dismissed', String(Date.now()));
    } catch {
      /* ignore persistence issues */
    }
    logAnalyticsEvent('install_panel_dismissed', {
      language: this.language,
    });
  }

  private launchConfetti(questionId: string) {
    if (typeof window === 'undefined') {
      return;
    }

    this.ensureConfettiContainer();
    const container = this.confettiContainer;
    const shadowRoot = this.hostElement?.shadowRoot;
    if (!container || !shadowRoot) {
      return;
    }

    const panel = shadowRoot.querySelector<HTMLElement>(
      `section[data-question-id="${questionId}"]`,
    );
    const rect = panel?.getBoundingClientRect();
    const originX = rect
      ? rect.left + rect.width / 2
      : window.innerWidth / 2;
    const originY = rect
      ? rect.top + rect.height / 2
      : window.innerHeight / 2;

    const colors = [
      'var(--lux-red, #ed2939)',
      'var(--lux-blue, #00a1de)',
      'rgba(255, 255, 255, 0.9)',
      '#ffb400',
      '#7cc96d',
    ];

    const pieceCount = 28;
    for (let index = 0; index < pieceCount; index += 1) {
      const piece = document.createElement('span');
      piece.className = 'confetti-piece';

      const angle = Math.random() * Math.PI * 2;
      const distance = 140 + Math.random() * 180;
      const spread = 0.4 + Math.random() * 0.6;
      const translateX = Math.cos(angle) * distance * spread;
      const translateY = Math.sin(angle) * distance;
      const rotation = Math.random() * 960 - 480;
      const scale = 0.8 + Math.random() * 0.6;
      const duration = 700 + Math.random() * 600;
      const delay = Math.random() * 80;

      piece.style.left = `${originX}px`;
      piece.style.top = `${originY}px`;
      piece.style.setProperty('--confetti-x', `${translateX}px`);
      piece.style.setProperty('--confetti-y', `${translateY}px`);
      piece.style.setProperty('--confetti-rotation', `${rotation}deg`);
      piece.style.setProperty('--confetti-scale', `${scale}`);
      piece.style.background =
        colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDuration = `${duration}ms`;
      piece.style.animationDelay = `${delay}ms`;

      container.appendChild(piece);

      window.setTimeout(() => {
        piece.remove();
      }, duration + delay + 800);
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
      this.triggerQuestionDismiss(question.id);
      this.launchConfetti(question.id);
      this.queueNextQuestion(question.id);
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
    const animationState = this.questionDismissals[question.id] || 'idle';
    if (animationState === 'hidden') {
      return null;
    }
    const panelClasses = ['question-panel'];
    if (animationState === 'exiting') {
      panelClasses.push('question-panel--exiting');
    }
    if (this.enteringQuestionId === question.id) {
      panelClasses.push('question-panel--enter');
    }

    const answerState =
      this.answers[question.id] || {
        selectedOption: null,
        alreadyAnswered: false,
        submitting: false,
      };
    const options = this.getLocalizedOptions(question);
    const selectValue = answerState.selectedOption ?? '';
    const tags = this.getLocalizedTags(question);
    const total = this.state.questions.length;
    const absoluteIndex =
      this.state.questions.findIndex(item => item.id === question.id) + 1;
    const indicatorText =
      absoluteIndex > 0 && total > 0
        ? this.formatQuestionProgress(absoluteIndex, total)
        : `${translations.questionLabel} ${index + 1}`;

    return (
      <section
        class={panelClasses.join(' ')}
        data-question-id={question.id}
        key={question.id}
        onAnimationEnd={event =>
          this.handlePanelAnimationEnd(question.id, event as AnimationEvent)
        }
      >
        <header class="question-panel__header">
          <span class="question-panel__number">
            {indicatorText}
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

  private renderProgressIndicator() {
    const questions = this.state.questions;
    if (!questions.length) {
      return null;
    }

    const firstPending = questions.find(
      question => !(this.answers[question.id]?.alreadyAnswered),
    );
    const activeId = firstPending?.id || null;

    return (
      <div class="progress-indicator" aria-hidden="true">
        <div class="progress-indicator__track" />
        <div class="progress-indicator__dots">
          {questions.map(question => {
            const answerState = this.answers[question.id];
            const answered = Boolean(answerState?.alreadyAnswered);
            const isActive = !answered && question.id === activeId;

            const classes = ['progress-indicator__dot'];
            if (answered) classes.push('progress-indicator__dot--answered');
            if (isActive) classes.push('progress-indicator__dot--active');

            return (
              <span
                class={classes.join(' ')}
                key={`progress-dot-${question.id}`}
              />
            );
          })}
        </div>
      </div>
    );
  }

  private renderInstallPanel() {
    if (!this.showInstallPanel) {
      return null;
    }
    const translations = this.translations;
    const steps = translations.installPanelSteps || [];
    const showHelp = this.showInstallHelp && steps.length > 0;
    return (
      <section class="question-panel install-panel">
        <header class="question-panel__header">
          <span class="question-panel__number">
            {translations.installPanelLabel}
          </span>
          <h2>{translations.installPanelTitle}</h2>
        </header>
        <p class="install-panel__description">
          {translations.installPanelDescription}
        </p>
        <div class="install-panel__actions">
          <button
            class="primary"
            type="button"
            onClick={() => this.handleInstallHelpToggle()}
          >
            {showHelp
              ? translations.installPanelHideSteps
              : translations.installPanelShowSteps}
          </button>
          <button
            class="secondary"
            type="button"
            onClick={() => this.handleInstallPanelDismiss()}
          >
            {translations.installPanelDismiss}
          </button>
        </div>
        {showHelp ? (
          <div class="install-panel__steps">
            <h3>{translations.installPanelHelpTitle}</h3>
            <ol>
              {steps.map(step => (
                <li>{step}</li>
              ))}
            </ol>
          </div>
        ) : null}
      </section>
    );
  }

  private renderSharePanel() {
    const translations = this.translations;
    const status =
      this.shareStatus === 'shared'
        ? translations.shareStatusShared
        : this.shareStatus === 'copied'
          ? translations.shareStatusCopied
          : this.shareStatus === 'error'
            ? translations.shareStatusError
            : null;
    const statusClass =
      this.shareStatus === 'error'
        ? 'share-panel__status share-panel__status--error'
        : 'share-panel__status share-panel__status--success';

    return (
      <section class="question-panel share-panel">
        <header class="question-panel__header">
          <span class="question-panel__number">
            {translations.sharePanelLabel}
          </span>
          <h2>{translations.sharePanelTitle}</h2>
        </header>
        <p class="share-panel__description">
          {translations.sharePanelDescription}
        </p>
        <button
          class="primary"
          type="button"
          onClick={() => this.handleShareClick()}
        >
          {translations.shareButton}
        </button>
        {status ? <p class={statusClass}>{status}</p> : null}
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
    const answeredCount = questions.filter(question => {
      const state = this.answers[question.id];
      return state?.alreadyAnswered;
    }).length;
    const allAnswered = questions.length > 0 && answeredCount >= questions.length;

    if (allAnswered && this.visibleQuestionIds.length === 0) {
      return (
        <div class="home home--completed">
          <div class="completion-message">
            <h1>{translations.questionsHeading}</h1>
            <p>{translations.allAnswered}</p>
          </div>
          {this.renderInstallPanel()}
          {this.renderSharePanel()}
        </div>
      );
    }

    const panels = this.visibleQuestionIds.map((id, index) => {
      const question = questions.find(item => item.id === id);
      return question ? this.renderQuestionPanel(question, index) : null;
    });

    return (
      <div class="home">
        <header class="page-header">
          <h1>{translations.questionsHeading}</h1>
          <span class="page-date">{this.todayLabel}</span>
        </header>
        {this.renderProgressIndicator()}
        {this.state.errorKey === 'missing-question'
          ? this.renderError('missing-question')
          : null}
        <div class="question-stack">{panels}</div>
      </div>
    );
  }
}
