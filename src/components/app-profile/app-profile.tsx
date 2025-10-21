import { Component, Prop, State, Watch, h } from '@stencil/core';
import type { FirebaseError } from 'firebase/app';
import {
  requestDeviceAccount,
  subscribeToDevice,
  updateDeviceProfile,
  verifyDeviceAccount,
  type DeviceDocument,
  type DeviceGender,
  type DeviceLivingArea,
  type DeviceProfile,
} from '../../services/firebase';
import type { LanguageCode } from '../../types/language';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const LOCAL_PROFILE_KEY = 'mir-sinn-profile';
const SAVE_DEBOUNCE_MS = 350;
const STATUS_CLEAR_MS = 2000;

const genderOptions: Array<{
  value: DeviceGender;
  labels: Record<LanguageCode, string>;
}> = [
  {
    value: 'male',
    labels: {
      lb: 'Männlech',
      fr: 'Homme',
      de: 'Männlich',
      en: 'Male',
    },
  },
  {
    value: 'female',
    labels: {
      lb: 'Weiblech',
      fr: 'Femme',
      de: 'Weiblich',
      en: 'Female',
    },
  },
  {
    value: 'other',
    labels: {
      lb: 'Aner',
      fr: 'Autre',
      de: 'Divers',
      en: 'Other',
    },
  },
  {
    value: 'prefer_not_to_say',
    labels: {
      lb: 'Léiwer net soen',
      fr: 'Préférer ne pas dire',
      de: 'Möchte ich nicht sagen',
      en: 'Rather not say',
    },
  },
];

const cantonAreaEntries: Array<[DeviceLivingArea, string]> = [
  ['capellen', 'Capellen'],
  ['clervaux', 'Clervaux'],
  ['dikierch', 'Dikierch'],
  ['echternach', 'Echternach'],
  ['esch-sur-alzette', 'Esch-sur-Alzette'],
  ['grevenmacher', 'Grevenmacher'],
  ['luxembourg', 'Luxembourg'],
  ['mersch', 'Mersch'],
  ['redange', 'Redange'],
  ['remich', 'Remich'],
  ['vianden', 'Vianden'],
  ['wiltz', 'Wiltz'],
];

const cantonAreaLabels: Array<{ value: DeviceLivingArea; label: string }> = [
  ...cantonAreaEntries,
]
  .sort((a, b) => a[1].localeCompare(b[1]))
  .map(([value, label]) => ({ value, label }));

const livingAreaOptions: Array<{
  value: DeviceLivingArea;
  labels: Record<LanguageCode, string>;
}> = cantonAreaLabels.map(area => ({
  value: area.value,
  labels: {
    lb: area.label,
    fr: area.label,
    de: area.label,
    en: area.label,
  },
}));

livingAreaOptions.push(
  {
    value: 'outside-luxembourg',
    labels: {
      lb: 'Ausserhalb vu Lëtzebuerg',
      fr: 'En dehors du Luxembourg',
      de: 'Außerhalb von Luxemburg',
      en: 'Outside Luxembourg',
    },
  },
  {
    value: 'prefer_not_to_say',
    labels: {
      lb: 'Léiwer net soen',
      fr: 'Préférer ne pas dire',
      de: 'Möchte ich nicht sagen',
      en: 'Rather not say',
    },
  },
);

const validGenderValues = new Set<DeviceGender>(
  genderOptions.map(option => option.value),
);

const validLivingAreas = new Set<DeviceLivingArea>(
  livingAreaOptions.map(option => option.value),
);

interface ProfileCopy {
  heading: string;
  intro: string;
  loading: string;
  genderLabel: string;
  genderPlaceholder: string;
  ageLabel: string;
  ageHelper: string;
  ageUnset: string;
  ageClear: string;
  livingLabel: string;
  livingPlaceholder: string;
  status: {
    saving: string;
    saved: string;
    error: string;
  };
  offlineNotice: string;
  deviceUnavailable: string;
  emailAccount: {
    title: string;
    description: string;
    actionLabel: string;
    relinkLabel: string;
    emailLabel: string;
    emailPlaceholder: string;
    passwordLabel: string;
    passwordPlaceholder: string;
    sendLabel: string;
    resendLabel: string;
    verifyLabel: string;
    cancelLabel: string;
    statusSendingEmail: string;
    statusEmailSent: string;
    statusVerifying: string;
    statusSendError: string;
    statusVerifyError: string;
    statusSuccess: string;
    invalidEmail: string;
    invalidPassword: string;
    linkedLabel: string;
    linkedHint: string;
    passwordHint: string;
  };
}

