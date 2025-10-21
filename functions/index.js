/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {setGlobalOptions} = require("firebase-functions/v2");
const logger = require("firebase-functions/logger");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {onRequest, onCall, HttpsError} = require("firebase-functions/v2/https");
const {defineSecret, defineString} = require("firebase-functions/params");
const admin = require("firebase-admin");
const {OpenAI} = require("openai");
const cheerio = require("cheerio");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const messaging = admin.messaging();
const LUX_TZ = "Europe/Luxembourg";
const RTL_NEWS_URL = "https://www.rtl.lu/news/national";

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const OPENAI_MODEL = defineString("OPENAI_MODEL", {
  defaultValue: "gpt-4.1-mini",
});
const SMTP_HOST = defineSecret("SMTP_HOST", {defaultValue: "smtp.sendgrid.net"});
const SMTP_PORT = defineString("SMTP_PORT", {defaultValue: "587"});
const SMTP_SECURE = defineString("SMTP_SECURE", {defaultValue: "false"});
const SMTP_FROM = defineString("SMTP_FROM", {defaultValue: "Mir Sinn <hello@mirsinn.lu>"});
const SMTP_USER = defineSecret("SMTP_USER");
const SMTP_PASS = defineSecret("SMTP_PASS");

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({maxInstances: 5});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function generatePassword(length = 8) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = crypto.randomBytes(length);
  let password = "";
  for (let i = 0; i < length; i += 1) {
    const index = bytes[i] % alphabet.length;
    password += alphabet.charAt(index);
  }
  return password;
}

const EMAIL_TEMPLATES = {
  en: (password) => ({
    subject: "Your Mir Sinn password",
    text: `Hello,

Here is your Mir Sinn password: ${password}

Open the Mir Sinn app and enter this password on the profile page to link your device.

If you did not request this email you can ignore it.
`,
    html: `<p>Hello,</p>
<p>This is your Mir Sinn password:</p>
<p style="font-size:20px;font-weight:700;letter-spacing:0.12em;">${password}</p>
<p>Open the Mir Sinn app and enter this password on the profile page to finish linking your device.</p>
<p>If you did not request this email you can ignore it.</p>`,
  }),
  de: (password) => ({
    subject: "Dein Mir Sinn Passwort",
    text: `Hallo,

hier ist dein Mir Sinn Passwort: ${password}

Öffne die Mir Sinn App und gib dieses Passwort im Profil ein, um dein Gerät zu verknüpfen.

Wenn du diese Anfrage nicht gestellt hast, kannst du diese E-Mail ignorieren.
`,
    html: `<p>Hallo,</p>
<p>das ist dein Mir Sinn Passwort:</p>
<p style="font-size:20px;font-weight:700;letter-spacing:0.12em;">${password}</p>
<p>Öffne die Mir Sinn App und gib dieses Passwort im Profil ein, um dein Gerät zu verknüpfen.</p>
<p>Wenn du diese Anfrage nicht gestellt hast, kannst du diese E-Mail ignorieren.</p>`,
  }),
  fr: (password) => ({
    subject: "Ton mot de passe Mir Sinn",
    text: `Bonjour,

voici ton mot de passe Mir Sinn : ${password}

Ouvre l’application Mir Sinn et saisis ce mot de passe dans la page Profil pour relier ton appareil.

Si tu n’as pas demandé cet e-mail, ignore-le simplement.
`,
    html: `<p>Bonjour,</p>
<p>voici ton mot de passe Mir Sinn :</p>
<p style="font-size:20px;font-weight:700;letter-spacing:0.12em;">${password}</p>
<p>Ouvre l’application Mir Sinn et saisis ce mot de passe dans la page Profil pour relier ton appareil.</p>
<p>Si tu n’as pas demandé cet e-mail, ignore-le simplement.</p>`,
  }),
  lb: (password) => ({
    subject: "Är Mir Sinn Passwuert",
    text: `Moien,

hei ass Äert Mir Sinn Passwuert: ${password}

Maacht d'App op a gitt dëst Passwuert am Profil un fir den Apparat ze verknëppen.

Wann Dir dës Ufro net gemaach hutt, kënnt Dir dës Email ignoréieren.
`,
    html: `<p>Moien,</p>
<p>hei ass Äert Mir Sinn Passwuert:</p>
<p style="font-size:20px;font-weight:700;letter-spacing:0.12em;">${password}</p>
<p>Maacht d'App op a gitt dëst Passwuert am Profil un fir den Apparat ze verknëppen.</p>
<p>Wann Dir dës Ufro net gemaach hutt, kënnt Dir dës Email ignoréieren.</p>`,
  }),
};

