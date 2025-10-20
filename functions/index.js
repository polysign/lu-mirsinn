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
const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret, defineString} = require("firebase-functions/params");
const admin = require("firebase-admin");
const {OpenAI} = require("openai");
const cheerio = require("cheerio");

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
  snapshot.forEach(docSnap => {
    const data = docSnap.data() || {};
    const token = data.fcmToken;
    if (!token) return;
    devices.push({
      id: docSnap.id,
      token,
      language: normaliseLanguage(data.language),
    });
  });

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
        const response = await messaging.sendMulticast(message);
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