const copy: Record<LanguageCode, ProfileCopy> = {
  lb: {
    heading: 'Profil',
    intro:
      'Hëlleft eis Mir Sinn besser ze maachen andeems Dir e puer Informatioune mat eis deelt. Är Donnéeë bleiwen anonym.',
    loading: 'Profil gëtt gelueden...',
    genderLabel: 'Geschlecht',
    genderPlaceholder: 'Wielt eng Optioun',
    ageLabel: 'Alter',
    ageHelper: 'Zitt de Regler fir ären Alter unzeginn.',
    ageUnset: 'Net uginn',
    ageClear: 'Alter ewechhuelen',
    livingLabel: 'Wunnt an',
    livingPlaceholder: 'Wielt eng Optioun',
    status: {
      saving: 'Späicheren...',
      saved: 'Gespäichert',
      error: 'Konnt net gespäichert ginn. Probéiert et nach eng Kéier.',
    },
    offlineNotice:
      'Et gëtt keng Verbindung mam Server. Är Profil-Ännerunge ginn nëmme lokal gespäichert.',
    deviceUnavailable:
      'Den Apparat ass net prett. Probéiert d\'App nei opzemaachen.',
    emailAccount: {
      title: 'Verknëppelt Är Email',
      description:
        'Séchert dësen Apparat mat engem Mir Sinn Login. Mir schécken Iech e Passwuert per Email, sou kënnt Dir Iech spéider erëm verbannen.',
      actionLabel: 'Emailadress verknëppen',
      relinkLabel: 'Emailadress aktualiséieren',
      emailLabel: 'Emailadress',
      emailPlaceholder: 'dir@example.lu',
      passwordLabel: 'Passwuert',
      passwordPlaceholder: 'Gitt d\'Passwuert aus der Email an',
      sendLabel: 'Passwuert schécken',
      resendLabel: 'Neit Passwuert schécken',
      verifyLabel: 'Passwuert iwwerpréiwen',
      cancelLabel: 'Ofbriechen',
      statusSendingEmail: 'Passwuert gëtt geschéckt…',
      statusEmailSent:
        'Mir hunn eng Email un {email} geschéckt mat Ärem Passwuert. Gitt et hei drënner an fir d\'Verknëppung ofzeschléissen.',
      statusVerifying: 'Passwuert gëtt gepréift…',
      statusSendError:
        "D'Email konnt net geschéckt ginn. Probéiert et nach eng Kéier.",
      statusVerifyError:
        'D\'Passwuert konnt net verifizéiert ginn. Kontrolléiert de Code a probéiert et nach eng Kéier.',
      statusSuccess:
        '{email} ass elo mat dësem Apparat verbonnen.',
      invalidEmail: 'Gitt w.e.g. eng valabel Emailadress un.',
      invalidPassword: 'Gitt d\'8 Zeeche laangt Passwuert aus der Email an.',
      linkedLabel: 'Verbonnen Email',
      linkedHint:
        'Benotzt dës Email fir Mir Sinn op anere Geräter erëm ze fannen.',
      passwordHint:
        "D'Passwuert huet 8 Zeechen an enthält nëmmen grouss Buschtawen a Zuelen.",
    },
  },
  fr: {
    heading: 'Profil',
    intro:
      'Aidez-nous à améliorer Mir Sinn en partageant quelques informations. Vos données restent anonymes.',
    loading: 'Chargement du profil…',
    genderLabel: 'Genre',
    genderPlaceholder: 'Sélectionnez une option',
    ageLabel: 'Âge',
    ageHelper: 'Déplacez le curseur pour indiquer votre âge.',
    ageUnset: 'Non renseigné',
    ageClear: "Effacer l'âge",
    livingLabel: 'Vous habitez',
    livingPlaceholder: 'Sélectionnez une option',
    status: {
      saving: 'Enregistrement…',
      saved: 'Enregistré',
      error: "Impossible d'enregistrer. Réessayez.",
    },
    offlineNotice:
      "Connexion au serveur indisponible. Les modifications du profil restent sur cet appareil.",
    deviceUnavailable:
      'Le profil de l’appareil est indisponible. Veuillez relancer Mir Sinn.',
    emailAccount: {
      title: 'Relie ton e-mail',
      description:
        'Sécurise cet appareil avec un compte Mir Sinn. Nous t’envoyons un mot de passe par e-mail pour te reconnecter plus tard.',
      actionLabel: 'Relier une adresse e-mail',
      relinkLabel: 'Mettre à jour l’adresse e-mail',
      emailLabel: 'Adresse e-mail',
      emailPlaceholder: 'toi@example.com',
      passwordLabel: 'Mot de passe',
      passwordPlaceholder: 'Entre le mot de passe reçu',
      sendLabel: 'Envoyer le mot de passe',
      resendLabel: 'Renvoyer le mot de passe',
      verifyLabel: 'Vérifier le mot de passe',
      cancelLabel: 'Annuler',
      statusSendingEmail: 'Envoi du mot de passe…',
      statusEmailSent:
        'Nous avons envoyé un e-mail à {email} avec ton mot de passe. Entre-le ci-dessous pour terminer la liaison.',
      statusVerifying: 'Vérification du mot de passe…',
      statusSendError: 'Impossible d’envoyer l’e-mail. Réessaie.',
      statusVerifyError:
        'Mot de passe incorrect. Vérifie le code et réessaie.',
      statusSuccess:
        '{email} est maintenant lié à cet appareil.',
      invalidEmail: 'Entre une adresse e-mail valide.',
      invalidPassword:
        'Entre le mot de passe de 8 caractères reçu par e-mail.',
      linkedLabel: 'E-mail lié',
      linkedHint:
        'Utilise cet e-mail pour reconnecter Mir Sinn sur un autre appareil.',
      passwordHint:
        'Le mot de passe compte 8 caractères avec seulement des majuscules et des chiffres.',
    },
  },
  de: {
    heading: 'Profil',
    intro:
      'Hilf uns, Mir Sinn zu verbessern, indem du ein paar Angaben machst. Deine Daten bleiben anonym.',
    loading: 'Profil wird geladen …',
    genderLabel: 'Geschlecht',
    genderPlaceholder: 'Option auswählen',
    ageLabel: 'Alter',
    ageHelper: 'Verschiebe den Regler, um dein Alter anzugeben.',
    ageUnset: 'Nicht angegeben',
    ageClear: 'Alter zurücksetzen',
    livingLabel: 'Wohnhaft in',
    livingPlaceholder: 'Option auswählen',
    status: {
      saving: 'Speichern…',
      saved: 'Gespeichert',
      error: 'Speichern fehlgeschlagen. Bitte versuche es erneut.',
    },
    offlineNotice:
      'Server nicht erreichbar. Profiländerungen werden nur lokal gespeichert.',
    deviceUnavailable:
      'Das Gerät ist noch nicht bereit. Bitte starte Mir Sinn neu.',
    emailAccount: {
      title: 'E-Mail verknüpfen',
      description:
        'Schütze dieses Gerät mit einem Mir Sinn Login. Wir schicken dir ein Passwort per E-Mail, damit du dich später wieder verbinden kannst.',
      actionLabel: 'E-Mail-Adresse verknüpfen',
      relinkLabel: 'E-Mail-Adresse aktualisieren',
      emailLabel: 'E-Mail-Adresse',
      emailPlaceholder: 'du@example.de',
      passwordLabel: 'Passwort',
      passwordPlaceholder: 'Passwort aus der E-Mail eingeben',
      sendLabel: 'Passwort senden',
      resendLabel: 'Passwort erneut senden',
      verifyLabel: 'Passwort prüfen',
      cancelLabel: 'Abbrechen',
      statusSendingEmail: 'Passwort wird gesendet…',
      statusEmailSent:
        'Wir haben eine E-Mail an {email} geschickt. Gib das Passwort unten ein, um die Verknüpfung abzuschließen.',
      statusVerifying: 'Passwort wird geprüft…',
      statusSendError:
        'E-Mail konnte nicht gesendet werden. Bitte versuche es erneut.',
      statusVerifyError:
        'Das Passwort ist ungültig. Bitte Code prüfen und erneut versuchen.',
      statusSuccess:
        '{email} ist jetzt mit diesem Gerät verknüpft.',
      invalidEmail: 'Bitte gib eine gültige E-Mail-Adresse ein.',
      invalidPassword:
        'Bitte gib das 8-stellige Passwort aus der E-Mail ein.',
      linkedLabel: 'Verknüpfte E-Mail',
      linkedHint:
        'Nutze diese E-Mail, um Mir Sinn auf anderen Geräten wiederzufinden.',
      passwordHint:
        'Das Passwort besteht aus 8 Zeichen mit nur Großbuchstaben und Zahlen.',
    },
  },
  en: {
    heading: 'Profile',
    intro:
      'Help us improve Mir Sinn by sharing a little about yourself. Your data stays anonymous.',
    loading: 'Loading profile…',
    genderLabel: 'Gender',
    genderPlaceholder: 'Select an option',
    ageLabel: 'Age',
    ageHelper: 'Drag the slider to share your age.',
    ageUnset: 'Not specified',
    ageClear: 'Clear age',
    livingLabel: 'Living in',
    livingPlaceholder: 'Select an option',
    status: {
      saving: 'Saving…',
      saved: 'Saved',
      error: 'Could not save. Please try again.',
    },
    offlineNotice:
      'No server connection detected. Profile changes are stored on this device only.',
    deviceUnavailable:
      'The device is not ready yet. Please reopen Mir Sinn and try again.',
    emailAccount: {
      title: 'Link your email',
      description:
        'Secure this device with a Mir Sinn login. We will email you a password so you can reconnect later.',
      actionLabel: 'Link Email Address',
      relinkLabel: 'Update Email Address',
      emailLabel: 'Email address',
      emailPlaceholder: 'you@example.com',
      passwordLabel: 'Password',
      passwordPlaceholder: 'Enter the password from your email',
      sendLabel: 'Send password',
      resendLabel: 'Send new password',
      verifyLabel: 'Verify password',
      cancelLabel: 'Cancel',
      statusSendingEmail: 'Sending password…',
      statusEmailSent:
        'We sent an email to {email} with your password. Enter it below to finish linking.',
      statusVerifying: 'Checking password…',
      statusSendError: 'Could not send the email. Please try again.',
      statusVerifyError:
        'We could not verify that password. Check the code and try again.',
      statusSuccess:
        '{email} is now linked to this device.',
      invalidEmail: 'Please enter a valid email address.',
      invalidPassword:
        'Please enter the 8-character password from your email.',
      linkedLabel: 'Linked email',
      linkedHint:
        'Use this email to reconnect Mir Sinn on other devices.',
      passwordHint:
        'Your password is 8 characters long and only uses capital letters and numbers.',
    },
  },
};