function createMailTransport() {
  const host = SMTP_HOST.value();
  const user = SMTP_USER.value();
  const pass = SMTP_PASS.value();
  if (!host || !user || !pass) {
    throw new Error("SMTP configuration is incomplete");
  }
  const portValue = Number(SMTP_PORT.value());
  const port = Number.isFinite(portValue) && portValue > 0 ? portValue : 587;
  const secureFlag = (SMTP_SECURE.value() || "false").toLowerCase() === "true" || port === 465;
  return nodemailer.createTransport({
    host,
    port,
    secure: secureFlag,
    auth: {
      user,
      pass,
    },
  });
}

async function sendPasswordEmail(email, language, password) {
  const templateFactory = EMAIL_TEMPLATES[(language || "").toLowerCase()] || EMAIL_TEMPLATES.en;
  const template = templateFactory(password);
  const from = SMTP_FROM.value() || "moien@mirsinn.lu";
  const transporter = createMailTransport();

  console.log({from})

  await transporter.sendMail({
    from,
    to: email,
    subject: template.subject,
    text: template.text,
    html: template.html,
  });
}

async function fetchHtml(url) {
  const response = await fetch(url, {headers: {"User-Agent": "mir-sinn-question-bot/1.0"}});
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return await response.text();
}

function normalizeUrl(url) {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return new URL(url, RTL_NEWS_URL).toString();
}

function getOpenAIClient() {
  const apiKey = OPENAI_API_KEY.value();
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY environment variable");
  }
  return new OpenAI({apiKey});
}

function getModelName() {
  return OPENAI_MODEL.value() || "gpt-4.1-mini";
}

function extractTopArticle(listingHtml, exclude = { urls: new Set(), titles: new Set() }) {
  const $ = cheerio.load(listingHtml);
  const candidates = [];

  $("div.card.card--has-comments").each((_idx, card) => {
    const element = $(card);
    const link = element.find("a[href*='/a/']").first();
    const url = normalizeUrl(link.attr("href"));
    const title = link.find(".card__title").text().trim() || link.text().trim();
    const summary = element.find(".card__summary").first().text().trim();
    const commentsRaw = element.find(".card__comments-inline-title").first().text();
    const comments = parseInt(commentsRaw.replace(/[^0-9]/g, ""), 10) || 0;

    if (url && title) {
      candidates.push({url, title, summary, comments});
    }
  });

  if (!candidates.length) {
    logger.warn("No comment-rich articles found, falling back to first article.");
    const fallback = $("div.card a[href*='/a/']").first();
    if (fallback.length) {
      const fallbackArticle = {
        url: normalizeUrl(fallback.attr("href")),
        title: fallback.text().trim(),
        summary: fallback.closest("div.card").find(".card__summary").text().trim(),
        comments: 0,
      };
      if (!isArticleExcluded(fallbackArticle, exclude)) {
        return fallbackArticle;
      }
    }
    return null;
  }

  candidates.sort((a, b) => b.comments - a.comments);
  const selected = candidates.find(article => !isArticleExcluded(article, exclude));
  return selected || candidates[0];
}

function isArticleExcluded(article, exclude) {
  const url = (article.url || '').toLowerCase();
  const title = (article.title || '').toLowerCase();
  if (url && exclude.urls.has(url)) return true;
  if (title && exclude.titles.has(title)) return true;
  return false;
}

function getLuxDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: LUX_TZ,
  })
    .formatToParts(date)
    .reduce((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});
  const year = parts.year;
  const month = parts.month;
  const day = parts.day;
  return `${month}-${day}-${year}`;
}

