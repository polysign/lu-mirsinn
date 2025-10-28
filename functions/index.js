/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {setGlobalOptions} = require("firebase-functions/v2");
const {onDocumentCreated, onDocumentWritten} = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {onRequest, onCall, HttpsError} = require("firebase-functions/v2/https");
const {defineSecret, defineString} = require("firebase-functions/params");
const admin = require("firebase-admin");
const {OpenAI} = require("openai");
const cheerio = require("cheerio");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const {spawn} = require("child_process");
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const messaging = admin.messaging();
const LUX_TZ = "Europe/Luxembourg";
const RTL_NEWS_URL = "https://www.rtl.lu/news/national";
const LANGUAGE_PRIORITY = ["lb", "fr", "de", "en"];
const JINA_PROXY_PREFIX = "https://r.jina.ai/";

const NEWS_SOURCES = [
  {
    id: "rtl-national",
    label: "RTL.lu National",
    listingUrl: "https://www.rtl.lu/news/national",
    strategy: "rtl",
  },
  {
    id: "lessentiel-luxembourg",
    label: "L'essentiel Luxembourg",
    listingUrl: "https://www.lessentiel.lu/fr/luxembourg",
    strategy: "proxied-text",
  },
  {
    id: "wort-luxemburg",
    label: "Luxemburger Wort",
    listingUrl: "https://www.wort.lu/luxemburg/",
    strategy: "proxied-text",
  },
  {
    id: "tageblatt-sport",
    label: "Tageblatt Sport",
    listingUrl: "https://www.tageblatt.lu/category/sport/",
    strategy: "proxied-text",
  },
  {
    id: "tageblatt-luxemburg",
    label: "Tageblatt Luxemburg",
    listingUrl: "https://www.tageblatt.lu/category/nachrichten/luxemburg/",
    strategy: "proxied-text",
  },
];
const QUESTION_TARGET_COUNT = 5;

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
const INSTAGRAM_ACCESS_TOKEN = defineSecret("INSTAGRAM_ACCESS_TOKEN");
const INSTAGRAM_USER_ID = defineString("INSTAGRAM_USER_ID");

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

function normalizeTextValue(value) {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object") {
    for (const key of LANGUAGE_PRIORITY) {
      if (typeof value[key] === "string") {
        return value[key];
      }
    }
    const firstString = Object.values(value).find((entry) => typeof entry === "string");
    if (typeof firstString === "string") {
      return firstString;
    }
  }
  return "";
}

function getQuestionSignature(question) {
  if (!question) return "";
  const tokens = [];
  if (typeof question === "string") {
    const value = question.trim().toLowerCase();
    if (value) tokens.push(value);
  } else if (typeof question === "object") {
    for (const language of LANGUAGE_PRIORITY) {
      const text = question[language];
      if (typeof text === "string") {
        const value = text.trim().toLowerCase();
        if (value) tokens.push(value);
      }
    }
    if (!tokens.length) {
      const fallback = normalizeTextValue(question).trim().toLowerCase();
      if (fallback) tokens.push(fallback);
    }
  }
  return tokens.join("|");
}

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

function buildProxiedNewsUrl(targetUrl) {
  if (!targetUrl) return null;
  if (targetUrl.startsWith(JINA_PROXY_PREFIX)) {
    return targetUrl;
  }
  return `${JINA_PROXY_PREFIX}${targetUrl}`;
}

async function fetchReadableText(url) {
  const proxied = buildProxiedNewsUrl(url);
  if (!proxied) {
    throw new Error("Invalid URL for readable fetch");
  }
  return fetchHtml(proxied);
}

