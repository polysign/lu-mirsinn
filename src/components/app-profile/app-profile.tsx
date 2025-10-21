import { Component, Prop, State, Watch, h } from '@stencil/core';
import {
  subscribeToDevice,
  updateDeviceProfile,
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
    this.deviceUnsubscribe = subscribeToDevice(id, (doc: DeviceDocument | null) => {
      const profile = normalizeProfile(doc?.profile);
      if (!profilesEqual(profile, this.draft)) {
        this.draft = profile;
      }
      this.ready = true;
    });
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

  render() {
    const t = this.translations;
    const disableInputs = !this.ready;

    return (
      <section class="profile-page">
        <header class="page-header">
          <h1>{t.heading}</h1>
          <p>{t.intro}</p>
        </header>
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