const ageDisplay = {
  lb: (age: number | null | undefined) =>
    age == null ? copy.lb.ageUnset : `${age} Joer`,
  fr: (age: number | null | undefined) =>
    age == null ? copy.fr.ageUnset : `${age} ans`,
  de: (age: number | null | undefined) =>
    age == null ? copy.de.ageUnset : `${age} Jahre`,
  en: (age: number | null | undefined) =>
    age == null ? copy.en.ageUnset : `${age} years`,
};

function normalizeProfile(profile?: DeviceProfile | null): DeviceProfile {
  const rawGender = profile?.gender as DeviceGender;
  const gender = validGenderValues.has(rawGender) ? rawGender : null;
  const livingCandidate = profile?.livingIn as DeviceLivingArea;
  const livingIn = validLivingAreas.has(livingCandidate)
    ? livingCandidate
    : null;

  return {
    gender,
    age:
      typeof profile?.age === 'number' && Number.isFinite(profile.age)
        ? profile.age
        : null,
    livingIn,
  };
}

function profilesEqual(
  a?: DeviceProfile | null,
  b?: DeviceProfile | null,
): boolean {
  return (
    (a?.gender ?? null) === (b?.gender ?? null) &&
    (a?.age ?? null) === (b?.age ?? null) &&
    (a?.livingIn ?? null) === (b?.livingIn ?? null)
  );
}