async function generateQuestionPayload(listingHtml, articleHtml, context, openaiClient, model) {
  const prompt = `Read the HTML from the RTL.lu national news listing and the selected article in full. Identify the article with the most comments and craft a concise, balanced daily poll question.

Requirements:
- Output strict JSON with the schema:
{
  "article": {
    "title": "...",
    "url": "...",
    "summary": {"lb": "...", "fr": "...", "de": "...", "en": "..."}
  },
  "question": {"lb": "...", "fr": "...", "de": "...", "en": "..."},
  "options": [
    {"id": "yes", "label": {"lb": "...", "fr": "...", "de": "...", "en": "..."}},
    {"id": "no", "label": {"lb": "...", "fr": "...", "de": "...", "en": "..."}}
  ],
  "analysis": {"lb": "...", "fr": "...", "de": "...", "en": "..."},
  "notification": {
    "title": {"lb": "...", "fr": "...", "de": "...", "en": "..."},
    "body": {"lb": "...", "fr": "...", "de": "...", "en": "..."}
  }
}
- Provide 2 to 4 answer options with short, neutral phrasings.
- Keep each text under 200 characters.
- Question and summaries must be translated into Luxembourgish (lb), French (fr), German (de), and English (en).
- Use simple apostrophes (') and ASCII characters wherever possible.
- The question should directly relate to the article's core issue and be suitable for a quick opinion poll.
- The analysis should briefly explain why the question matters today.
- You must not reuse topics that overlap with the recent articles listed in [recent_articles]. Select a different subject if necessary.

Respond with JSON only, without explanations or code fences.`;

  const messages = [
    {role: "system", content: "You are an assistant that turns RTL.lu articles into multilingual daily poll questions. You must respond with valid JSON only."},
    {
      role: "user",
      content: `${prompt}\n\n[listing_html]\n${listingHtml}\n\n[selected_article_html]\n${articleHtml}\n\n[recent_articles]\n${JSON.stringify(context.recentArticles || [])}\n\n[context]\n${JSON.stringify(context)}`,
    },
  ];

  const response = await openaiClient.chat.completions.create({
    model,
    temperature: 0.7,
    response_format: {type: "json_object"},
    messages,
  });

  const content = response.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("OpenAI returned an empty response");
  }

  try {
    return JSON.parse(content);
  } catch (error) {
    logger.error("Failed to parse OpenAI JSON", {content});
    throw error;
  }
}

function buildQuestionDocument(payload, articleMeta, dateKey, model) {
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  const perOption = {};
  const options = (payload.options || []).map((option, index) => {
    const id = option.id || `o${index + 1}`;
    perOption[id] = 0;
    return {
      id,
      label: option.label,
    };
  });

  return {
    dateKey,
    question: payload.question,
    options,
    article: {
      title: payload.article?.title || articleMeta.title,
      url: payload.article?.url || articleMeta.url,
      summary: payload.article?.summary || null,
      comments: articleMeta.comments,
    },
    analysis: payload.analysis || null,
    notification: payload.notification || null,
    results: {
      totalResponses: 0,
      perOption,
      breakdown: [],
      lastUpdated: timestamp,
    },
    source: {
      generatedAt: timestamp,
      model,
      promptVersion: "2025-02-20",
    },
  };
}

async function fetchRecentArticles(currentDateKey, days = 3) {
  const articles = [];
  const now = new Date();

  for (let i = 1; i <= days; i += 1) {
    const past = new Date(now);
    past.setDate(past.getDate() - i);
    const dateKey = getLuxDateKey(past);
    if (dateKey === currentDateKey) continue;

    try {
      const docSnap = await db.doc(`questions/${dateKey}`).get();
      if (!docSnap.exists) continue;
      const data = docSnap.data() || {};
      const article = data.article || {};
      articles.push({
        dateKey,
        title: article.title || null,
        url: article.url || null,
      });
    } catch (error) {
      logger.warn('Failed to fetch historical question', { dateKey, error: error.message });
    }
  }

  return articles;
}

