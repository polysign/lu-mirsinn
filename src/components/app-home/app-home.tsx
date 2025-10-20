import { Component, Prop, State, Watch, h } from '@stencil/core';
import { Router } from '../../';
import {
  getAnswerForDevice,
  getTodayQuestionDoc,
  setAnswer,
  subscribeToDevice,
  type QuestionDocument,
  type DeviceDocument,
} from '../../services/firebase';
import { fallbackQuestion } from '../../services/mock-data';
import type { LanguageCode } from '../../types/language';
import infoIcon from '../../assets/icons/regular/info.svg';
import megaphoneIcon from '../../assets/icons/regular/megaphone.svg';
import { registerMessagingForDevice } from '../../services/messaging';
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

const LOCAL_POINTS_KEY = 'mir-sinn-points';
const CONFETTI_PIECES = Array.from({ length: 24 }, (_, index) => index);

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
    pointsTitle: string;
    pointsSubtitle: string;
    aboutTitle: string;
    aboutDescription: string;
    aboutBuiltBy: string;
    aboutHelpLabel: string;
    dialogTitle: string;
    dialogConfirm: string;
    dialogCloseLabel: string;
    termsHeading: string;
    termsBody: string;
    privacyHeading: string;
    privacyEmphasis: string;
    privacyBody: string;
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
    pointsTitle: 'Deng Punkten',
    pointsSubtitle: '+100 pro Äntwert',
    aboutTitle: 'Mir Sinn',
    aboutDescription:
      "Mir Sinn ass eng Initiativ fir d'Meenung vu Lëtzebuerg ze sammelen. Dréit all Dag bäi a entdeckt, wat d'Gemeinschaft denkt.",
    aboutBuiltBy: 'Entwéckelt vun',
    aboutHelpLabel: 'Konditiounen & Dateschutz',
    dialogTitle: 'Konditiounen & Dateschutz',
    dialogConfirm: 'Verstanen',
    dialogCloseLabel: 'Dialog zoumaachen',
    termsHeading: 'Nutzungsbedéngungen',
    termsBody:
      "Mir Sinn bitt eng deeglech Fro. D'Participatioun ass fräi a fräiwëlleg; mat der Notzung stëmmt Dir zou, datt Är anonym Äntwerten an aggregéierter Form gewise ginn.",
    privacyHeading: 'Dateschutz',
    privacyEmphasis: 'Mir späicheren keng perséinlech Benotzerdate.',
    privacyBody:
      "Mir halen nëmmen eng generéiert Device-ID, eng Referral-Info, Är Optioun an Är Punkten, fir d'Participatioun ze verwalten an anonym Statistiken ze generéieren.",
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
    pointsTitle: 'Vos points',
    pointsSubtitle: '+100 par réponse',
    aboutTitle: 'Mir Sinn',
    aboutDescription:
      "Mir Sinn est une initiative pour recueillir le ressenti du Luxembourg. Participe chaque jour et découvre ce que pense la communauté.",
    aboutBuiltBy: 'Conçu par',
    aboutHelpLabel: 'Conditions & vie privée',
    dialogTitle: 'Conditions & vie privée',
    dialogConfirm: 'Compris',
    dialogCloseLabel: 'Fermer la fenêtre',
    termsHeading: "Conditions d'utilisation",
    termsBody:
      "Mir Sinn propose une question quotidienne. L’usage est gratuit et volontaire ; en participant, vous acceptez que vos réponses anonymes soient utilisées pour des résultats agrégés.",
    privacyHeading: 'Vie privée',
    privacyEmphasis: 'Nous ne stockons aucune donnée personnelle.',
    privacyBody:
      "Seule une ID générée pour l’appareil, un code de partage, votre réponse et vos points sont conservés afin de limiter les doublons et produire des statistiques anonymes.",
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
    pointsTitle: 'Deine Punkte',
    pointsSubtitle: '+100 pro Antwort',
    aboutTitle: 'Mir Sinn',
    aboutDescription:
      'Mir Sinn sammelt täglich die Stimmung Luxemburgs. Mach mit und erfahre, wie die Gemeinschaft denkt.',
    aboutBuiltBy: 'Entwickelt von',
    aboutHelpLabel: 'Infos & Datenschutz',
    dialogTitle: 'Infos & Datenschutz',
    dialogConfirm: 'Verstanden',
    dialogCloseLabel: 'Dialog schließen',
    termsHeading: 'Nutzungsbedingungen',
    termsBody:
      'Mir Sinn stellt täglich eine Frage bereit. Die Nutzung ist freiwillig; mit der Teilnahme stimmst du zu, dass deine anonymen Antworten für aggregierte Resultate genutzt werden.',
    privacyHeading: 'Datenschutz',
    privacyEmphasis: 'Wir speichern keine persönlichen Nutzerdaten.',
    privacyBody:
      'Lediglich eine erzeugte Geräte-ID, ein Empfehlungs-Code, deine Antwort und deine Punkte werden aufbewahrt, um Mehrfachteilnahmen zu vermeiden und anonyme Statistiken zu erstellen.',
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
    pointsTitle: 'Your points',
    pointsSubtitle: '+100 per answer',
    aboutTitle: 'Mir Sinn',
    aboutDescription:
      'Mir Sinn captures Luxembourg’s daily pulse. Take part every day and see what the community thinks.',
    aboutBuiltBy: 'Built by',
    aboutHelpLabel: 'Terms & privacy',
    dialogTitle: 'Terms & Privacy',
    dialogConfirm: 'Got it',
    dialogCloseLabel: 'Close dialog',
    termsHeading: 'Terms of Service',
    termsBody:
      'Mir Sinn provides one daily question. Participation is free and optional; by answering you agree that your anonymous answers may be used to present aggregated results.',
    privacyHeading: 'Privacy',
    privacyEmphasis: 'We do not store any personal user data.',
    privacyBody:
      'We only keep a generated device ID, a referral code, your answer choice, and your points to prevent duplicate participation and to build anonymous statistics.',
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
  @State() points: number | null = null;
  @State() confettiBurst = false;
  @State() showPolicies = false;

  private todayKey = getTodayKey();
  private hasFirebase = false;
  private deviceUnsubscribe?: () => void;
  private deviceSubscriptionRetry?: number;
  private confettiTimeout?: number;
  private previousPoints: number | null = null;
  private deviceSnapshot: DeviceDocument | null = null;

  async componentWillLoad() {
    this.hasFirebase = Boolean((window as any).__MIR_SINN_HAS_FIREBASE__);
    await this.loadQuestion();
    this.setupDeviceSubscription();
  }

  disconnectedCallback() {
    this.deviceUnsubscribe?.();
    if (this.deviceSubscriptionRetry) {
      window.clearTimeout(this.deviceSubscriptionRetry);
    }
    if (this.confettiTimeout) {
      window.clearTimeout(this.confettiTimeout);
    }
    this.deviceSnapshot = null;
    this.showPolicies = false;
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
      if (!this.hasFirebase) {
        this.loadLocalPoints(false);
      }
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

  private setupDeviceSubscription() {
    if (!this.hasFirebase) {
      this.loadLocalPoints(false);
      if (this.deviceId) {
        registerMessagingForDevice(this.deviceId, false);
      }
      return;
    }

    const id = this.deviceId;
    if (!id) {
      if (!this.deviceSubscriptionRetry) {
        this.deviceSubscriptionRetry = window.setTimeout(() => {
          this.deviceSubscriptionRetry = undefined;
          this.setupDeviceSubscription();
        }, 400);
      }
      return;
    }

    this.deviceUnsubscribe?.();
    this.deviceUnsubscribe = subscribeToDevice(id, (doc: DeviceDocument | null) => {
      this.deviceSnapshot = doc;
      const points = doc?.points ?? 0;
      const shouldAnimate = this.previousPoints !== null;
      this.handlePointsUpdate(points, shouldAnimate);
      if (doc && (!doc.fcmToken || doc.fcmToken.length === 0)) {
        registerMessagingForDevice(id, true);
      }
    });
  }

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

  private getLocalPoints(): number {
    try {
      const stored = localStorage.getItem(LOCAL_POINTS_KEY);
      if (!stored) return 0;
      const parsed = parseInt(stored, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    } catch {
      return 0;
    }
  }

  private saveLocalPoints(value: number) {
    try {
      localStorage.setItem(LOCAL_POINTS_KEY, String(value));
    } catch {
      // ignore persistence issues
    }
  }

  private loadLocalPoints(animate: boolean) {
    const points = this.getLocalPoints();
    this.handlePointsUpdate(points, animate);
  }

  private handlePointsUpdate(next: number, animate = true) {
    const previous = this.previousPoints;
    this.points = next;
    if (animate && previous !== null && next > previous) {
      this.launchConfetti();
    }
    this.previousPoints = next;
  }

  private launchConfetti() {
    if (this.confettiTimeout) {
      window.clearTimeout(this.confettiTimeout);
    }
    this.confettiBurst = false;
    requestAnimationFrame(() => {
      this.confettiBurst = true;
      this.confettiTimeout = window.setTimeout(() => {
        this.confettiBurst = false;
      }, 2200);
    });
  }

  private renderConfetti() {
    if (!this.confettiBurst) {
      return null;
    }
    return (
      <div class="confetti-layer">
        {CONFETTI_PIECES.map(piece => {
          const position = (piece / CONFETTI_PIECES.length) * 100;
          const delay = (piece % 7) * 0.08;
          const duration = 1.6 + (piece % 5) * 0.12;
          const drift = (piece % 2 === 0 ? 1 : -1) * (8 + (piece % 6) * 4);
          const style = {
            left: `${position}%`,
            animationDelay: `${delay}s`,
            animationDuration: `${duration}s`,
            '--drift': `${drift}px`,
          } as any;
          return <span class="confetti-piece" style={style} />;
        })}
      </div>
    );
  }

  private formatPoints() {
    if (this.points === null) {
      return '—';
    }
    const locale = this.language === 'lb' ? 'de-LU' : this.language;
    return this.points.toLocaleString(locale);
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
        const current = this.points ?? this.getLocalPoints();
        const next = current + 100;
        this.saveLocalPoints(next);
        this.handlePointsUpdate(next);
      }

      this.state = {
        ...this.state,
        alreadyAnswered: true,
        errorKey: undefined,
      };
      this.shareStatus = 'idle';
      if (this.deviceId) {
        registerMessagingForDevice(this.deviceId, true);
      }
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
    const shareUrl = this.buildShareUrl();
    const shareData = {
      title: 'Mir Sinn - Fro vum Dag',
      text: `${this.getLocalizedQuestion(
        this.state.question,
      )}\n\n${translations.shareTextSuffix}`,
      url: shareUrl,
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

  private buildShareUrl() {
    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    const params = new URLSearchParams(window.location.search);
    params.delete('from');

    const shortCode = this.latestShortCode();
    if (shortCode) {
      params.set('from', shortCode);
    }

    const query = params.toString();
    return query ? `${baseUrl}?${query}` : baseUrl;
  }

  private latestShortCode(): string | null {
    if (this.deviceSnapshot?.shortCode) {
      return this.deviceSnapshot.shortCode;
    }
    const windowCode = (window as any).__DEVICE_SHORT_CODE__;
    if (typeof windowCode === 'string' && windowCode.length > 0) {
      return windowCode;
    }
    try {
      const params = new URLSearchParams(window.location.search);
      const ownCode = params.get('from');
      if (ownCode) return ownCode;
    } catch {
      // ignore parse errors
    }
    return null;
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
      return (
        <div class="loading-screen" aria-busy="true">
          {this.renderLoader()}
        </div>
      );
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
      <div class={{ 'question-view': true, 'question-view--visible': true }}>
        {this.renderConfetti()}
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
            <span class="action-icon" aria-hidden="true">
              <img src={megaphoneIcon} alt="" />
            </span>
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

        <section class="card points-card">
          <header>
            <span class="points-title">{translations.pointsTitle}</span>
            <span class="points-subtitle">{translations.pointsSubtitle}</span>
          </header>
          <p class="points-value">{this.formatPoints()}</p>
        </section>

        <section class="card about-card">
          <header>
            <span class="about-title">{translations.aboutTitle}</span>
            <span class="about-version">v0.0.1</span>
          </header>
          <p class="about-text">{translations.aboutDescription}</p>
          <footer class="about-footer">
            <span class="about-built">{translations.aboutBuiltBy}</span>
            <a href="https://autonoma.lu" target="_blank" rel="noopener">
              Autonoma.lu
            </a>
            <button
              class="about-help"
              type="button"
              onClick={() => (this.showPolicies = true)}
              aria-label={translations.aboutHelpLabel}
            >
              <img src={infoIcon} alt="" />
            </button>
          </footer>
        </section>
        {this.renderPoliciesDialog()}
      </div>
    );
  }

  private renderPoliciesDialog() {
    if (!this.showPolicies) return null;
    const translations = this.translations;
    return (
      <div
        class="dialog-backdrop"
        role="presentation"
        onClick={event => {
          if (event.target === event.currentTarget) this.showPolicies = false;
        }}
      >
        <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="policies-title">
          <header class="dialog-header">
            <h3 id="policies-title">{translations.dialogTitle}</h3>
            <button
              class="dialog-close"
              type="button"
              onClick={() => (this.showPolicies = false)}
              aria-label={translations.dialogCloseLabel}
            >
              ×
            </button>
          </header>
          <div class="dialog-body">
            <section>
              <h4>{translations.termsHeading}</h4>
              <p>{translations.termsBody}</p>
            </section>
            <section>
              <h4>{translations.privacyHeading}</h4>
              <p>
                <strong>{translations.privacyEmphasis}</strong> {translations.privacyBody}
              </p>
            </section>
          </div>
          <footer class="dialog-footer">
            <button class="primary" type="button" onClick={() => (this.showPolicies = false)}>
              {translations.dialogConfirm}
            </button>
          </footer>
        </div>
      </div>
    );
  }
}