@Component({
  tag: 'app-profile',
  styleUrl: 'app-profile.css',
  shadow: true,
})
export class AppProfile {
  @Prop() language: LanguageCode = 'lb';

  @State() ready = false;
  @State() draft: DeviceProfile = normalizeProfile();
  @State() saveState: SaveState = 'idle';
  @State() errorMessage: string | null = null;
  @State() device: DeviceDocument | null = null;
  @State() showEmailForm = false;
  @State() emailInput = '';
  @State() passwordInput = '';
  @State() emailStage: 'email' | 'password' | null = null;
  @State()
  emailStatus:
    | 'idle'
    | 'sendingEmail'
    | 'emailSent'
    | 'verifyingPassword'
    | 'verified'
    | 'error' = 'idle';
  @State() emailContextEmail: string | null = null;
  @State()
  emailErrorType:
    | 'invalid-email'
    | 'send-failed'
    | 'invalid-password'
    | 'verify-failed'
    | null = null;

  private hasFirebase = false;
  private deviceUnsubscribe?: () => void;
  private subscriptionRetry?: number;
  private saveDebounce?: number;
  private statusResetTimeout?: number;
  private genderSelect?: HTMLSelectElement;
  private livingSelect?: HTMLSelectElement;

  @Watch('language')
  handleLanguageChange() {
    if (this.saveState === 'error') {
      this.errorMessage = null;
    }
  }