async function runDailyQuestionJob() {
  const openaiClient = getOpenAIClient();
  const model = getModelName();
  const dateKey = getLuxDateKey();
  const docRef = db.doc(`questions/${dateKey}`);
  const existing = await docRef.get();
  if (existing.exists) {
    logger.info("Question already exists for", {dateKey});
    return "already_exists";
  }

  const recentArticles = await fetchRecentArticles(dateKey, 3);
  const exclusion = {
    urls: new Set(recentArticles.map(item => (item.url || '').toLowerCase()).filter(Boolean)),
    titles: new Set(recentArticles.map(item => (item.title || '').toLowerCase()).filter(Boolean)),
  };

  const listingHtml = await fetchHtml(RTL_NEWS_URL);
  const topArticle = extractTopArticle(listingHtml, exclusion);
  if (!topArticle) {
    throw new Error("No suitable article found on listing page");
  }

  const articleHtml = await fetchHtml(topArticle.url);

  const payload = await generateQuestionPayload(listingHtml, articleHtml, {
    listingUrl: RTL_NEWS_URL,
    article: topArticle,
    dateKey,
    recentArticles,
  }, openaiClient, model);

  if (!payload?.question || !payload?.options?.length) {
    throw new Error("OpenAI payload missing question or options");
  }

  const document = buildQuestionDocument(payload, topArticle, dateKey, model);
  await docRef.set(document, {merge: false});

  logger.info("Created question of the day", {dateKey, article: topArticle.url});
  return "created";
}

exports.createDeviceAccount = onCall(
  {
    secrets: [SMTP_USER, SMTP_PASS, SMTP_HOST],
    cors: true,
  },
  async (request) => {
    console.log(SMTP_HOST.value());
    console.log(SMTP_PORT.value());
    console.log(SMTP_SECURE.value());
    console.log(SMTP_FROM.value());
    console.log(SMTP_USER.value());
    console.log(SMTP_PASS.value());

    const {email: emailRaw, language} = request.data || {};
    if (typeof emailRaw !== "string") {
      throw new HttpsError("invalid-argument", "Email address is required.");
    }

    const email = emailRaw.trim().toLowerCase();
    if (!EMAIL_REGEX.test(email)) {
      throw new HttpsError("invalid-argument", "Invalid email address.");
    }

    const password = generatePassword(8);
    let userRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(email);
      await admin.auth().updateUser(userRecord.uid, {password});
    } catch (error) {
      if (error?.code === "auth/user-not-found") {
        try {
          userRecord = await admin.auth().createUser({
            email,
            password,
            emailVerified: false,
            disabled: false,
          });
        } catch (createError) {
          logger.error("Failed to create auth user", {email, error: createError.message});
          throw new HttpsError("internal", "Failed to create account.");
        }
      } else {
        logger.error("Failed to update auth user", {email, error: error.message});
        throw new HttpsError("internal", "Failed to update account.");
      }
    }

    try {
      await sendPasswordEmail(email, language, password);
    } catch (mailError) {
      logger.error("Failed to send password email", {email, error: mailError.message});
      throw new HttpsError("internal", "Unable to send password email.");
    }

    logger.info("Issued Mir Sinn password", {email, uid: userRecord.uid});
    return {uid: userRecord.uid, email};
  },
);

exports.generateQuestionOfTheDay = onSchedule(
  {
    schedule: "0 0 * * *",
    timeZone: LUX_TZ,
    secrets: [OPENAI_API_KEY],
  },
  async () => {
  return runDailyQuestionJob();
  },
);

exports.generateQuestionOfTheDayOnDemand = onRequest(
  {
    secrets: [OPENAI_API_KEY],
  },
  async (req, res) => {
    try {
      const result = await runDailyQuestionJob();
      res.json({status: result});
    } catch (error) {
      console.log({error});
      logger.error("Failed to generate question", error);
      res.status(500).json({error: error.message});
    }
  },
);

const SUPPORTED_LANGUAGES = ["lb", "fr", "de", "en"];

function normaliseLanguage(language) {
  if (!language) return "lb";
  const normalized = language.toLowerCase();
  return SUPPORTED_LANGUAGES.includes(normalized) ? normalized : "lb";
}

