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

function extractTopArticle(listingHtml) {
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
      return {
        url: normalizeUrl(fallback.attr("href")),
        title: fallback.text().trim(),
        summary: fallback.closest("div.card").find(".card__summary").text().trim(),
        comments: 0,
      };
    }
    return null;
  }

  candidates.sort((a, b) => b.comments - a.comments);
  return candidates[0];
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
  "analysis": {"lb": "...", "fr": "...", "de": "...", "en": "..."}
}
- Provide 2 to 4 answer options with short, neutral phrasings.
- Keep each text under 200 characters.
- Question and summaries must be translated into Luxembourgish (lb), French (fr), German (de), and English (en).
- Use simple apostrophes (') and ASCII characters wherever possible.
- The question should directly relate to the article's core issue and be suitable for a quick opinion poll.
- The analysis should briefly explain why the question matters today.

Respond with JSON only, without explanations or code fences.`;

  const messages = [
    {role: "system", content: "You are an assistant that turns RTL.lu articles into multilingual daily poll questions. You must respond with valid JSON only."},
    {
      role: "user",
      content: `${prompt}\n\n[listing_html]\n${listingHtml}\n\n[selected_article_html]\n${articleHtml}\n\n[context]\n${JSON.stringify(context)}`,
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

  const listingHtml = await fetchHtml(RTL_NEWS_URL);
  const topArticle = extractTopArticle(listingHtml);
  if (!topArticle) {
    throw new Error("No suitable article found on listing page");
  }

  const articleHtml = await fetchHtml(topArticle.url);

  const payload = await generateQuestionPayload(listingHtml, articleHtml, {
    listingUrl: RTL_NEWS_URL,
    article: topArticle,
    dateKey,
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