  componentDidRender() {
    this.syncSelectValues();
  }

  componentWillLoad() {
    this.hasFirebase =
      typeof window !== 'undefined' &&
      Boolean((window as any).__MIR_SINN_HAS_FIREBASE__);

    if (this.hasFirebase) {
      this.setupDeviceSubscription();
    } else {
      this.draft = this.loadLocalProfile();
      this.ready = true;
    }
  }

  disconnectedCallback() {
    if (this.deviceUnsubscribe) {
      try {
        this.deviceUnsubscribe();
      } catch {
        /* ignore unsubscribe issues */
      }
      this.deviceUnsubscribe = undefined;
    }
    if (this.subscriptionRetry) {
      window.clearTimeout(this.subscriptionRetry);
      this.subscriptionRetry = undefined;
    }
    if (this.saveDebounce) {
      window.clearTimeout(this.saveDebounce);
      this.saveDebounce = undefined;
    }
    if (this.statusResetTimeout) {
      window.clearTimeout(this.statusResetTimeout);
      this.statusResetTimeout = undefined;
    }
  }

  private get deviceId(): string | null {
    if (typeof window === 'undefined') return null;
    return (window as any).__DEVICE_ID__ || null;
  }

  private setupDeviceSubscription() {
    const id = this.deviceId;
    if (!id) {
      if (!this.subscriptionRetry) {
        this.subscriptionRetry = window.setTimeout(() => {
          this.subscriptionRetry = undefined;
          this.setupDeviceSubscription();
        }, 500);
      }
      return;
    }

    this.deviceUnsubscribe?.();
    this.deviceUnsubscribe = subscribeToDevice(
      id,
      (doc: DeviceDocument | null) => {
        const profile = normalizeProfile(doc?.profile);
        if (!profilesEqual(profile, this.draft)) {
          this.draft = profile;
        }
        this.device = doc;
        if (doc?.authUid) {
          this.emailContextEmail = doc.authEmail ?? this.emailContextEmail;
          if (this.emailStatus === 'idle') {
            this.emailStatus = 'verified';
          }
        }
        this.ready = true;
      },
    );
  }

  private loadLocalProfile(): DeviceProfile {
    try {
      if (typeof window === 'undefined') return normalizeProfile();
      const stored = localStorage.getItem(LOCAL_PROFILE_KEY);
      if (!stored) return normalizeProfile();
      const parsed = JSON.parse(stored);
      return normalizeProfile(parsed);
    } catch {
      return normalizeProfile();
    }
  }