function getNotificationCopy(questionDoc, lang) {
  const language = normaliseLanguage(lang);
  const title =
    questionDoc.notification?.title?.[language] ??
    questionDoc.notification?.title?.lb ??
    questionDoc.question?.[language] ??
    questionDoc.question?.lb ??
    "Mir Sinn";

  const body =
    questionDoc.notification?.body?.[language] ??
    questionDoc.analysis?.[language] ??
    questionDoc.article?.summary?.[language] ??
    questionDoc.question?.[language] ??
    questionDoc.question?.lb ??
    "Respond to Mir Sinn's question of the day.";

  return {title, body};
}

function truncateWords(text, maxWords) {
  if (!text || !maxWords) return "";
  const words = String(text)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length <= maxWords) {
    return words.join(" ");
  }
  return words.slice(0, maxWords).join(" ");
}

function getQuestionTranslations(questionDoc) {
  const question = {
    lb: questionDoc?.question?.lb || "",
    fr: questionDoc?.question?.fr || "",
    de: questionDoc?.question?.de || "",
    en: questionDoc?.question?.en || "",
  };
  const fallback = question.en || question.fr || question.de || question.lb || "The question";
  for (const language of SUPPORTED_LANGUAGES) {
    if (!question[language] || !question[language].trim()) {
      question[language] = fallback;
    }
  }
  return question;
}

function getOptionLabels(questionDoc, optionId) {
  const option = (questionDoc?.options || []).find(item => item.id === optionId);
  if (!option) {
    return {
      lb: optionId,
      fr: optionId,
      de: optionId,
      en: optionId,
    };
  }
  return {
    lb: option.label?.lb || optionId,
    fr: option.label?.fr || optionId,
    de: option.label?.de || optionId,
    en: option.label?.en || optionId,
  };
}

function createNoVoteSummary(questionDoc) {
  const question = getQuestionTranslations(questionDoc);
  return {
    lb: truncateWords(`Keng Stemmen fonnt fir "${question.lb || "d'Fro"}". Waart nach op Reaktiounen.`, 40),
    fr: truncateWords(`Aucun vote enregistre pour "${question.fr || "la question"}". Analyse en attente des reponses.`, 40),
    de: truncateWords(`Keine Stimmen fuer "${question.de || "die Frage"}". Ergebnis folgt sobald Antworten kommen.`, 40),
    en: truncateWords(`No votes recorded for "${question.en || "the question"}". Waiting on responses before analysing.`, 40),
  };
}

function fallbackResultSummary(questionDoc, breakdown, totalResponses) {
  if (!totalResponses) {
    return createNoVoteSummary(questionDoc);
  }

  const sorted = (breakdown || []).slice().sort((a, b) => (b.count || 0) - (a.count || 0));
  const top = sorted[0];
  if (!top) {
    return createNoVoteSummary(questionDoc);
  }

  const question = getQuestionTranslations(questionDoc);
  const labels = getOptionLabels(questionDoc, top.optionId);

  return {
    lb: truncateWords(
      `${totalResponses} Stemmen: "${labels.lb}" kritt den Haaptzoustemmung op "${question.lb}".`,
      40,
    ),
    fr: truncateWords(
      `${totalResponses} votes : "${labels.fr}" emporte ladhesion principale sur "${question.fr}".`,
      40,
    ),
    de: truncateWords(
      `${totalResponses} Stimmen: "${labels.de}" setzt sich vorerst bei "${question.de}" durch.`,
      40,
    ),
    en: truncateWords(
      `${totalResponses} votes: "${labels.en}" currently shapes opinion on "${question.en}".`,
      40,
    ),
  };
}

function sanitizeLocalizedSummary(summary) {
  const result = {};
  for (const language of SUPPORTED_LANGUAGES) {
    const raw = summary?.[language];
    if (typeof raw === "string" && raw.trim()) {
      result[language] = truncateWords(raw.trim(), 40);
    }
  }
  return result;
}