async function fetchListingContentForSource(source) {
  if (!source?.listingUrl) {
    throw new Error("Source listing URL missing");
  }

  try {
    if (source.strategy === "rtl") {
      return await fetchReadableText(source.listingUrl);
    }
    return await fetchReadableText(source.listingUrl);
  } catch (error) {
    logger.error("Failed to fetch listing content", {
      sourceId: source.id,
      listingUrl: source.listingUrl,
      error: error.message,
    });
    throw error;
  }
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

async function generateQuestionPayloadForSource({source, listingContent, context, openaiClient, model}) {
  if (!source || !listingContent) {
    throw new Error("Missing source data for question generation");
  }

  const prompt = `You will read the proxied Markdown snapshot of a Luxembourg news listing at ${source.listingUrl}. Select one timely article that has not been covered recently and craft a multilingual Mir Sinn poll question.

Requirements:
- Respond with strict JSON only using this schema:
{
  "article": {
    "title": "...",
    "url": "...",
    "summary": {"lb": "...", "fr": "...", "de": "...", "en": "..."}
  },
  "tags": [
    {"lb": "...", "fr": "...", "de": "...", "en": "..."}
  ],
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
- Stay under 200 characters per text field.
- Use Luxembourgish (lb), French (fr), German (de) and English (en) for all textual fields. Provide natural, concise translations.
- Provide 2 to 4 neutral answer options with unique ids and short labels.
- Provide 1 to 3 tags that categorise the topic; keep tags under 40 characters and translate each tag into lb, fr, de and en.
- The question must directly relate to the chosen article and stand on its own.
- The analysis must state why the topic matters today.
- Avoid URLs or titles listed in [forbidden_articles].
- Avoid reusing topics that overlap with [recent_articles].
- Prefer non-political angles if the last three articles in [recent_articles] were political.
- The output must use ASCII apostrophes (') when needed.

Return valid JSON only with no commentary.`;

  const messages = [
    {
      role: "system",
      content: "You create balanced, multilingual daily poll questions for Mir Sinn. Always return valid JSON matching the expected schema.",
    },
    {
      role: "user",
      content: `${prompt}\n\n[source]\n${JSON.stringify({id: source.id, label: source.label, listingUrl: source.listingUrl})}\n\n[listing_markdown]\n${listingContent}\n\n[recent_articles]\n${JSON.stringify(context.recentArticles || [])}\n\n[forbidden_articles]\n${JSON.stringify(context.forbiddenArticles || [])}`,
    },
  ];

  const response = await openaiClient.chat.completions.create({
    model,
    temperature: 0.6,
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

function buildQuestionDocument(payload, meta) {
  const {dateKey, model, source, order, listingExcerpt} = meta || {};
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

  const article = {
    title: payload.article?.title || "",
    url: payload.article?.url || null,
    summary: payload.article?.summary || null,
  };
  const supportedTagLanguages = ["lb", "fr", "de", "en"];
  const tags = Array.isArray(payload.tags)
    ? payload.tags
        .slice(0, 3)
        .map((tag) => {
          if (!tag || typeof tag !== "object") return null;
          const fallback =
            typeof tag.en === "string" && tag.en.trim()
              ? tag.en.trim()
              : typeof tag.lb === "string" && tag.lb.trim()
              ? tag.lb.trim()
              : typeof tag.fr === "string" && tag.fr.trim()
              ? tag.fr.trim()
              : typeof tag.de === "string" && tag.de.trim()
              ? tag.de.trim()
              : "";
          if (!fallback) return null;
          const normalized = {};
          supportedTagLanguages.forEach((lang) => {
            const value =
              typeof tag[lang] === "string" && tag[lang].trim()
                ? tag[lang].trim()
                : fallback;
            normalized[lang] = String(value).slice(0, 40);
          });
          return normalized;
        })
        .filter(Boolean)
    : [];
  const uniqueTags = [];
  const seenTags = new Set();
  tags.forEach((tag) => {
    const key = supportedTagLanguages.map((lang) => tag[lang]?.toLowerCase()?.trim()).join("|");
    if (!seenTags.has(key)) {
      seenTags.add(key);
      uniqueTags.push(tag);
    }
  });

  return {
    dateKey,
    order: typeof order === "number" ? order : null,
    question: payload.question,
    options,
    article,
    tags: uniqueTags,
    analysis: payload.analysis || null,
    notification: payload.notification || null,
    newsSource: {
      id: source?.id || null,
      label: source?.label || null,
      listingUrl: source?.listingUrl || null,
    },
    listingExcerpt: listingExcerpt || null,
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
      listingStrategy: source?.strategy || null,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
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
      if (article && (article.url || article.title)) {
        articles.push({
          dateKey,
          title: normalizeTextValue(article.title),
          url: article.url || null,
        });
      }

      const questionsSnap = await db.collection(`questions/${dateKey}/questions`).get();
      questionsSnap.forEach((questionDoc) => {
        const qData = questionDoc.data() || {};
        const qArticle = qData.article || {};
        if (!qArticle) return;
        articles.push({
          dateKey,
          title: normalizeTextValue(qArticle.title),
          url: qArticle.url || null,
        });
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
  const dayDocRef = db.doc(`questions/${dateKey}`);
  const existing = await dayDocRef.get();
  if (existing.exists) {
    const existingData = existing.data() || {};
    if (existingData.question || existingData.questionCount) {
      logger.info("Questions already exist for", {dateKey});
      return "already_exists";
    }
    const existingQuestions = await dayDocRef.collection("questions").limit(1).get();
    if (!existingQuestions.empty) {
      logger.info("Questions already exist for", {dateKey});
      return "already_exists";
    }
  }

  const recentArticles = await fetchRecentArticles(dateKey, 5);
  const exclusion = {
    urls: new Set(
      recentArticles
        .map((item) => (typeof item.url === "string" ? item.url.toLowerCase() : ""))
        .filter(Boolean),
    ),
    titles: new Set(
      recentArticles
        .map((item) => normalizeTextValue(item.title).toLowerCase())
        .filter(Boolean),
    ),
  };

  const forbiddenArticles = recentArticles.map((item) => ({
    url: item.url || null,
    title: normalizeTextValue(item.title) || null,
  }));

  const questionEntries = [];
  const questionSignatures = new Set();
  const listingCache = new Map();
  let order = 1;

  const attemptGenerateForSource = async (source) => {
    let payload = null;
    let listingContent = listingCache.get(source.id) || null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        if (!listingContent) {
          listingContent = await fetchListingContentForSource(source);
          listingCache.set(source.id, listingContent);
        }
      } catch (error) {
        logger.error("Failed to fetch listing for source", {
          sourceId: source.id,
          error: error.message,
        });
        break;
      }

      try {
        payload = await generateQuestionPayloadForSource({
          source,
          listingContent,
          context: {
            dateKey,
            recentArticles,
            forbiddenArticles,
          },
          openaiClient,
          model,
        });
      } catch (error) {
        logger.error("Failed to generate payload for source", {
          sourceId: source.id,
          error: error.message,
          attempt,
        });
        payload = null;
      }

      if (!payload) {
        continue;
      }

      const articleUrl = normalizeTextValue(payload.article?.url || "").toLowerCase();
      const articleTitle = normalizeTextValue(payload.article?.title || "").toLowerCase();
      const questionSignature = getQuestionSignature(payload.question);

      const isDuplicateArticle =
        (articleUrl && exclusion.urls.has(articleUrl)) ||
        (articleTitle && exclusion.titles.has(articleTitle));
      const isDuplicateQuestion = questionSignature && questionSignatures.has(questionSignature);

      if ((isDuplicateArticle || isDuplicateQuestion) && attempt < 2) {
        forbiddenArticles.push({
          url: payload.article?.url || null,
          title: payload.article?.title || null,
        });
        logger.warn("Detected duplicate content, retrying with extended exclusions", {
          sourceId: source.id,
          articleUrl: payload.article?.url || null,
          articleTitle: payload.article?.title || null,
          duplicateArticle: isDuplicateArticle,
          duplicateQuestion: isDuplicateQuestion,
          attempt,
        });
        payload = null;
        continue;
      }

      if (!payload?.question || !Array.isArray(payload.options) || !payload.options.length) {
        logger.warn("Payload missing question/options", {sourceId: source.id});
        payload = null;
        continue;
      }

      const questionRef = dayDocRef.collection("questions").doc();
      const listingExcerpt = typeof listingContent === "string"
        ? listingContent.slice(0, 2000)
        : null;

      const questionDoc = buildQuestionDocument(payload, {
        dateKey,
        model,
        source,
        order,
        listingExcerpt,
      });

      questionEntries.push({
        id: questionRef.id,
        ref: questionRef,
        data: questionDoc,
      });

      if (articleUrl) {
        exclusion.urls.add(articleUrl);
        forbiddenArticles.push({url: payload.article?.url || null, title: payload.article?.title || null});
      }
      if (articleTitle) {
        exclusion.titles.add(articleTitle);
      }
      if (questionSignature) {
        questionSignatures.add(questionSignature);
      }

      order += 1;
      return true;
    }

    return false;
  };

  for (const source of NEWS_SOURCES) {
    if (questionEntries.length >= QUESTION_TARGET_COUNT) {
      break;
    }
    await attemptGenerateForSource(source);
  }

  if (questionEntries.length < QUESTION_TARGET_COUNT) {
    const fallbackSources = [...NEWS_SOURCES];
    let fallbackIndex = 0;
    let safetyCounter = 0;
    const safetyLimit = fallbackSources.length * 6;
    while (questionEntries.length < QUESTION_TARGET_COUNT && safetyCounter < safetyLimit) {
      const source = fallbackSources[fallbackIndex % fallbackSources.length];
      fallbackIndex += 1;
      safetyCounter += 1;
      await attemptGenerateForSource(source);
    }
  }

  if (questionEntries.length < QUESTION_TARGET_COUNT) {
    logger.error("Failed to generate required Mir Sinn questions", {
      target: QUESTION_TARGET_COUNT,
      actual: questionEntries.length,
    });
    if (!questionEntries.length) {
      throw new Error("Unable to generate any questions for today");
    }
  }

  const generatedAt = admin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();

  const primaryQuestion = questionEntries[0];
  if (!primaryQuestion) {
    throw new Error("Unable to determine primary question");
  }

  const perOption = {};
  (primaryQuestion.data.options || []).forEach((option) => {
    perOption[option.id] = 0;
  });

  const dayDocData = {
    dateKey,
    questionCount: questionEntries.length,
    primaryQuestionId: primaryQuestion.id,
    questionIds: questionEntries.map((entry) => entry.id),
    questionsSummary: questionEntries.map((entry) => ({
      id: entry.id,
      order: entry.data.order,
      title: normalizeTextValue(entry.data.article?.title),
      sourceId: entry.data.newsSource?.id || null,
      sourceLabel: entry.data.newsSource?.label || null,
      articleUrl: entry.data.article?.url || null,
    })),
    question: primaryQuestion.data.question,
    options: primaryQuestion.data.options,
    article: primaryQuestion.data.article,
    tags: primaryQuestion.data.tags || [],
    analysis: primaryQuestion.data.analysis,
    notification: primaryQuestion.data.notification,
    newsSource: primaryQuestion.data.newsSource,
    results: {
      totalResponses: 0,
      perOption,
      breakdown: [],
      lastUpdated: generatedAt,
    },
    source: {
      generatedAt,
      model,
      promptVersion: primaryQuestion.data.source?.promptVersion || "2025-02-20",
      listingStrategy: primaryQuestion.data.source?.listingStrategy || null,
    },
    createdAt: generatedAt,
    updatedAt: generatedAt,
  };

  batch.set(dayDocRef, dayDocData, {merge: false});
  questionEntries.forEach((entry) => {
    batch.set(entry.ref, entry.data, {merge: false});
  });

  await batch.commit();

  logger.info("Created questions of the day", {
    dateKey,
    questionCount: questionEntries.length,
    sources: questionEntries.map((entry) => entry.data.newsSource?.id || "unknown"),
  });

  return {
    status: "created",
    questionCount: questionEntries.length,
  };
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
    timeoutSeconds: 540,
  },
  async () => {
  return runDailyQuestionJob();
  },
);

exports.generateQuestionOfTheDayOnDemand = onRequest(
  {
    secrets: [OPENAI_API_KEY],
    timeoutSeconds: 540,
  },
  async (req, res) => {
    try {
      const result = await runDailyQuestionJob();
      res.json(result);
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

function resolveTimestampMillis(value) {
  if (!value) return 0;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (value instanceof admin.firestore.Timestamp) {
    return value.toMillis();
  }
  if (typeof value.toDate === "function") {
    try {
      return value.toDate().getTime();
    } catch (error) {
      logger.warn("Failed to convert timestamp-like value", {error: error.message});
    }
  }
  return 0;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

async function reconcileLinkedDeviceDocuments() {
  const snapshot = await db.collection("devices").get();
  if (snapshot.empty) {
    logger.info("No devices found for reconciliation");
    return {status: "no_devices"};
  }

  const devicesByAuth = new Map();
  snapshot.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const authUid = data.authUid;
    if (!authUid) return;
    if (!devicesByAuth.has(authUid)) {
      devicesByAuth.set(authUid, []);
    }
    devicesByAuth.get(authUid).push({
      id: docSnap.id,
      data,
    });
  });

  if (!devicesByAuth.size) {
    logger.info("No linked devices found for reconciliation");
    return {status: "no_linked_devices"};
  }

  let updatedGroups = 0;

  for (const [authUid, entries] of devicesByAuth.entries()) {
    if (!entries.length) continue;

    const sortedByLinkTime = entries
      .slice()
      .sort((a, b) => resolveTimestampMillis(b.data.authLinkedAt) - resolveTimestampMillis(a.data.authLinkedAt));
    const target = sortedByLinkTime[0];
    if (!target) continue;

    const numericMax = new Map();
    for (const entry of entries) {
      const record = entry.data || {};
      for (const [key, value] of Object.entries(record)) {
        if (!isFiniteNumber(value)) continue;
        const current = numericMax.get(key);
        if (current == null || value > current) {
          numericMax.set(key, value);
        }
      }
    }

    let mostRecentProfile = null;
    let mostRecentProfileMillis = 0;
    for (const entry of entries) {
      const profile = entry.data?.profile;
      if (!profile) continue;
      const millis = resolveTimestampMillis(profile.updatedAt);
      if (millis > mostRecentProfileMillis) {
        mostRecentProfileMillis = millis;
        mostRecentProfile = profile;
      }
    }

    const updateData = {};
    for (const [key, maxValue] of numericMax.entries()) {
      if (!Object.prototype.hasOwnProperty.call(target.data, key) || !isFiniteNumber(target.data[key]) || target.data[key] < maxValue) {
        updateData[key] = maxValue;
      }
    }

    if (mostRecentProfile) {
      const currentProfileMillis = resolveTimestampMillis(target.data?.profile?.updatedAt);
      if (!target.data?.profile || mostRecentProfileMillis > currentProfileMillis) {
        updateData.profile = mostRecentProfile;
      }
    }

    if (!Object.keys(updateData).length) continue;

    updateData.deviceId = target.data.deviceId || target.id;

    await db.doc(`devices/${target.id}`).set(updateData, {merge: true});
    updatedGroups += 1;
    logger.info("Reconciled linked device", {authUid, target: target.id, updates: Object.keys(updateData)});
  }

  logger.info("Linked device reconciliation completed", {
    groupsProcessed: devicesByAuth.size,
    groupsUpdated: updatedGroups,
  });

  return {
    status: "completed",
    groupsProcessed: devicesByAuth.size,
    groupsUpdated: updatedGroups,
  };
}

async function generateInstagramImage(questionText) {
  if (!questionText) {
    throw new Error("Cannot generate Instagram image without question text");
  }
  const client = getOpenAIClient();
  const response = await client.images.generate({
    model: "gpt-image-1",
    prompt: `Create a square 1024x1024 illustration inspired by the following daily question for the Mir Sinn community in Luxembourg.
             Render the scene in a vibrant, modern take on American comic books, in a futuristic style, featuring Luxembourgish cultural elements where relevant.
             Avoid adding any text or lettering. Also include the current weather in luxembourg city as a subtle background element.

Question: "${questionText}"
`,
    size: "1024x1024",
    n: 1,
  });

  const imagePayload = response.data?.[0]?.b64_json;
  if (!imagePayload) {
    throw new Error("OpenAI did not return image data");
  }
  return Buffer.from(imagePayload, "base64");
}

async function uploadInstagramImage(storageKey, buffer) {
  if (!buffer?.length) {
    throw new Error("No image buffer provided for upload");
  }
  const bucket = admin.storage().bucket();
  const file = bucket.file(storageKey);
  await file.save(buffer, {
    contentType: "image/png",
    metadata: {
      cacheControl: "public, max-age=3600",
    },
  });

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  const [signedUrl] = await file.getSignedUrl({
    action: "read",
    expires: expiresAt,
  });

  return {
    signedUrl,
    storagePath: storageKey,
    expiresAt,
  };
}

async function uploadInstagramVideo(storageKey, buffer) {
  if (!buffer?.length) {
    throw new Error("No video buffer provided for upload");
  }
  const downloadToken =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : crypto.randomBytes(16).toString("hex");
  const bucket = admin.storage().bucket();
  const file = bucket.file(storageKey);
  await file.save(buffer, {
    contentType: "video/mp4",
    metadata: {
      cacheControl: "public, max-age=3600",
      metadata: {
        firebaseStorageDownloadTokens: downloadToken,
      },
    },
  });
  const downloadUrl = buildPublicStorageUrl(storageKey, downloadToken, bucket.name);
  return {
    storagePath: storageKey,
    downloadToken,
    downloadUrl,
  };
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegInstaller.path, args, {
      stdio: ["ignore", "inherit", "inherit"],
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });
}

async function createReelVideoFromImage(imageBuffer, options = {}) {
  if (!imageBuffer?.length) {
    throw new Error("Image buffer required to create reel video");
  }

  const width = options.width || 1080;
  const height = options.height || 1920;
  const durationSeconds = options.durationSeconds || 3;
  const fps = options.fps || 30;
  const zoomIncrement = options.zoomIncrement ?? 0.0025;
  const maxZoom = options.maxZoom ?? 1.05;

  const tmpDir = os.tmpdir();
  const uniqueId = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  const imagePath = path.join(tmpDir, `mirsinn-${uniqueId}.png`);
  const videoPath = path.join(tmpDir, `mirsinn-${uniqueId}.mp4`);

  await fs.writeFile(imagePath, imageBuffer);

  const frameCount = Math.max(1, Math.round(durationSeconds * fps));
  const zoomExpr = `min(zoom+${zoomIncrement.toFixed(4)},${maxZoom})`;
  const filterGraph = [
    `scale=${width}:${height}:force_original_aspect_ratio=increase`,
    `crop=${width}:${height}`,
    `zoompan=z='${zoomExpr}':d=${frameCount}:s=${width}x${height}`,
    `fps=${fps}`,
  ].join(",");

  const ffmpegArgs = [
    "-y",
    "-loop",
    "1",
    "-i",
    imagePath,
    "-t",
    String(durationSeconds),
    "-vf",
    filterGraph,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-an",
    "-r",
    String(fps),
    videoPath,
  ];

  logger.info(ffmpegArgs.join(" "));

  let videoBuffer;
  try {
    await runFfmpeg(ffmpegArgs);
    videoBuffer = await fs.readFile(videoPath);
  } finally {
    await Promise.allSettled([fs.unlink(imagePath), fs.unlink(videoPath)]);
  }

  return {
    buffer: videoBuffer,
    width,
    height,
    durationSeconds,
    fps,
  };
}

async function getSignedUrlForStoragePath(storagePath, expiresInMs = 60 * 60 * 1000) {
  if (!storagePath) {
    throw new Error("Storage path required for signed URL");
  }
  const bucket = admin.storage().bucket();
  const file = bucket.file(storagePath);
  const [exists] = await file.exists();
  if (!exists) {
    throw new Error(`Storage file not found: ${storagePath}`);
  }
  const expiresAt = new Date(Date.now() + expiresInMs);
  const [signedUrl] = await file.getSignedUrl({
    action: "read",
    expires: expiresAt,
  });
  return {signedUrl, expiresAt};
}

function buildPublicStorageUrl(storagePath, downloadToken, bucketName) {
  if (!storagePath || !downloadToken) {
    return null;
  }
  const targetBucketName = bucketName || admin.storage().bucket().name;
  const encodedPath = encodeURIComponent(storagePath);
  return `https://firebasestorage.googleapis.com/v0/b/${targetBucketName}/o/${encodedPath}?alt=media&token=${downloadToken}`;
}

function getReelStorageInfo(questionDoc = {}) {
  const reelInfo = questionDoc.instagramReel || questionDoc.reel || {};
  const videoPath =
    reelInfo.videoPath ||
    reelInfo.videoStoragePath ||
    reelInfo.generatedVideoPath ||
    null;
  const downloadUrl = reelInfo.videoDownloadUrl || reelInfo.downloadUrl || null;
  const downloadToken = reelInfo.videoDownloadToken || reelInfo.downloadToken || null;
  return {
    reelInfo,
    videoPath,
    downloadUrl,
    downloadToken,
  };
}

async function resolveVideoUrlFromStorageInfo(storageInfo) {
  if (!storageInfo?.videoPath) {
    throw new Error("No reel video path available");
  }
  const publicUrl =
    storageInfo.downloadUrl ||
    (storageInfo.downloadToken ? buildPublicStorageUrl(storageInfo.videoPath, storageInfo.downloadToken) : null);
  if (publicUrl) {
    return {
      videoUrl: publicUrl,
      source: "public",
    };
  }

  const signedVideo = await getSignedUrlForStoragePath(storageInfo.videoPath);
  return {
    videoUrl: signedVideo.signedUrl,
    source: "signed",
  };
}

function buildInstagramCaption(questionDoc) {
  const question = questionDoc?.question || {};
  const questionText = question.lb || question.en || question.de || question.fr || "Share your voice with Mir Sinn.";
  const lines = [
    questionText,
    "",
    "Vote now: https://mirsinn.lu",
  ];
  return lines.filter(Boolean).join("\n");
}

async function waitForInstagramContainer(creationId, accessToken, maxAttempts = 10, delayMs = 3000) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const statusUrl = new URL(`https://graph.instagram.com/v24.0/${creationId}`);
    statusUrl.searchParams.set("fields", "status_code,status,error_message");
    statusUrl.searchParams.set("access_token", accessToken);
    const statusResponse = await fetch(statusUrl, {method: "GET"});
    const statusJson = await statusResponse.json().catch(() => ({}));
    if (!statusResponse.ok) {
      throw new Error(`Failed to check Instagram media status: ${statusJson.error?.message || statusResponse.statusText}`);
    }

    const statusCode = statusJson.status_code;
    if (statusCode === "FINISHED") {
      return statusJson;
    }
    if (statusCode === "ERROR") {
      throw new Error(statusJson.error_message || "Instagram media processing failed");
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error("Timed out waiting for Instagram media to be ready");
}

async function createInstagramPost(imageUrl, caption) {
  const igUserId = INSTAGRAM_USER_ID.value();
  const accessToken = INSTAGRAM_ACCESS_TOKEN.value();
  if (!igUserId) {
    throw new Error("INSTAGRAM_USER_ID is not configured");
  }
  if (!accessToken) {
    throw new Error("INSTAGRAM_ACCESS_TOKEN is not configured");
  }

  const mediaEndpoint = `https://graph.instagram.com/v24.0/${igUserId}/media`;
  const params = new URLSearchParams({
    image_url: imageUrl,
    caption,
    access_token: accessToken,
  });
  const creationResponse = await fetch(mediaEndpoint, {
    method: "POST",
    body: params,
  });
  const creationJson = await creationResponse.json().catch(() => ({}));
  if (!creationResponse.ok) {
    throw new Error(`Instagram media creation failed: ${creationJson.error?.message || creationResponse.statusText}`);
  }

  const creationId = creationJson.id;
  if (!creationId) {
    throw new Error("Instagram media creation response missing id");
  }

  await waitForInstagramContainer(creationId, accessToken, 40, 5000);

  const publishResponse = await fetch(`https://graph.instagram.com/v24.0/${igUserId}/media_publish`, {
    method: "POST",
    body: new URLSearchParams({
      creation_id: creationId,
      access_token: accessToken,
    }),
  });
  const publishJson = await publishResponse.json().catch(() => ({}));
  if (!publishResponse.ok) {
    throw new Error(`Instagram publish failed: ${publishJson.error?.message || publishResponse.statusText}`);
  }

  return {
    creationId,
    postId: publishJson.id || null,
    publishResponse: publishJson,
  };
}

async function createInstagramReel(videoUrl, caption, options = {}) {
  const igUserId = INSTAGRAM_USER_ID.value();
  const accessToken = INSTAGRAM_ACCESS_TOKEN.value();
  if (!igUserId) {
    throw new Error("INSTAGRAM_USER_ID is not configured");
  }
  if (!accessToken) {
    throw new Error("INSTAGRAM_ACCESS_TOKEN is not configured");
  }

  const params = new URLSearchParams({
    media_type: "REELS",
    video_url: videoUrl,
    caption,
    access_token: accessToken,
  });

  if (options.coverUrl) {
    params.set("cover_photo_url", options.coverUrl);
  }
  if (typeof options.thumbOffset === "number") {
    params.set("thumb_offset", String(options.thumbOffset));
  }

  const creationResponse = await fetch(`https://graph.instagram.com/v24.0/${igUserId}/media`, {
    method: "POST",
    body: params,
  });
  const creationJson = await creationResponse.json().catch(() => ({}));
  if (!creationResponse.ok) {
    throw new Error(`Instagram reel creation failed: ${creationJson.error?.message || creationResponse.statusText}`);
  }

  const creationId = creationJson.id;
  if (!creationId) {
    throw new Error("Instagram reel creation response missing id");
  }

  await waitForInstagramContainer(creationId, accessToken);

  const publishResponse = await fetch(`https://graph.instagram.com/v24.0/${igUserId}/media_publish`, {
    method: "POST",
    body: new URLSearchParams({
      creation_id: creationId,
      access_token: accessToken,
    }),
  });
  const publishJson = await publishResponse.json().catch(() => ({}));
  if (!publishResponse.ok) {
    throw new Error(`Instagram reel publish failed: ${publishJson.error?.message || publishResponse.statusText}`);
  }

  return {
    creationId,
    postId: publishJson.id || null,
    publishResponse: publishJson,
  };
}

async function createInstagramStory(videoUrl, options = {}) {
  const igUserId = INSTAGRAM_USER_ID.value();
  const accessToken = INSTAGRAM_ACCESS_TOKEN.value();
  if (!igUserId) {
    throw new Error("INSTAGRAM_USER_ID is not configured");
  }
  if (!accessToken) {
    throw new Error("INSTAGRAM_ACCESS_TOKEN is not configured");
  }

  const params = new URLSearchParams({
    media_type: "STORIES",
    video_url: videoUrl,
    access_token: accessToken,
  });

  if (typeof options.thumbOffset === "number") {
    params.set("thumb_offset", String(options.thumbOffset));
  }
  const linkUrl = options.linkUrl || "https://mirsinn.lu";
  const interactiveElements =
    options.interactiveElements ||
    [
      {
        type: "LINK",
        link: linkUrl,
        x: 0.5,
        y: 0.15,
        width: 0.85,
        height: 0.12,
        rotation: 0,
      },
    ];
  if (interactiveElements?.length) {
    params.set("interactive_elements", JSON.stringify(interactiveElements));
  }

  const creationResponse = await fetch(`https://graph.instagram.com/v24.0/${igUserId}/media`, {
    method: "POST",
    body: params,
  });
  const creationJson = await creationResponse.json().catch(() => ({}));
  if (!creationResponse.ok) {
    throw new Error(`Instagram story creation failed: ${creationJson.error?.message || creationResponse.statusText}`);
  }

  const creationId = creationJson.id;
  if (!creationId) {
    throw new Error("Instagram story creation response missing id");
  }

  await waitForInstagramContainer(
    creationId,
    accessToken,
    options.maxAttempts ?? 40,
    options.delayMs ?? 5000,
  );

  const publishResponse = await fetch(`https://graph.instagram.com/v24.0/${igUserId}/media_publish`, {
    method: "POST",
    body: new URLSearchParams({
      creation_id: creationId,
      access_token: accessToken,
    }),
  });
  const publishJson = await publishResponse.json().catch(() => ({}));
  if (!publishResponse.ok) {
    throw new Error(`Instagram story publish failed: ${publishJson.error?.message || publishResponse.statusText}`);
  }

  return {
    creationId,
    postId: publishJson.id || null,
    publishResponse: publishJson,
  };
}

async function publishQuestionToInstagramDoc(questionRef, questionDoc, dateKey, options = {}) {
  const force = Boolean(options.force);
  if (!questionDoc) {
    logger.warn("Instagram publish requested without question document", {dateKey});
    return {status: "skipped", reason: "missing_question_doc"};
  }

  if (
    !force &&
    questionDoc.instagram?.status === "published" &&
    questionDoc.instagram?.postId
  ) {
    logger.info("Instagram post already recorded for question", {
      dateKey,
      postId: questionDoc.instagram.postId,
    });
    return {status: "skipped", reason: "already_published", postId: questionDoc.instagram.postId};
  }

  const questionText =
    questionDoc.question?.lb ||
    questionDoc.question?.en ||
    questionDoc.question?.de ||
    questionDoc.question?.fr;

  if (!questionText) {
    logger.warn("Question text missing for Instagram generation", {dateKey});
    await questionRef.set(
      {
        instagram: {
          status: "skipped",
          reason: "missing_question_text",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      {merge: true},
    );
    return {status: "skipped", reason: "missing_question_text"};
  }

  try {
    logger.info("Generating Instagram image for question", {dateKey, force});
    const imageBuffer = await generateInstagramImage(questionText);
    const timestamp = Date.now();
    const imageStorageKey = `instagram/${dateKey}-${timestamp}.png`;
    const uploadResult = await uploadInstagramImage(imageStorageKey, imageBuffer);

    let reelVideoUpload = null;
    let reelMeta = null;
    try {
      const reelVideo = await createReelVideoFromImage(imageBuffer);
      const {buffer: reelBuffer, durationSeconds, width, height, fps} = reelVideo;
      const videoStorageKey = `instagram/reels/${dateKey}-${timestamp}.mp4`;
      reelVideoUpload = await uploadInstagramVideo(videoStorageKey, reelBuffer);
      reelMeta = {durationSeconds, width, height, fps};
      logger.info("Generated reel video from Instagram image", {
        dateKey,
        videoPath: reelVideoUpload.storagePath,
        duration: durationSeconds,
      });
    } catch (videoError) {
      logger.error("Failed to generate reel video from Instagram image", {
        dateKey,
        error: videoError.message,
      });
    }

    const caption = buildInstagramCaption(questionDoc);
    logger.info("Publishing Instagram post", {dateKey, force});
    const publishResult = await createInstagramPost(uploadResult.signedUrl, caption);

    const updatePayload = {
      instagram: {
        status: "published",
        postId: publishResult.postId,
        creationId: publishResult.creationId,
        caption,
        imagePath: uploadResult.storagePath,
        publishedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    };

    if (reelVideoUpload) {
      const existingReel = questionDoc.instagramReel || {};
      const nextStatus =
        existingReel.status === "published" && existingReel.postId ? "published" : "ready";
      const readyTimestamp =
        nextStatus === "ready"
          ? admin.firestore.FieldValue.serverTimestamp()
          : existingReel.readyAt || admin.firestore.FieldValue.serverTimestamp();
      updatePayload.instagramReel = {
        status: nextStatus,
        videoPath: reelVideoUpload.storagePath,
        videoStoragePath: reelVideoUpload.storagePath,
        generatedVideoPath: reelVideoUpload.storagePath,
        videoDownloadToken: reelVideoUpload.downloadToken,
        videoDownloadUrl: reelVideoUpload.downloadUrl,
        coverImagePath: uploadResult.storagePath,
        caption,
        durationSeconds: reelMeta?.durationSeconds ?? 3,
        width: reelMeta?.width ?? 1080,
        height: reelMeta?.height ?? 1920,
        fps: reelMeta?.fps ?? 30,
        source: "auto_generated_image",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        readyAt: readyTimestamp,
      };
    }

    await questionRef.set(updatePayload, {merge: true});

    logger.info("Instagram post published", {dateKey, postId: publishResult.postId, force});
    return {status: "published", postId: publishResult.postId, creationId: publishResult.creationId};
  } catch (error) {
    logger.error("Failed to publish Instagram post", {dateKey, error: error.message, force});
    await questionRef.set(
      {
        instagram: {
          status: "error",
          error: error.message,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      {merge: true},
    );
    throw error;
  }
}

exports.publishQuestionToInstagram = onDocumentCreated(
  {
    document: "questions/{dateKey}",
    secrets: [OPENAI_API_KEY, INSTAGRAM_ACCESS_TOKEN],
    timeoutSeconds: 300,
    memory: "1GiB",
  },
  async (event) => {
    const snapshot = event.data;
    const dateKey = event.params?.dateKey || snapshot?.id || "unknown";
    if (!snapshot) {
      logger.warn("publishQuestionToInstagram triggered without snapshot", {dateKey});
      return null;
    }

    const questionDoc = snapshot.data();
    return publishQuestionToInstagramDoc(snapshot.ref, questionDoc, dateKey, {force: false});
  },
);

exports.publishQuestionToInstagramOnDemand = onRequest(
  {
    secrets: [OPENAI_API_KEY, INSTAGRAM_ACCESS_TOKEN],
    timeoutSeconds: 300,
    memory: "1GiB",
  },
  async (req, res) => {
    const method = (req.method || "GET").toUpperCase();
    if (method !== "GET" && method !== "POST") {
      res.set("Allow", "GET, POST");
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    let body = {};
    if (method === "POST") {
      if (typeof req.body === "string") {
        try {
          body = JSON.parse(req.body);
        } catch {
          body = {};
        }
      } else if (req.body && typeof req.body === "object") {
        body = req.body;
      }
    }

    const dateParam =
      (typeof (body.date ?? "") === "string" && body.date.trim()) ||
      (typeof req.query?.date === "string" && req.query.date.trim()) ||
      "";
    const dateKey = dateParam || getLuxDateKey();

    const forceParam =
      body.force ??
      req.query?.force ??
      false;
    const force =
      typeof forceParam === "string"
        ? ["1", "true", "yes", "force"].includes(forceParam.toLowerCase())
        : Boolean(forceParam);

    logger.info("On-demand Instagram publish requested", {dateKey, force});

    try {
      const questionRef = db.doc(`questions/${dateKey}`);
      const snapshot = await questionRef.get();
      if (!snapshot.exists) {
        res.status(404).json({error: `Question ${dateKey} not found`, dateKey});
        return;
      }

      const questionDoc = snapshot.data();
      const result = await publishQuestionToInstagramDoc(questionRef, questionDoc, dateKey, {force});
      res.json({
        dateKey,
        force,
        ...result,
      });
    } catch (error) {
      logger.error("Failed to publish Instagram post on demand", {dateKey, error: error.message});
      res.status(500).json({error: error.message, dateKey});
    }
  },
);

async function publishQuestionReelToInstagramDoc(questionRef, questionDoc, dateKey, options = {}) {
  const force = Boolean(options.force);
  if (!questionDoc) {
    logger.warn("Instagram reel publish requested without question document", {dateKey});
    return {status: "skipped", reason: "missing_question_doc"};
  }

  const existingStatus = questionDoc.instagramReel?.status;
  const existingPostId = questionDoc.instagramReel?.postId;
  if (!force && existingStatus === "published" && existingPostId) {
    logger.info("Instagram reel already published for question", {dateKey, postId: existingPostId});
    return {status: "skipped", reason: "already_published", postId: existingPostId};
  }

  const storageInfo = getReelStorageInfo(questionDoc);
  const {reelInfo, videoPath, downloadToken: storedDownloadToken} = storageInfo;
  if (!videoPath) {
    logger.warn("No reel video path available for question", {dateKey});
    await questionRef.set(
      {
        instagramReel: {
          status: "skipped",
          reason: "missing_video",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      {merge: true},
    );
    return {status: "skipped", reason: "missing_video"};
  }

  const publicVideoUrl =
    storageInfo.downloadUrl ||
    (storageInfo.downloadToken ? buildPublicStorageUrl(videoPath, storageInfo.downloadToken) : null);

  let resolvedVideo;
  try {
    resolvedVideo = await resolveVideoUrlFromStorageInfo(storageInfo);
  } catch (error) {
    logger.error("Unable to resolve reel video URL", {dateKey, videoPath, error: error.message});
    await questionRef.set(
      {
        instagramReel: {
          status: "error",
          error: `video_signing_failed: ${error.message}`,
          videoDownloadToken: storedDownloadToken || null,
          videoDownloadUrl: publicVideoUrl || null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      {merge: true},
    );
    throw error;
  }
  const videoUrl = resolvedVideo.videoUrl;

  let coverUrl = null;
  let coverPath =
    reelInfo.coverImagePath ||
    reelInfo.coverPath ||
    questionDoc.instagram?.imagePath ||
    null;
  if (coverPath) {
    try {
      const signedCover = await getSignedUrlForStoragePath(coverPath);
      coverUrl = signedCover.signedUrl;
    } catch (error) {
      logger.warn("Unable to sign reel cover image URL, proceeding without cover", {
        dateKey,
        coverPath,
        error: error.message,
      });
      coverUrl = null;
    }
  }

  const caption = reelInfo.caption || buildInstagramCaption(questionDoc);
  try {
    logger.info("Publishing Instagram reel", {
      dateKey,
      force,
      usingDownloadToken: Boolean(storedDownloadToken),
      videoUrlSource: resolvedVideo.source,
    });
    const publishResult = await createInstagramReel(videoUrl, caption, {coverUrl});
    const reelUpdate = {
      status: "published",
      postId: publishResult.postId,
      creationId: publishResult.creationId,
      caption,
      videoPath,
      coverImagePath: coverPath || null,
      publishedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (reelInfo.durationSeconds) reelUpdate.durationSeconds = reelInfo.durationSeconds;
    if (reelInfo.width) reelUpdate.width = reelInfo.width;
    if (reelInfo.height) reelUpdate.height = reelInfo.height;
    if (reelInfo.fps) reelUpdate.fps = reelInfo.fps;
    if (reelInfo.source) reelUpdate.source = reelInfo.source;
    if (reelInfo.readyAt) reelUpdate.readyAt = reelInfo.readyAt;
    if (reelInfo.videoStoragePath) reelUpdate.videoStoragePath = reelInfo.videoStoragePath;
    if (reelInfo.generatedVideoPath) reelUpdate.generatedVideoPath = reelInfo.generatedVideoPath;
    if (storageInfo.downloadToken) reelUpdate.videoDownloadToken = storageInfo.downloadToken;
    if (publicVideoUrl) {
      reelUpdate.videoDownloadUrl = publicVideoUrl;
    } else if (reelInfo.videoDownloadUrl) {
      reelUpdate.videoDownloadUrl = reelInfo.videoDownloadUrl;
    }

    await questionRef.set(
      {
        instagramReel: reelUpdate,
      },
      {merge: true},
    );
    logger.info("Instagram reel published", {dateKey, postId: publishResult.postId, force});
    return {status: "published", postId: publishResult.postId, creationId: publishResult.creationId};
  } catch (error) {
    logger.error("Failed to publish Instagram reel", {dateKey, error: error.message, force});
    await questionRef.set(
      {
        instagramReel: {
          status: "error",
          error: error.message,
          videoPath,
          videoDownloadToken: storedDownloadToken || null,
          videoDownloadUrl: publicVideoUrl || null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      {merge: true},
    );
    throw error;
  }
}

async function publishQuestionStoryDoc(questionRef, questionDoc, dateKey, options = {}) {
  const force = Boolean(options.force);
  const existingStory = questionDoc.instagramStory || {};
  if (!force && existingStory.status === "published" && existingStory.postId) {
    logger.info("Instagram story already published for question", {dateKey, postId: existingStory.postId});
    return {status: "skipped", reason: "already_published", postId: existingStory.postId};
  }

  const storageInfo = getReelStorageInfo(questionDoc);
  const {videoPath} = storageInfo;
  if (!videoPath) {
    logger.warn("No reel video available for Instagram story", {dateKey});
    await questionRef.set(
      {
        instagramStory: {
          status: "skipped",
          reason: "missing_video",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      {merge: true},
    );
    return {status: "skipped", reason: "missing_video"};
  }

  let resolvedVideo;
  try {
    resolvedVideo = await resolveVideoUrlFromStorageInfo(storageInfo);
  } catch (error) {
    logger.error("Unable to resolve story video URL", {dateKey, videoPath, error: error.message});
    await questionRef.set(
      {
        instagramStory: {
          status: "error",
          error: `video_signing_failed: ${error.message}`,
          videoPath,
          videoDownloadToken: storageInfo.downloadToken || null,
          videoDownloadUrl:
            storageInfo.downloadUrl ||
            (storageInfo.downloadToken ? buildPublicStorageUrl(videoPath, storageInfo.downloadToken) : null),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      {merge: true},
    );
    throw error;
  }

  const storyCaption = storageInfo.reelInfo?.caption || buildInstagramCaption(questionDoc);
  const storyDownloadUrl =
    storageInfo.downloadUrl ||
    (storageInfo.downloadToken ? buildPublicStorageUrl(videoPath, storageInfo.downloadToken) : null);

  try {
    logger.info("Publishing Instagram story from reel video", {
      dateKey,
      force,
      videoUrlSource: resolvedVideo.source,
    });
    const storyOptions = options.storyOptions || {};
    if (!storyOptions.linkUrl) {
      storyOptions.linkUrl = "https://mirsinn.lu";
    }
    const publishResult = await createInstagramStory(resolvedVideo.videoUrl, storyOptions);
    const storyUpdate = {
      status: "published",
      postId: publishResult.postId,
      creationId: publishResult.creationId,
      videoPath,
      videoDownloadToken: storageInfo.downloadToken || null,
      videoDownloadUrl: storyDownloadUrl || null,
      caption: storyCaption,
      source: "reel_video",
      publishedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await questionRef.set(
      {
        instagramStory: storyUpdate,
      },
      {merge: true},
    );

    return {status: "published", postId: publishResult.postId, creationId: publishResult.creationId};
  } catch (error) {
    logger.error("Failed to publish Instagram story", {dateKey, error: error.message, force});
    await questionRef.set(
      {
        instagramStory: {
          status: "error",
          error: error.message,
          videoPath,
          videoDownloadToken: storageInfo.downloadToken || null,
          videoDownloadUrl: storyDownloadUrl || null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      {merge: true},
    );
    throw error;
  }
}

async function runInstagramReelPublish(dateKey, options = {}) {
  const questionRef = db.doc(`questions/${dateKey}`);
  const snapshot = await questionRef.get();
  if (!snapshot.exists) {
    logger.warn("No question document found for reel publish", {dateKey});
    return {status: "not_found", dateKey};
  }
  const questionDoc = snapshot.data();
  return publishQuestionReelToInstagramDoc(questionRef, questionDoc, dateKey, options);
}

exports.publishQuestionReelAndStoryAuto = onDocumentWritten(
  {
    document: "questions/{dateKey}",
    secrets: [OPENAI_API_KEY, INSTAGRAM_ACCESS_TOKEN],
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async (event) => {
    const afterSnapshot = event.data?.after;
    if (!afterSnapshot) {
      return null;
    }
    const dateKey = event.params?.dateKey || afterSnapshot.id || "unknown";
    const afterData = afterSnapshot.data();
    const beforeData = event.data?.before?.data();

    const postJustPublished =
      afterData?.instagram?.status === "published" &&
      afterData.instagram?.postId &&
      (!beforeData?.instagram || beforeData.instagram.status !== "published");

    if (!postJustPublished) {
      return null;
    }

    const questionRef = afterSnapshot.ref;
    logger.info("Auto reel/story publish triggered by post", {dateKey});

    let workingDoc = afterData;
    const reelResult = await publishQuestionReelToInstagramDoc(questionRef, workingDoc, dateKey, {force: false});

    if (reelResult?.status !== "published") {
      logger.info("Reel publish outcome during auto flow", {dateKey, reelStatus: reelResult?.status, reelReason: reelResult?.reason});
    }

    const refreshedSnapshot = await questionRef.get();
    workingDoc = refreshedSnapshot.data();

    await publishQuestionStoryDoc(questionRef, workingDoc, dateKey, {force: false});

    return null;
  },
);

exports.publishQuestionReelOnDemand = onRequest(
  {
    secrets: [INSTAGRAM_ACCESS_TOKEN],
    timeoutSeconds: 300,
    memory: "1GiB",
  },
  async (req, res) => {
    const method = (req.method || "GET").toUpperCase();
    if (method !== "GET" && method !== "POST") {
      res.set("Allow", "GET, POST");
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    let body = {};
    if (method === "POST") {
      if (typeof req.body === "string") {
        try {
          body = JSON.parse(req.body);
        } catch {
          body = {};
        }
      } else if (req.body && typeof req.body === "object") {
        body = req.body;
      }
    }

    const dateParam =
      (typeof (body.date ?? "") === "string" && body.date.trim()) ||
      (typeof req.query?.date === "string" && req.query.date.trim()) ||
      "";
    const dateKey = dateParam || getLuxDateKey();

    const forceParam = body.force ?? req.query?.force ?? false;
    const force =
      typeof forceParam === "string"
        ? ["1", "true", "yes", "force"].includes(forceParam.toLowerCase())
        : Boolean(forceParam);

    logger.info("On-demand Instagram reel publish requested", {dateKey, force});
    try {
      const result = await runInstagramReelPublish(dateKey, {force});
      res.json({
        dateKey,
        force,
        ...result,
      });
    } catch (error) {
      logger.error("Failed to publish Instagram reel on demand", {dateKey, error: error.message});
      res.status(500).json({error: error.message, dateKey});
    }
  },
);

exports.publishQuestionReelAndStoryOnDemand = onRequest(
  {
    secrets: [OPENAI_API_KEY, INSTAGRAM_ACCESS_TOKEN],
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async (req, res) => {
    const method = (req.method || "GET").toUpperCase();
    if (method !== "GET" && method !== "POST") {
      res.set("Allow", "GET, POST");
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    let body = {};
    if (method === "POST") {
      if (typeof req.body === "string") {
        try {
          body = JSON.parse(req.body);
        } catch {
          body = {};
        }
      } else if (req.body && typeof req.body === "object") {
        body = req.body;
      }
    }

    const dateParam =
      (typeof (body.date ?? "") === "string" && body.date.trim()) ||
      (typeof req.query?.date === "string" && req.query.date.trim()) ||
      "";
    const dateKey = dateParam || getLuxDateKey();

    const forceParam = body.force ?? req.query?.force ?? false;
    const force =
      typeof forceParam === "string"
        ? ["1", "true", "yes", "force"].includes(forceParam.toLowerCase())
        : Boolean(forceParam);

    logger.info("On-demand Instagram reel and story publish requested", {dateKey, force});

    try {
      const questionRef = db.doc(`questions/${dateKey}`);
      const snapshot = await questionRef.get();
      if (!snapshot.exists) {
        res.status(404).json({error: `Question ${dateKey} not found`, dateKey});
        return;
      }

      let questionDoc = snapshot.data();
      const reelResult = await publishQuestionReelToInstagramDoc(questionRef, questionDoc, dateKey, {force});

      const refreshedSnapshot = await questionRef.get();
      questionDoc = refreshedSnapshot.data();

      const storyResult = await publishQuestionStoryDoc(questionRef, questionDoc, dateKey, {force});

      res.json({
        dateKey,
        force,
        reel: reelResult,
        story: storyResult,
      });
    } catch (error) {
      logger.error("Failed to publish Instagram reel/story on demand", {dateKey, error: error.message});
      res.status(500).json({error: error.message, dateKey});
    }
  },
);

exports.sendQuestionNotifications = onSchedule(
  {
    schedule: "0 8 * * *",
    timeZone: LUX_TZ,
  },
  async () => {
    return runDailyNotificationJob();
  },
);

exports.reconcileLinkedDevices = onSchedule(
  {
    schedule: "0 * * * *",
    timeZone: LUX_TZ,
  },
  async () => reconcileLinkedDeviceDocuments(),
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

  let answersSnap = await db.collection(`questions/${dateKey}/answers`).get();
  if (answersSnap.empty) {
    const primaryQuestionId = questionDoc.primaryQuestionId || questionDoc?.primaryQuestion?.id || questionDoc?.primaryQuestionId;
    const fallbackQuestionId = questionDoc.primaryQuestionId;
    const resolvedQuestionId = primaryQuestionId || fallbackQuestionId;
    if (resolvedQuestionId) {
      answersSnap = await db
        .collection(`questions/${dateKey}/questions/${resolvedQuestionId}/answers`)
        .get();
    }
  }
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