  private saveLocalProfile(profile: DeviceProfile) {
    try {
      if (typeof window === 'undefined') return;
      localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(profile));
    } catch {
      /* ignore local persistence errors */
    }
  }

  private queueSave() {
    if (this.saveDebounce) {
      window.clearTimeout(this.saveDebounce);
    }
    this.saveState = 'saving';
    this.errorMessage = null;
    this.saveDebounce = window.setTimeout(() => {
      this.saveDebounce = undefined;
      this.persistProfile();
    }, SAVE_DEBOUNCE_MS);
  }

  private async persistProfile() {
    const profile = normalizeProfile(this.draft);

    if (!this.hasFirebase) {
      this.saveLocalProfile(profile);
      this.markSaved();
      return;
    }

    const id = this.deviceId;
    if (!id) {
      this.saveState = 'error';
      this.errorMessage = this.translations.deviceUnavailable;
      return;
    }

    try {
      await updateDeviceProfile(id, profile);
      this.markSaved();
    } catch (error) {
      console.warn('[profile] Failed to save profile', error);
      this.saveState = 'error';
      this.errorMessage = this.translations.status.error;
    }
  }

  private markSaved() {
    this.saveState = 'saved';
    if (this.statusResetTimeout) {
      window.clearTimeout(this.statusResetTimeout);
    }
    this.statusResetTimeout = window.setTimeout(() => {
      this.saveState = 'idle';
      this.statusResetTimeout = undefined;
    }, STATUS_CLEAR_MS);
  }

  private updateProfile(partial: Partial<DeviceProfile>) {
    const next = normalizeProfile({
      ...this.draft,
      ...partial,
    });
    if (profilesEqual(next, this.draft)) {
      return;
    }
    this.draft = next;
    this.queueSave();
  }

  private handleGenderChange = (event: Event) => {
    const select = event.target as HTMLSelectElement;
    const value = select.value as DeviceGender | '';
    this.updateProfile({ gender: value ? value : null });
  };

  private handleAgeChange = (event: Event) => {
    const input = event.target as HTMLInputElement;
    const raw = Number.parseInt(input.value, 10);
    if (!Number.isFinite(raw)) {
      this.updateProfile({ age: null });
      return;
    }
    this.updateProfile({ age: raw });
  };

  private clearAge = () => {
    this.updateProfile({ age: null });
  };

  private handleLivingChange = (event: Event) => {
    const select = event.target as HTMLSelectElement;
    const value = select.value as DeviceLivingArea | '';
    this.updateProfile({ livingIn: value ? value : null });
  };

  private syncSelectValues() {
    if (this.genderSelect) {
      const next = this.draft.gender ?? '';
      if (this.genderSelect.value !== next) {
        this.genderSelect.value = next;
      }
    }
    if (this.livingSelect) {
      const next = this.draft.livingIn ?? '';
      if (this.livingSelect.value !== next) {
        this.livingSelect.value = next;
      }
    }
  }

  private get translations(): ProfileCopy {
    return copy[this.language] || copy.lb;
  }

  private getAgeDisplay(): string {
    const formatter = ageDisplay[this.language] || ageDisplay.lb;
    return formatter(this.draft?.age ?? null);
  }

  private renderStatus() {
    if (this.saveState === 'idle') {
      return null;
    }
    const base = this.translations.status;
    if (this.saveState === 'saving') {
      return <span class="status saving">{base.saving}</span>;
    }
    if (this.saveState === 'saved') {
      return <span class="status saved">{base.saved}</span>;
    }
    return (
      <span class="status error">
        {this.errorMessage || base.error}
      </span>
    );
  }

  private formatEmail(template: string, email: string | null): string {
    return template.replace('{email}', email || '');
  }

  private startEmailAccountFlow = () => {
    this.emailInput =
      this.device?.authEmail ?? this.emailContextEmail ?? '';
    this.passwordInput = '';
    this.showEmailForm = true;
    this.emailStage = 'email';
    this.emailStatus = 'idle';
    this.emailErrorType = null;
  };

  private cancelEmailAccountFlow = () => {
    if (this.emailStatus === 'sendingEmail' || this.emailStatus === 'verifyingPassword') {
      return;
    }
    this.showEmailForm = false;
    this.emailStage = null;
    this.emailInput = '';
    this.passwordInput = '';
    this.emailErrorType = null;
    if (this.emailStatus !== 'verified') {
      this.emailStatus = 'idle';
    }
  };

  private restartEmailStage = () => {
    if (this.emailStatus === 'verifyingPassword') {
      return;
    }
    this.emailStage = 'email';
    this.emailStatus = 'idle';
    this.emailErrorType = null;
    this.passwordInput = '';
    this.emailInput = this.emailContextEmail ?? this.device?.authEmail ?? '';
  };

  private handleEmailInput = (event: Event) => {
    const input = event.target as HTMLInputElement;
    this.emailInput = input.value;
    if (this.emailStatus === 'error' && this.emailErrorType === 'invalid-email') {
      this.emailStatus = 'idle';
      this.emailErrorType = null;
    }
  };

  private handlePasswordInput = (event: Event) => {
    const input = event.target as HTMLInputElement;
    this.passwordInput = input.value.toUpperCase();
    if (this.emailStatus === 'error' && this.emailErrorType === 'invalid-password') {
      this.emailStatus = 'idle';
      this.emailErrorType = null;
    }
  };

  private submitEmailRequest = async (event: Event) => {
    event.preventDefault();
    if (!this.hasFirebase || this.emailStatus === 'sendingEmail') {
      return;
    }
    const email = this.emailInput.trim();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      this.emailStatus = 'error';
      this.emailErrorType = 'invalid-email';
      return;
    }
    this.emailStatus = 'sendingEmail';
    this.emailErrorType = null;
    try {
      await requestDeviceAccount(email, this.language);
      this.emailStatus = 'emailSent';
      this.emailContextEmail = email;
      this.emailStage = 'password';
      this.passwordInput = '';
    } catch (error) {
      console.warn('[profile] Failed to request device account', error);
      this.emailStatus = 'error';
      this.emailErrorType = 'send-failed';
    }
  };

  private submitPasswordVerification = async (event: Event) => {
    event.preventDefault();
    if (!this.hasFirebase || this.emailStatus === 'verifyingPassword') {
      return;
    }
    const email =
      this.emailContextEmail || this.emailInput.trim();
    if (!email) {
      this.emailStatus = 'error';
      this.emailErrorType = 'invalid-email';
      return;
    }
    const password = this.passwordInput.trim();
    if (!password || password.length < 8) {
      this.emailStatus = 'error';
      this.emailErrorType = 'invalid-password';
      return;
    }
    const deviceId = this.deviceId;
    if (!deviceId) {
      this.emailStatus = 'error';
      this.emailErrorType = 'verify-failed';
      return;
    }
    this.emailStatus = 'verifyingPassword';
    this.emailErrorType = null;
    try {
      const result = await verifyDeviceAccount(deviceId, email, password);
      this.emailStatus = 'verified';
      this.emailContextEmail = result.email ?? email;
      this.passwordInput = '';
      this.showEmailForm = false;
      this.emailStage = null;
    } catch (error) {
      console.warn('[profile] Failed to verify device password', error);
      const firebaseError = error as Partial<FirebaseError> | undefined;
      if (firebaseError && typeof firebaseError === 'object' && 'code' in firebaseError) {
        if (firebaseError?.code === 'auth/wrong-password') {
          this.emailErrorType = 'invalid-password';
        } else if (firebaseError?.code === 'auth/user-not-found') {
          this.emailErrorType = 'invalid-email';
        } else {
          this.emailErrorType = 'verify-failed';
        }
      } else {
        this.emailErrorType = 'verify-failed';
      }
      this.emailStatus = 'error';
    }
  };

  private renderEmailAccountStatus() {
    const accountCopy = this.translations.emailAccount;
    switch (this.emailStatus) {
      case 'sendingEmail':
        return (
          <p class="email-card__status email-card__status--info">
            {accountCopy.statusSendingEmail}
          </p>
        );
      case 'emailSent':
        return (
          <p class="email-card__status email-card__status--info">
            {this.formatEmail(accountCopy.statusEmailSent, this.emailContextEmail)}
          </p>
        );
      case 'verifyingPassword':
        return (
          <p class="email-card__status email-card__status--info">
            {accountCopy.statusVerifying}
          </p>
        );
      case 'verified':
        return (
          <p class="email-card__status email-card__status--success">
            {this.formatEmail(accountCopy.statusSuccess, this.emailContextEmail)}
          </p>
        );
      case 'error': {
        let message = accountCopy.statusVerifyError;
        if (this.emailErrorType === 'invalid-email') {
          message = accountCopy.invalidEmail;
        } else if (this.emailErrorType === 'invalid-password') {
          message = accountCopy.invalidPassword;
        } else if (this.emailErrorType === 'send-failed') {
          message = accountCopy.statusSendError;
        }
        return (
          <p class="email-card__status email-card__status--error">{message}</p>
        );
      }
      default:
        return null;
    }
  }

  private renderEmailAccountCard() {
    if (!this.hasFirebase) {
      return null;
    }
    const accountCopy = this.translations.emailAccount;
    const isLinked = Boolean(this.device?.authUid);
    const linkedEmail = this.device?.authEmail ?? this.emailContextEmail ?? null;
    const disableEmailForm = this.emailStatus === 'sendingEmail';
    const disablePasswordForm = this.emailStatus === 'verifyingPassword';

    return (
      <section class="email-card">
        <div class="email-card__header">
          <h2>{accountCopy.title}</h2>
          <p>{accountCopy.description}</p>
        </div>
        {isLinked ? (
          <div class="email-card__linked">
            <span class="email-card__label">{accountCopy.linkedLabel}</span>
            <span class="email-card__value">{linkedEmail || '—'}</span>
            <p class="email-card__hint">{accountCopy.linkedHint}</p>
          </div>
        ) : null}
        {this.showEmailForm && this.emailStage === 'email' ? (
          <form class="email-card__form" onSubmit={this.submitEmailRequest}>
            <label class="email-card__form-label" htmlFor="profile-email-link">
              {accountCopy.emailLabel}
            </label>
            <input
              id="profile-email-link"
              type="email"
              value={this.emailInput}
              placeholder={accountCopy.emailPlaceholder}
              onInput={this.handleEmailInput}
              disabled={disableEmailForm}
              required
            />
            <div class="email-card__actions">
              <button
                type="submit"
                class="email-card__button email-card__button--primary"
                disabled={disableEmailForm}
              >
                {accountCopy.sendLabel}
              </button>
              <button
                type="button"
                class="email-card__button"
                onClick={this.cancelEmailAccountFlow}
                disabled={disableEmailForm}
              >
                {accountCopy.cancelLabel}
              </button>
            </div>
          </form>
        ) : null}
        {this.showEmailForm && this.emailStage === 'password' ? (
          <form class="email-card__form" onSubmit={this.submitPasswordVerification}>
            <label class="email-card__form-label" htmlFor="profile-email-password">
              {accountCopy.passwordLabel}
            </label>
            <input
              id="profile-email-password"
              type="text"
              class="email-card__password-input"
              value={this.passwordInput}
              placeholder={accountCopy.passwordPlaceholder}
              onInput={this.handlePasswordInput}
              disabled={disablePasswordForm}
              required
              autoComplete="one-time-code"
              maxLength={8}
            />
            <p class="email-card__password-hint">{accountCopy.passwordHint}</p>
            <div class="email-card__actions">
              <button
                type="submit"
                class="email-card__button email-card__button--primary"
                disabled={disablePasswordForm}
              >
                {accountCopy.verifyLabel}
              </button>
              <button
                type="button"
                class="email-card__button"
                onClick={this.restartEmailStage}
                disabled={disablePasswordForm}
              >
                {accountCopy.resendLabel}
              </button>
              <button
                type="button"
                class="email-card__button"
                onClick={this.cancelEmailAccountFlow}
                disabled={disablePasswordForm}
              >
                {accountCopy.cancelLabel}
              </button>
            </div>
          </form>
        ) : null}
        {!this.showEmailForm ? (
          <div class="email-card__actions">
            <button
              type="button"
              class="email-card__button email-card__button--primary"
              onClick={this.startEmailAccountFlow}
              disabled={!this.ready}
            >
              {isLinked ? accountCopy.relinkLabel : accountCopy.actionLabel}
            </button>
          </div>
        ) : null}
        <div class="email-card__status-wrapper" aria-live="polite">
          {this.renderEmailAccountStatus()}
        </div>
      </section>
    );
  }

  render() {
    const t = this.translations;
    const disableInputs = !this.ready;

    return (
      <section class="profile-page">
        <header class="page-header">
          <h1>{t.heading}</h1>
          <p>{t.intro}</p>
        </header>
        {this.renderEmailAccountCard()}
        {!this.ready ? (
          <div class="loading" role="status" aria-live="polite">
            <div class="spinner" />
            <span>{t.loading}</span>
          </div>
        ) : (
          <form
            class="profile-form"
            onSubmit={event => event.preventDefault()}
          >
            {this.hasFirebase ? null : (
              <p class="notice" role="alert">
                {t.offlineNotice}
              </p>
            )}
            <div class="form-group">
              <label htmlFor="profile-gender">{t.genderLabel}</label>
              <select
                id="profile-gender"
                ref={el => {
                  this.genderSelect = el as HTMLSelectElement | undefined;
                }}
                onChange={this.handleGenderChange}
                disabled={disableInputs}
              >
                <option value="" selected={this.draft.gender == null}>
                  {t.genderPlaceholder}
                </option>
                {genderOptions.map(option => (
                  <option
                    value={option.value}
                    selected={this.draft.gender === option.value}
                  >
                    {option.labels[this.language] || option.labels.lb}
                  </option>
                ))}
              </select>
            </div>

            <div class="form-group">
              <label htmlFor="profile-age">{t.ageLabel}</label>
              <div class="age-row">
                <input
                  id="profile-age"
                  type="range"
                  min="14"
                  max="100"
                  value={this.draft.age ?? 14}
                  onInput={this.handleAgeChange}
                  disabled={disableInputs}
                />
                <span class="age-value">{this.getAgeDisplay()}</span>
                <button
                  class="clear-age"
                  type="button"
                  onClick={this.clearAge}
                  disabled={disableInputs || this.draft.age == null}
                >
                  {t.ageClear}
                </button>
              </div>
              <p class="helper">{t.ageHelper}</p>
            </div>

            <div class="form-group">
              <label htmlFor="profile-living">{t.livingLabel}</label>
              <select
                id="profile-living"
                ref={el => {
                  this.livingSelect = el as HTMLSelectElement | undefined;
                }}
                onChange={this.handleLivingChange}
                disabled={disableInputs}
              >
                <option value="" selected={this.draft.livingIn == null}>
                  {t.livingPlaceholder}
                </option>
                {livingAreaOptions.map(option => (
                  <option
                    value={option.value}
                    selected={this.draft.livingIn === option.value}
                  >
                    {option.labels[this.language] || option.labels.lb}
                  </option>
                ))}
              </select>
            </div>

            <div class="status-row" aria-live="polite">
              {this.renderStatus()}
            </div>
          </form>
        )}
      </section>
    );
  }
}