async function generateResultAnalysis(questionDoc, breakdown, totalResponses, openaiClient, model) {
  if (!totalResponses || !Array.isArray(breakdown) || !breakdown.length) {
    return createNoVoteSummary(questionDoc);
  }

  const question = getQuestionTranslations(questionDoc);
  const options = (questionDoc?.options || []).map(option => ({
    id: option.id,
    label: {
      lb: option.label?.lb || option.id,
      fr: option.label?.fr || option.id,
      de: option.label?.de || option.id,
      en: option.label?.en || option.id,
    },
  }));
  const enrichedBreakdown = breakdown.map(item => ({
    optionId: item.optionId,
    count: item.count,
    percentage: item.percentage,
    label: getOptionLabels(questionDoc, item.optionId),
  }));

  const payload = {
    question,
    totalResponses,
    breakdown: enrichedBreakdown,
    options,
    analysis: questionDoc?.analysis || null,
    article: questionDoc?.article || null,
  };

  const prompt = `You are a multilingual polling analyst. Review the poll question and response breakdown.
Craft a concise interpretation (max 40 words per language) that explains what the results mean for the question's issue.
Avoid repeating raw vote counts except when essential to support the insight.
Summaries must exist for languages: lb, fr, de, en.
Write plain ASCII text, no fancy punctuation, no quotation marks around the whole sentence.
Respond with JSON only in the form:
{"summary":{"lb":"...","fr":"...","de":"...","en":"..."}}`;

  const messages = [
    {
      role: "system",
      content: "You deliver compact polling analysis across Luxembourgish, French, German, and English. Stay neutral and factual. Output JSON only.",
    },
    {
      role: "user",
      content: `${prompt}\n\n[poll_context]\n${JSON.stringify(payload)}`,
    },
  ];

  try {
    const response = await openaiClient.chat.completions.create({
      model,
      temperature: 0.4,
      messages,
      response_format: {type: "json_object"},
    });

    const content = response.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("OpenAI returned empty content for summary");
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      logger.error("Failed to parse OpenAI summary response", {content});
      throw error;
    }

    const sanitized = sanitizeLocalizedSummary(parsed.summary || parsed);
    if (Object.keys(sanitized).length === SUPPORTED_LANGUAGES.length) {
      return sanitized;
    }
    return fallbackResultSummary(questionDoc, breakdown, totalResponses);
  } catch (error) {
    logger.error("Failed to generate OpenAI result analysis", {
      error: error.message,
    });
    return fallbackResultSummary(questionDoc, breakdown, totalResponses);
  }
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function sendNotificationsForQuestion(dateKey, questionDoc) {
  const snapshot = await db.collection("devices").where("fcmToken", "!=", null).get();
  if (snapshot.empty) {
    logger.info("No devices with tokens found; skipping campaign.");
    return 0;
  }

  const devices = [];
  const initialCleanupPromises = [];
  snapshot.forEach(docSnap => {
    const data = docSnap.data() || {};
    const rawToken = data.fcmToken;
    const token = typeof rawToken === "string" ? rawToken.trim() : null;

    if (!token) {
      if (rawToken) {
        const ref = db.doc(`devices/${docSnap.id}`);
        initialCleanupPromises.push(ref.set({fcmToken: null}, {merge: true}));
      }
      return;
    }

    devices.push({
      id: docSnap.id,
      token,
      language: normaliseLanguage(data.language),
    });
  });

  if (initialCleanupPromises.length) {
    logger.info("Cleaning up invalid device tokens", {count: initialCleanupPromises.length});
    await Promise.allSettled(initialCleanupPromises);
  }

  if (!devices.length) {
    logger.info("No usable tokens after filtering.");
    return 0;
  }

  let failures = 0;
  let successes = 0;

  const buckets = new Map();
  for (const device of devices) {
    if (!buckets.has(device.language)) {
      buckets.set(device.language, []);
    }
    buckets.get(device.language).push(device);
  }

  for (const [language, entries] of buckets.entries()) {
    const {title, body} = getNotificationCopy(questionDoc, language);
    const chunks = chunk(entries, 500);

    for (const deviceChunk of chunks) {
      const tokens = deviceChunk.map(entry => entry.token);
      const message = {
        tokens,
        notification: {
          title,
          body,
        },
        data: {
          dateKey,
          language,
        },
      };

      try {
        const response = await messaging.sendEachForMulticast(message);
        successes += response.successCount;
        failures += response.failureCount;

        const cleanupWrites = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const deviceEntry = deviceChunk[idx];
            const code = resp.error?.code || "";
            if (
              code.includes("messaging/invalid-registration-token") ||
              code.includes("messaging/registration-token-not-registered")
            ) {
              const ref = db.doc(`devices/${deviceEntry.id}`);
              cleanupWrites.push(ref.set({fcmToken: null}, {merge: true}));
            }
          }
        });

        if (cleanupWrites.length) {
          await Promise.allSettled(cleanupWrites);
        }
      } catch (error) {
        failures += deviceChunk.length;
        logger.error("Failed to send notifications to chunk", {
          language,
          count: deviceChunk.length,
          error: error.message,
          code: error.code || null,
        });
      }
    }
  }

  logger.info("Notification dispatch completed", {successes, failures});
  return successes;
}

async function runDailyNotificationJob() {
  const dateKey = getLuxDateKey();
  const questionSnap = await db.doc(`questions/${dateKey}`).get();
  if (!questionSnap.exists) {
    logger.warn("No question available for notifications", {dateKey});
    return "missing_question";
  }
  const questionDoc = questionSnap.data() || {};
  if (!questionDoc.notification) {
    logger.warn("Question missing notification payload, skipping notification job", {dateKey});
    return "missing_notification_payload";
  }

  const sentCount = await sendNotificationsForQuestion(dateKey, questionDoc);
  return {status: "sent", sentCount};
}

exports.sendQuestionNotifications = onSchedule(
  {
    schedule: "0 8 * * *",
    timeZone: LUX_TZ,
  },
  async () => {
    return runDailyNotificationJob();
  },
);

async function refreshHistoricalStats() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateKey = getLuxDateKey(yesterday);

  const questionRef = db.doc(`questions/${dateKey}`);
  const questionSnap = await questionRef.get();
  if (!questionSnap.exists) {
    logger.warn('No question document found for stats refresh', {dateKey});
    return 'missing_question';
  }
  const questionDoc = questionSnap.data() || {};

  const answersSnap = await db.collection(`questions/${dateKey}/answers`).get();
  if (answersSnap.empty) {
    logger.info('No answers found for question', {dateKey});
    const summary = createNoVoteSummary(questionDoc);
    await questionRef.set({
      results: {
        totalResponses: 0,
        perOption: {},
        breakdown: [],
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        summary,
      },
    }, {merge: true});
    return 'no_answers';
  }

  const perOption = {};
  answersSnap.forEach(docSnap => {
    const data = docSnap.data();
    const optionId = data.optionId;
    if (!optionId) return;
    perOption[optionId] = (perOption[optionId] || 0) + 1;
  });

  const totalResponses = Object.values(perOption).reduce((sum, value) => sum + value, 0);
  const breakdown = Object.entries(perOption).map(([optionId, count]) => ({
    optionId,
    count,
    percentage: totalResponses ? Math.round((count / totalResponses) * 1000) / 10 : 0,
  }));
  let summary;
  try {
    const openaiClient = getOpenAIClient();
    const model = getModelName();
    summary = await generateResultAnalysis(questionDoc, breakdown, totalResponses, openaiClient, model);
  } catch (error) {
    logger.error('Unable to initialise OpenAI client for result analysis', {error: error.message});
    summary = fallbackResultSummary(questionDoc, breakdown, totalResponses);
  }

  await questionRef.set({
    results: {
      totalResponses,
      perOption,
      breakdown,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      summary,
    },
  }, {merge: true});

  logger.info('Historical stats refreshed', {dateKey, totalResponses});
  return {status: 'updated', totalResponses};
}

exports.refreshYesterdayStats = onSchedule(
  {
    schedule: '0 * * * *',
    timeZone: LUX_TZ,
    secrets: [OPENAI_API_KEY],
  },
  async () => refreshHistoricalStats(),
);
